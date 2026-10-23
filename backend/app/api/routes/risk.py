from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.api.deps import get_current_user
from app.ml.premium_model import calculate_premium
from app.utils.weather_api import (
    get_weather_data,
    get_aqi_data,
    get_weather_by_coords,
    get_aqi_by_coords,
    get_forecast_by_coords,
    get_forecast_by_city,
)

router = APIRouter()

# DEMO CONTROL
DEMO_MODE = False
DEMO_SCENARIO = "HIGH"   # LOW / MEDIUM / HIGH

LEVELS = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
LEVEL_NAMES = ["LOW", "MEDIUM", "HIGH"]
PLAN_FOR_LEVEL = {"LOW": "Basic", "MEDIUM": "Moderate", "HIGH": "Premium"}


def live_level(temp, rain_mm, aqi):
    """Minimum risk level implied by the given conditions."""
    level = "LOW"
    if rain_mm > 2.5 or temp > 35 or aqi > 150:
        level = "MEDIUM"                      # orange
    if (
        rain_mm > 7.5
        or temp > 40
        or aqi > 200
        or (rain_mm > 2.5 and (temp > 35 or aqi > 150))
    ):
        level = "HIGH"                        # red
    return level


def worst(*levels):
    return LEVEL_NAMES[max(LEVELS.get(l, 0) for l in levels)]


def slot_note(label, slot):
    parts = []
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

    # Pricing always uses the saved profile city
    pricing_city = "Hyderabad" if DEMO_MODE else saved_city
    display_city = city or pricing_city

    # Live data and forecast: GPS if given, else city
    if used_gps:
        weather = get_weather_by_coords(lat, lon)
        aqi = get_aqi_by_coords(lat, lon)
        forecast = get_forecast_by_coords(lat, lon)
    else:
        weather = get_weather_data(display_city)
        aqi = get_aqi_data(display_city)
        forecast = get_forecast_by_city(display_city)

    # Demo override
    if DEMO_MODE:
        if DEMO_SCENARIO == "LOW":
            weather.update(temp=28, rain=0, rain_mm=0)
            aqi = 80
        elif DEMO_SCENARIO == "MEDIUM":
            weather.update(temp=36, rain=0, rain_mm=0)
            aqi = 150
        elif DEMO_SCENARIO == "HIGH":
            weather.update(temp=42, rain=1, rain_mm=8)
            aqi = 250
        demo_slot = {
            "temp": weather["temp"], "humidity": 50, "rain": weather["rain"],
            "rain_mm": weather["rain_mm"], "pop": 50, "dt": None,
        }
        forecast = {"h3": dict(demo_slot), "h6": dict(demo_slot)}

    temp = weather.get("temp", 30)
    rain_mm = weather.get("rain_mm", 0) or 0   # mm per hour

    explanation = []

    if temp > 40:
        explanation.append("Extreme heat (>40°C) increases fatigue risk")
    elif temp > 35:
        explanation.append("High temperature affects worker performance")
    else:
        explanation.append("Temperature is within safe range")

    if rain_mm > 7.5:
        explanation.append("Heavy rain (>7.5 mm/h) raises delay and accident risk")
    elif rain_mm > 2.5:
        explanation.append("Moderate rain (>2.5 mm/h) may cause delays")
    else:
        explanation.append("No significant rainfall right now")

    if aqi > 200:
        explanation.append("Severe pollution impacts health")
    elif aqi > 150:
        explanation.append("Unhealthy air quality detected")
    elif aqi > 100:
        explanation.append("Moderate pollution detected")
    else:
        explanation.append("Air quality is safe")

    # ML core (priced on saved city)
    premium_data = calculate_premium(pricing_city)
    ml_price = premium_data["premium"]
    risk = premium_data["risk_level"]

    # Live conditions set a minimum level; ML can only raise it
    live = live_level(temp, rain_mm, aqi)
    if LEVELS[live] > LEVELS.get(risk, 0):
        risk = live

    # Forecast risk for the next 3h and 6h (AQI stays at the current value)
    forecast_out = None
    outlook_notes = []
    if forecast:
        forecast_out = {}
        for key, label in (("h3", "Next 3h"), ("h6", "Next 6h")):
            slot = dict(forecast[key])
            slot["risk"] = live_level(slot["temp"], slot["rain_mm"], aqi)
            forecast_out[key] = slot
            outlook_notes.append(slot_note(label, slot))

    # Outlook = worst of now, +3h and +6h. Plan recommendation and price follow it.
    outlook_risk = risk
    if forecast_out:
        outlook_risk = worst(risk, forecast_out["h3"]["risk"], forecast_out["h6"]["risk"])

    # If the forecast is worse than now, price goes up 10% per level
    steps = max(0, LEVELS[outlook_risk] - LEVELS.get(risk, 0))
    price = round(ml_price * (1 + 0.10 * steps))

    recommended_plan = PLAN_FOR_LEVEL[outlook_risk]

    if outlook_risk == "HIGH":
        explanation.append("High risk ahead → higher premium 🔴")
    elif outlook_risk == "MEDIUM":
        explanation.append("Moderate risk ahead → balanced pricing 🟡")
    else:
        explanation.append("Low risk ahead → lower premium 🟢")

    return {
        "city": display_city,
        "location_source": "gps" if used_gps else "saved_city",
        "risk": risk,
        "weather": weather,
        "aqi": aqi,
        "ml_price": ml_price,
        "price": price,
        "forecast": forecast_out,                  # None if forecast unavailable
        "forecast_available": forecast_out is not None,
        "outlook_risk": outlook_risk,
        "outlook_notes": outlook_notes,
        "recommended_plan": recommended_plan,
        "reason": " | ".join(explanation),
        "recommendation": f"{recommended_plan} Plan Recommended",
        "data_fallback": bool(weather.get("fallback")),
    }
