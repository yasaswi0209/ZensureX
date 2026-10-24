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


def slot_note(label, slot):
    parts = []
    if slot.get("condition_id") in STORM_IDS:
        parts.append("thunderstorm")
    if slot["rain_mm"] > 0:
        parts.append(f"rain {slot['rain_mm']:.1f} mm/h")
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
            weather.update(temp=28, rain=0, rain_mm=0, condition="Clear", condition_id=800)
            aqi = 80
        elif DEMO_SCENARIO == "MEDIUM":
            weather.update(temp=36, rain=0, rain_mm=0, condition="Clear", condition_id=800)
            aqi = 150
        elif DEMO_SCENARIO == "HIGH":
            weather.update(temp=42, rain=1, rain_mm=8, condition="Rain", condition_id=502)
            aqi = 250
        demo_slot = {
            "temp": weather["temp"], "humidity": 50, "rain": weather["rain"],
            "rain_mm": weather["rain_mm"], "pop": 50, "dt": None,
            "condition": weather.get("condition", ""),
            "condition_id": weather.get("condition_id", 800),
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
    risk = premium_data["risk_level"]

    # Forecast risk for the next 3h and 6h (same function, AQI not forecast)
    forecast_out = None
    outlook_notes = []
    if forecast:
        forecast_out = {}
        for key, label in (("h3", "Next 3h"), ("h6", "Next 6h")):
            slot = dict(forecast[key])
            slot["risk"] = assess(
                slot["temp"],
                slot["rain_mm"],
                slot.get("condition_id", 800),
                0,
                slot.get("pop", 0),
            )["level"]
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

    reason = (
        " | ".join(f["label"] for f in premium_data["breakdown"])
        or "Normal conditions"
    )

    return {
        "city": display_city,
        "pricing_city": pricing_city,
        "location_source": "gps" if used_gps else "saved_city",
        "zone": zone_pool.zone_of_user(db_user),
        "risk": risk,
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
