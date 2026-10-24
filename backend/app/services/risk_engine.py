import time
from app.utils.weather_api import get_weather_data, get_aqi_data

STORM_IDS = range(200, 233)
WET_IDS = (501, 502, 503, 504, 511, 521, 522, 531)

LEVELS = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
LEVEL_NAMES = ["LOW", "MEDIUM", "HIGH"]
PLAN_FOR_LEVEL = {"LOW": "Basic", "MEDIUM": "Moderate", "HIGH": "Premium"}

# Price band per risk level (INR per week)
BANDS = {"LOW": (20, 30), "MEDIUM": (30, 42), "HIGH": (42, 52)}

CACHE_TTL = 300  # seconds (5 minutes)

# ---------- small in-memory cache ----------
_cache = {}


def cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    value = fn()
    # Don't keep estimated/fallback data, so live data is retried next time
    if not (isinstance(value, dict) and value.get("fallback")):
        _cache[key] = (time.time(), value)
    return value


def get_conditions(city: str):
    """Weather + AQI for a city, cached for CACHE_TTL seconds."""
    weather = cached(f"weather:{city}", CACHE_TTL, lambda: get_weather_data(city)) or {}
    aqi = cached(f"aqi:{city}", CACHE_TTL, lambda: get_aqi_data(city))
    return dict(weather), (aqi or 100)


# ---------- THE single risk function ----------
def assess(temp, rain_mm=0, cond_id=800, aqi=0, pop=0):
    """Return risk level, total points and the factors that caused them."""
    cond_id = cond_id or 800
    rain_mm = rain_mm or 0
    factors = []

    def add(key, label, points):
        factors.append({"key": key, "label": label, "points": points})

    # Heat / cold
    if temp > 45:
        add("heat", "Extreme heat (above 45°C)", 4)
    elif temp > 40:
        add("heat", "Very hot (above 40°C)", 3)
    elif temp > 35:
        add("heat", "Hot (above 35°C)", 1)
    elif temp < 5:
        add("cold", "Very cold (below 5°C)", 3)
    elif temp < 15:
        add("cold", "Cold (below 15°C)", 1)

    # Rain / storm (worst one counts)
    if cond_id in STORM_IDS:
        add("rain", "Thunderstorm", 4)
    elif rain_mm > 7.5:
        add("rain", "Heavy rain (above 7.5 mm/h)", 4)
    elif rain_mm > 2.5 or cond_id in WET_IDS:
        add("rain", "Moderate rain (above 2.5 mm/h)", 2)
    elif rain_mm > 0:
        add("rain", "Light rain", 1)

    # Air quality
    if aqi > 200:
        add("aqi", "Very poor air (AQI above 200)", 3)
    elif aqi > 100:
        add("aqi", "Poor air (AQI above 100)", 2)

    # Rain probability (forecast slots only)
    if (pop or 0) >= 60:
        add("pop", "High chance of rain (60% or more)", 1)

    points = sum(f["points"] for f in factors)
    level = "HIGH" if points >= 4 else "MEDIUM" if points >= 2 else "LOW"
    return {"level": level, "points": points, "factors": factors}


def worst(*levels):
    return LEVEL_NAMES[max(LEVELS.get(l, 0) for l in levels)]
