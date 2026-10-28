from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.api.deps import get_current_user
from app.ml.premium_model import calculate_premium
from app.services import zone_pool
from app.services.risk_engine import (
    assess,
    worst,
    cached,
    get_conditions,
    LEVELS,
    PLAN_FOR_LEVEL,
    STORM_IDS,
    CACHE_TTL,
)
from app.utils.alerts_api import get_alert_for_location
from app.utils.weather_api import (
    get_weather_by_coords,
    get_aqi_by_coords,
    get_forecast_by_coords,
    get_forecast_by_city,
)

router = APIRouter()

# DEMO CONTROL
DEMO_MODE = False
DEMO_SCENARIO = "HIGH"   # LOW / MEDIUM / HIGH

# TEST ONLY: fakes a thunderstorm for every user. Keep False in production.
TEST_STORM = False

# TEST ONLY: fakes an official cyclone alert for everyone. Keep False in production.
TEST_ALERT = False


def storm_level(w):
    """
    Risk from wind, gusts and rain that already fell in the last 24h.
    Works on both current weather and forecast slots (missing keys count as 0).
    Thresholds: 62 km/h is the IMD cyclonic storm limit, 64.5 mm/24h is IMD "heavy rain".
    Tune these numbers for your zones.
    """
    wind = w.get("wind_kmh") or 0
    gust = w.get("gust_kmh") or 0
    r24 = w.get("rain_24h") or 0
    if wind >= 50 or gust >= 60 or r24 >= 64.5:
        return "HIGH"
    if wind >= 30 or gust >= 40 or r24 >= 15.6:
        return "MEDIUM"
    return "LOW"


def storm_reasons(w):
    """Short human-readable reasons, shown on the dashboard."""
    out = []
    if (w.get("gust_kmh") or 0) >= 40:
        out.append(f"gusts {w['gust_kmh']:.0f} km/h")
    elif (w.get("wind_kmh") or 0) >= 30:
        out.append(f"wind {w['wind_kmh']:.0f} km/h")
    if (w.get("rain_24h") or 0) >= 15.6:
        out.append(f"24h rain {w['rain_24h']:.0f} mm")
    return out


def slot_note(label, slot):
    parts = []
    if slot.get("condition_id") in STORM_IDS:
        parts.append("thunderstorm")
    if slot["rain_mm"] > 0:
        parts.append(f"rain {slot['rain_mm']:.1f} mm/h")
    if (slot.get("gust_kmh") or 0) >= 40:
        parts.append(f"gusts {slot['gust_kmh']:.0f} km/h")
    parts.append(f"{slot['temp']:.0f}°C")
    return f"{label}: {', '.join(parts)} → {slot['risk']}"


@router.get("/")
def get_risk(
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
    city: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_user = db.query(User).filter(User.id == current_user.id).first()
    if not db_user:
        raise Exception("User not found")

    saved_city = getattr(db_user, "location", None) or "Hyderabad"
    used_gps = lat is not None and lon is not None

    # Remember where the worker is, so they join the pool of that area
    try:
        if used_gps:
            zone_pool.save_user_position(db, db_user, lat, lon)
    except Exception as e:
        db.rollback()
        print("Zone save failed:", e)

    # Pricing always uses the saved profile city
    pricing_city = "Hyderabad" if DEMO_MODE else saved_city
    display_city = city or pricing_city

    # One cached fetch for the saved (pricing) city
    pricing_weather, pricing_aqi = get_conditions(pricing_city)

    # Display data: GPS if given, else reuse the cached city data
    if used_gps:
        weather = get_weather_by_coords(lat, lon)
        aqi = get_aqi_by_coords(lat, lon)
        forecast = get_forecast_by_coords(lat, lon)
    else:
        if display_city == pricing_city:
            weather, aqi = dict(pricing_weather), pricing_aqi
        else:
            weather, aqi = get_conditions(display_city)
        forecast = cached(
            f"forecast:{display_city}",
            CACHE_TTL,
            lambda: get_forecast_by_city(display_city),
        )

    # Work on copies so demo/test edits never touch the cache
    weather = dict(weather or {})
    pricing_weather = dict(pricing_weather or {})

    # Demo override (affects both the display and the price)
    if DEMO_MODE:
        if DEMO_SCENARIO == "LOW":
            weather.update(temp=28, rain=0, rain_mm=0, condition="Clear", condition_id=800,
                           wind_kmh=5, gust_kmh=8, rain_24h=0)
            aqi = 80
        elif DEMO_SCENARIO == "MEDIUM":
            weather.update(temp=36, rain=0, rain_mm=0, condition="Clear", condition_id=800,
                           wind_kmh=15, gust_kmh=20, rain_24h=0)
            aqi = 150
        elif DEMO_SCENARIO == "HIGH":
            weather.update(temp=42, rain=1, rain_mm=8, condition="Rain", condition_id=502,
                           wind_kmh=55, gust_kmh=75, rain_24h=70)
            aqi = 250
        demo_slot = {
            "temp": weather["temp"], "humidity": 50, "rain": weather["rain"],
            "rain_mm": weather["rain_mm"], "pop": 50, "dt": None,
            "condition": weather.get("condition", ""),
            "condition_id": weather.get("condition_id", 800),
            "wind_kmh": weather.get("wind_kmh", 0),
            "gust_kmh": weather.get("gust_kmh", 0),
        }
        forecast = {"h3": dict(demo_slot), "h6": dict(demo_slot)}

        # Make the price follow the demo scenario too
        pricing_weather = dict(weather)
        pricing_aqi = aqi

    # TEST ONLY: fake thunderstorm (turn on with TEST_STORM = True)
    if TEST_STORM:
        for w in (weather, pricing_weather):
            w["condition_id"] = 211
            w["condition"] = "Thunderstorm"
            w["description"] = "thunderstorm"
            w["rain"] = 1

    # Price is built from the saved city, using the same single risk function
    premium_data = calculate_premium(pricing_city, pricing_weather, pricing_aqi)
    ml_price = premium_data["premium"]

    # Risk now = the model's result OR the wind / 24h-rain result, whichever is worse
    model_risk = premium_data["risk_level"]
    storm_now = storm_level(weather)

    # Official alerts (IMD / NDMA SACHET) for THIS user's GPS location
    alert = {"level": "LOW", "alerts": [], "debug": {}}
    if used_gps:
        alert = get_alert_for_location(lat, lon)
    if TEST_ALERT:
        alert = {
            "level": "HIGH",
            "alerts": [{"headline": "TEST: Cyclone warning for Andhra Pradesh coast", "event": "Cyclone",
                        "severity": "Severe", "level": "HIGH", "source": "TEST", "expires": None}],
            "debug": {},
        }

    risk = worst(model_risk, storm_now, alert["level"])

    # Forecast risk for the next 3h and 6h (same functions, AQI not forecast)
    forecast_out = None
    outlook_notes = []
    if forecast:
        forecast_out = {}
        for key, label in (("h3", "Next 3h"), ("h6", "Next 6h")):
            slot = dict(forecast[key])
            slot["risk"] = worst(
                assess(
                    slot["temp"],
                    slot["rain_mm"],
                    slot.get("condition_id", 800),
                    0,
                    slot.get("pop", 0),
                )["level"],
                # a slot has wind and gusts but no 24h rain, so reuse the current 24h total
                storm_level({**slot, "rain_24h": weather.get("rain_24h", 0)}),
            )
            forecast_out[key] = slot
            outlook_notes.append(slot_note(label, slot))

    # Outlook = worst of now, +3h and +6h
    outlook_risk = risk
    if forecast_out:
        outlook_risk = worst(
            risk, forecast_out["h3"]["risk"], forecast_out["h6"]["risk"]
        )

    # Forecast worse than now: price rises 10% per level
    steps = max(0, LEVELS[outlook_risk] - LEVELS[risk])
    price = round(ml_price * (1 + 0.10 * steps))
    recommended_plan = PLAN_FOR_LEVEL[outlook_risk]

    # Reason text: wind / 24h rain first, then the model's own reasons
    reason_parts = (
        [a["headline"] for a in alert["alerts"][:1]]
        + storm_reasons(weather)
        + [f["label"] for f in premium_data["breakdown"]]
    )
    reason = " | ".join(reason_parts) or "Normal conditions"

    return {
        "city": display_city,
        "pricing_city": pricing_city,
        "location_source": "gps" if used_gps else "saved_city",
        "zone": zone_pool.zone_of_user(db_user),
        "risk": risk,
        "model_risk": model_risk,
        "storm_risk": storm_now,
        "alert_level": alert["level"],
        "alerts": alert["alerts"],
        "risk_points": premium_data["risk_points"],
        "breakdown": premium_data["breakdown"],
        "band": premium_data["band"],
        "weather": weather,
        "aqi": aqi,
        "ml_price": ml_price,
        "price": price,
        "price_uplift_pct": steps * 10,
        "forecast": forecast_out,
        "forecast_available": forecast_out is not None,
        "outlook_risk": outlook_risk,
        "outlook_notes": outlook_notes,
        "recommended_plan": recommended_plan,
        "reason": reason,
        "recommendation": f"{recommended_plan} Plan Recommended",
        "data_fallback": bool(weather.get("fallback")),
    }


@router.get("/alerts")
def alerts_for(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    current_user: User = Depends(get_current_user),
):
    """Test endpoint: official alerts for one GPS point."""
    return get_alert_for_location(lat, lon)
