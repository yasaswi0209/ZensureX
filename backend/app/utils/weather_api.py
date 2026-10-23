import os
from urllib.parse import quote

import requests

WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
AQI_API_KEY = os.getenv("AQI_API_KEY")

OWM_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
OWM_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"
WAQI_URL = "https://api.waqi.info/feed"

RAIN_CONDITIONS = ("Rain", "Drizzle", "Thunderstorm")
TIMEOUT = 8


def _fallback():
    # "fallback": True lets the caller know real data was not available
    return {"rain": 0, "rain_mm": 0, "temp": 30, "humidity": 50, "fallback": True}


def _parse_current(res: dict):
    """Turn an OpenWeather 'current weather' response into our format."""
    if "main" not in res:
        print("Weather lookup failed:", res)
        return _fallback()

    condition = (res.get("weather") or [{}])[0].get("main", "")
    rain_mm = res.get("rain", {}).get("1h", 0) or 0
    rain = 1 if (rain_mm > 0 or condition in RAIN_CONDITIONS) else 0

    return {
        "rain": rain,
        "rain_mm": rain_mm,
        "temp": res["main"]["temp"],
        "humidity": res["main"]["humidity"],
    }


# ---------------------------------------------------------------- weather ---

def get_weather_data(city: str):
    """Current weather by city name."""
    try:
        res = requests.get(
            OWM_WEATHER_URL,
            params={"q": f"{city},IN", "appid": WEATHER_API_KEY, "units": "metric"},
            timeout=TIMEOUT,
        ).json()
    except Exception as e:
        print("Weather API error:", e)
        return _fallback()

    return _parse_current(res)


def get_weather_by_coords(lat: float, lon: float):
    """Current weather by GPS coordinates (more accurate than a city name)."""
    try:
        res = requests.get(
            OWM_WEATHER_URL,
            params={"lat": lat, "lon": lon, "appid": WEATHER_API_KEY, "units": "metric"},
            timeout=TIMEOUT,
        ).json()
    except Exception as e:
        print("Weather API (coords) error:", e)
        return _fallback()

    return _parse_current(res)


# -------------------------------------------------------------------- AQI ---

def _fetch_aqi(path: str):
    try:
        res = requests.get(
            f"{WAQI_URL}/{path}/",
            params={"token": AQI_API_KEY},
            timeout=TIMEOUT,
        ).json()
        if res.get("status") == "ok":
            aqi = res["data"].get("aqi", 100)
            return aqi if isinstance(aqi, (int, float)) else 100
        print("AQI lookup failed:", res)
    except Exception as e:
        print("AQI API error:", e)
    return 100


def get_aqi_data(city: str):
    """Air quality index by city name."""
    return _fetch_aqi(quote(city))


def get_aqi_by_coords(lat: float, lon: float):
    """Air quality index by GPS coordinates."""
    return _fetch_aqi(f"geo:{lat};{lon}")


# --------------------------------------------------------------- forecast ---

def get_weather_forecast(city: str):
    """Next forecast slot (about 3 hours ahead) by city name."""
    try:
        res = requests.get(
            OWM_FORECAST_URL,
            params={"q": f"{city},IN", "appid": WEATHER_API_KEY, "units": "metric"},
            timeout=TIMEOUT,
        ).json()
        if "list" not in res:
            print("Forecast lookup failed:", res)
            return _fallback()

        nxt = res["list"][1]
        condition = (nxt.get("weather") or [{}])[0].get("main", "")
        rain_mm = nxt.get("rain", {}).get("3h", 0) or 0
        rain = 1 if (rain_mm > 0 or condition in RAIN_CONDITIONS) else 0

        return {
            "temp": nxt["main"]["temp"],
            "humidity": nxt["main"]["humidity"],
            "rain": rain,
            "rain_mm": rain_mm,
        }
    except Exception as e:
        print("Forecast API error:", e)
        return _fallback()
