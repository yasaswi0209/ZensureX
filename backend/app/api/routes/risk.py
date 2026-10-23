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
)

router = APIRouter()

# DEMO CONTROL
DEMO_MODE = False
DEMO_SCENARIO = "HIGH"   # LOW / MEDIUM / HIGH

LEVELS = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}


def live_level(temp, rain_mm, aqi):
    """Minimum risk level implied by current conditions."""
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

    # Live data: GPS if given, else city
    if lat is not None and lon is not None:
        weather = get_weather_by_coords(lat, lon)
        aqi = get_aqi_by_coords(lat, lon)
    else:
        weather = get_weather_data(display_city)
        aqi = get_aqi_data(display_city)

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
        explanation.append("No significant rainfall expected")

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

    if risk == "HIGH":
        recommendation = "Premium Plan Recommended"
        explanation.append("High risk → higher premium 🔴")
    elif risk == "MEDIUM":
        recommendation = "Moderate Plan Recommended"
        explanation.append("Moderate risk → balanced pricing 🟡")
    else:
        recommendation = "Basic Plan Recommended"
        explanation.append("Low risk → lower premium 🟢")

    return {
        "city": display_city,
        "location_source": "gps" if used_gps else "saved_city",
        "risk": risk,
        "weather": weather,
        "aqi": aqi,
        "ml_price": ml_price,
        "reason": " | ".join(explanation),
        "recommendation": recommendation,
        "data_fallback": bool(weather.get("fallback")),
    }
