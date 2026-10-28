import os
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import requests

WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
AQI_API_KEY = os.getenv("AQI_API_KEY")

OWM_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
OWM_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"
WAQI_URL = "https://api.waqi.info/feed"

OM_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OM_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"

RAIN_CONDITIONS = ("Rain", "Drizzle", "Thunderstorm")
TIMEOUT = 8

# city name -> (lat, lon), so we only look each city up once
_GEO_CACHE = {}


def _kmh(ms):
    """OpenWeather gives wind in m/s. Convert to km/h."""
    return round(float(ms or 0) * 3.6, 1)


def _fallback():
    # "fallback": True lets the caller know real data was not available
    return {
        "rain": 0,
        "rain_mm": 0,
        "temp": 30,
        "humidity": 50,
        "condition": "",
        "condition_id": 800,
        "wind_kmh": 0,
        "gust_kmh": 0,
        "rain_24h": 0,
        "fallback": True,
    }


def _parse_current(res: dict):
    """Turn an OpenWeather 'current weather' response into our format."""
    if "main" not in res:
        print("Weather lookup failed:", res)
        return _fallback()

    w0 = (res.get("weather") or [{}])[0]
    condition = w0.get("main", "")
    cond_id = w0.get("id", 800)
    rain_mm = (res.get("rain") or {}).get("1h", 0) or 0
    rain = 1 if (rain_mm > 0 or condition in RAIN_CONDITIONS) else 0

    wind = res.get("wind") or {}
    wind_kmh = _kmh(wind.get("speed"))
    gust_kmh = _kmh(wind.get("gust") or wind.get("speed"))

    return {
        "rain": rain,
        "rain_mm": rain_mm,
        "temp": res["main"]["temp"],
        "humidity": res["main"]["humidity"],
        "condition": condition,          # e.g. "Rain", "Thunderstorm"
        "condition_id": cond_id,         # e.g. 501, 211
        "description": w0.get("description", ""),
        "wind_kmh": wind_kmh,
        "gust_kmh": max(gust_kmh, wind_kmh),
        "rain_24h": 0,                   # filled in later from Open-Meteo
    }


# ---------------------------------------------------------------- weather ---

def _wmo_text(code):
    """Open-Meteo (WMO) weather code -> short description for the dashboard chip."""
    code = int(code or 0)
    if code in (95, 96, 99):
        return "thunderstorm"
    if code in (65, 82):
        return "heavy rain"
    if code in (63, 81):
        return "moderate rain"
    if code in (61, 80):
        return "light rain"
    if code in (51, 53, 55, 56, 57):
        return "drizzle"
    if code in (66, 67):
        return "freezing rain"
    if code in (71, 73, 75, 77, 85, 86):
        return "snow"
    if code in (45, 48):
        return "fog"
    if code in (1, 2):
        return "partly cloudy"
    if code == 3:
        return "overcast clouds"
    return "clear sky"


def _open_meteo_current(lat: float, lon: float):
    """Current weather from Open-Meteo, used to double-check OpenWeather. None on failure."""
    try:
        res = requests.get(
            OM_FORECAST_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m",
                "timezone": "auto",
            },
            timeout=TIMEOUT,
        ).json()
        c = res["current"]
        cid, cname = _wmo_to_owm(c.get("weather_code"))
        return {
            "temp": c["temperature_2m"],
            "humidity": c.get("relative_humidity_2m"),
            "rain_mm": float(c.get("precipitation") or 0),
            "condition": cname,
            "condition_id": cid,
            "description": _wmo_text(c.get("weather_code")),
            # Open-Meteo already gives km/h
            "wind_kmh": float(c.get("wind_speed_10m") or 0),
            "gust_kmh": float(c.get("wind_gusts_10m") or 0),
        }
    except Exception as e:
        print("Open-Meteo current error:", e)
        return None


def _open_meteo_rain_24h(lat: float, lon: float):
    """Total rain (mm) that fell in the last 24 hours. 0 if the lookup fails."""
    try:
        res = requests.get(
            OM_FORECAST_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "precipitation",
                "past_hours": 24,
                "forecast_hours": 1,
                "timezone": "auto",
            },
            timeout=TIMEOUT,
        ).json()
        return round(sum(float(v or 0) for v in res["hourly"]["precipitation"]), 1)
    except Exception as e:
        print("Open-Meteo 24h rain error:", e)
        return 0


def _merge_current(ow: dict, om):
    """OpenWeather stays the base. If Open-Meteo sees rain or a storm that it missed, use it."""
    if not om:
        return ow

    om_wet = om["condition"] in RAIN_CONDITIONS or om["rain_mm"] > 0
    om_storm = 200 <= om["condition_id"] <= 232

    # OpenWeather was down: use Open-Meteo completely
    if ow.get("fallback"):
        return {
            "rain": 1 if om_wet else 0,
            "rain_mm": om["rain_mm"],
            "temp": om["temp"],
            "humidity": om["humidity"] if om["humidity"] is not None else 50,
            "condition": om["condition"],
            "condition_id": om["condition_id"],
            "description": om["description"],
            "wind_kmh": om.get("wind_kmh") or 0,
            "gust_kmh": om.get("gust_kmh") or 0,
            "rain_24h": 0,
        }

    ow_wet = ow.get("rain") == 1
    ow_storm = 200 <= (ow.get("condition_id") or 800) <= 232

    if (om_storm and not ow_storm) or (om_wet and not ow_wet):
        ow["condition"] = om["condition"]
        ow["condition_id"] = om["condition_id"]
        ow["description"] = om["description"]

    ow["rain_mm"] = max(ow.get("rain_mm") or 0, om["rain_mm"])
    ow["rain"] = 1 if (ow_wet or om_wet) else 0

    # take the stronger wind of the two sources
    ow["wind_kmh"] = max(ow.get("wind_kmh") or 0, om.get("wind_kmh") or 0)
    ow["gust_kmh"] = max(ow.get("gust_kmh") or 0, om.get("gust_kmh") or 0)
    return ow


def get_weather_data(city: str):
    """Current weather by city name."""
    try:
        res = requests.get(
            OWM_WEATHER_URL,
            params={"q": f"{city},IN", "appid": WEATHER_API_KEY, "units": "metric"},
            timeout=TIMEOUT,
        ).json()
        ow = _parse_current(res)
    except Exception as e:
        print("Weather API error:", e)
        ow = _fallback()

    coords = _geocode_city(city)
    om = _open_meteo_current(coords[0], coords[1]) if coords else None
    weather = _merge_current(ow, om)
    weather["rain_24h"] = _open_meteo_rain_24h(coords[0], coords[1]) if coords else 0
    return weather


def get_weather_by_coords(lat: float, lon: float):
    """Current weather by GPS coordinates (more accurate than a city name)."""
    try:
        res = requests.get(
            OWM_WEATHER_URL,
            params={"lat": lat, "lon": lon, "appid": WEATHER_API_KEY, "units": "metric"},
            timeout=TIMEOUT,
        ).json()
        ow = _parse_current(res)
    except Exception as e:
        print("Weather API (coords) error:", e)
        ow = _fallback()

    weather = _merge_current(ow, _open_meteo_current(lat, lon))
    weather["rain_24h"] = _open_meteo_rain_24h(lat, lon)
    return weather


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
    """Next forecast slot (about 3 hours ahead) by city name. (kept as before)"""
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
        w0 = (nxt.get("weather") or [{}])[0]
        condition = w0.get("main", "")
        rain_mm = (nxt.get("rain") or {}).get("3h", 0) or 0
        rain = 1 if (rain_mm > 0 or condition in RAIN_CONDITIONS) else 0

        wind = nxt.get("wind") or {}
        wind_kmh = _kmh(wind.get("speed"))

        return {
            "temp": nxt["main"]["temp"],
            "humidity": nxt["main"]["humidity"],
            "rain": rain,
            "rain_mm": rain_mm,
            "condition": condition,
            "condition_id": w0.get("id", 800),
            "wind_kmh": wind_kmh,
            "gust_kmh": max(_kmh(wind.get("gust")), wind_kmh),
        }
    except Exception as e:
        print("Forecast API error:", e)
        return _fallback()


# ---- Open-Meteo hourly forecast (main source) ------------------------------

def _wmo_to_owm(code):
    """Open-Meteo (WMO) weather code -> OpenWeather-style (id, name)."""
    code = int(code or 0)
    if code in (95, 96, 99):
        return 211, "Thunderstorm"
    if code == 82:
        return 522, "Rain"            # violent showers
    if code == 65:
        return 502, "Rain"            # heavy rain
    if code == 81:
        return 521, "Rain"            # moderate showers
    if code == 63:
        return 501, "Rain"            # moderate rain
    if code in (66, 67):
        return 511, "Rain"            # freezing rain
    if code == 80:
        return 520, "Rain"            # light showers
    if code == 61:
        return 500, "Rain"            # light rain
    if code in (51, 53, 55, 56, 57):
        return 300, "Drizzle"
    if code in (71, 73, 75, 77, 85, 86):
        return 601, "Snow"
    if code in (45, 48):
        return 741, "Fog"
    if code == 1:
        return 801, "Clouds"
    if code == 2:
        return 802, "Clouds"
    if code == 3:
        return 804, "Clouds"
    return 800, "Clear"


def _worst_slot(slots):
    """Pick the hour that matters most: thunderstorm, then most rain, then highest chance."""
    if not slots:
        return None
    return max(
        slots,
        key=lambda s: (200 <= s["condition_id"] <= 232, s["rain_mm"], s["pop"]),
    )


def _open_meteo_forecast(lat: float, lon: float):
    """
    Hourly forecast from Open-Meteo.
      h3 = worst hour from now to +3h
      h6 = worst hour from +4h to +6h
    Each slot also carries the STRONGEST wind and gust in its window.
    Returns None if anything goes wrong, so the caller can fall back to OpenWeather.
    """
    try:
        res = requests.get(
            OM_FORECAST_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m",
                "forecast_days": 2,
                "timezone": "auto",
            },
            timeout=TIMEOUT,
        ).json()

        h = res["hourly"]
        times = h["time"]
        offset = res.get("utc_offset_seconds", 0) or 0
    except Exception as e:
        print("Open-Meteo forecast error:", e)
        return None

    # current hour in the location's own time zone, same format as the API times
    local_now = datetime.now(timezone.utc) + timedelta(seconds=offset)
    now_key = local_now.strftime("%Y-%m-%dT%H:00")
    start = next((i for i, t in enumerate(times) if t >= now_key), 0)

    def build(i):
        cid, cname = _wmo_to_owm(h["weather_code"][i])
        mm = float(h["precipitation"][i] or 0)
        return {
            "temp": h["temperature_2m"][i],
            "humidity": h["relative_humidity_2m"][i],
            "rain": 1 if (mm > 0 or cname in RAIN_CONDITIONS) else 0,
            "rain_mm": round(mm, 2),
            "pop": int(h["precipitation_probability"][i] or 0),   # rain chance in %
            "dt": times[i],
            "condition": cname,
            "condition_id": cid,
        }

    def peak_wind(indexes):
        idx = [i for i in indexes if i < len(times)]
        if not idx:
            return 0, 0
        wind = max(float(h["wind_speed_10m"][i] or 0) for i in idx)
        gust = max(float(h["wind_gusts_10m"][i] or 0) for i in idx)
        return wind, gust

    try:
        first_idx = list(range(start, min(start + 4, len(times))))
        second_idx = list(range(start + 4, min(start + 7, len(times))))
        first = [build(i) for i in first_idx]
        second = [build(i) for i in second_idx]
    except Exception as e:
        print("Open-Meteo parse error:", e)
        return None

    h3 = _worst_slot(first)
    h6 = _worst_slot(second)
    if not h3 or not h6:
        return None

    try:
        h3["wind_kmh"], h3["gust_kmh"] = peak_wind(first_idx)
        h6["wind_kmh"], h6["gust_kmh"] = peak_wind(second_idx)
    except Exception as e:
        print("Open-Meteo wind parse error:", e)
        h3["wind_kmh"] = h3["gust_kmh"] = h6["wind_kmh"] = h6["gust_kmh"] = 0

    return {"h3": h3, "h6": h6}


def _geocode_city(city: str):
    """City name -> (lat, lon) using Open-Meteo geocoding. Cached."""
    key = (city or "").strip().lower()
    if not key:
        return None
    if key in _GEO_CACHE:
        return _GEO_CACHE[key]
    try:
        res = requests.get(
            OM_GEOCODE_URL,
            params={"name": city, "count": 1, "country_code": "IN"},
            timeout=TIMEOUT,
        ).json()
        hit = (res.get("results") or [None])[0]
        if hit:
            _GEO_CACHE[key] = (hit["latitude"], hit["longitude"])
            return _GEO_CACHE[key]
    except Exception as e:
        print("Geocode error:", e)
    return None


# ---- OpenWeather forecast (fallback) ---------------------------------------

def _parse_forecast(res: dict):
    """
    Turn an OpenWeather 5-day/3-hour forecast into two slots:
      h3 = first slot  (about the next 3 hours)
      h6 = second slot (about 3 to 6 hours ahead)
    Rain is a 3-hour total in the API, so divide by 3 to get mm/h.
    Returns None if the forecast is not available.
    """
    items = res.get("list") if isinstance(res, dict) else None
    if not items or len(items) < 2:
        print("Forecast lookup failed:", res)
        return None

    slots = []
    for item in items[:2]:
        w0 = (item.get("weather") or [{}])[0]
        condition = w0.get("main", "")
        rain_3h = (item.get("rain") or {}).get("3h", 0) or 0
        rain_mm = round(rain_3h / 3, 2)
        rain = 1 if (rain_mm > 0 or condition in RAIN_CONDITIONS) else 0

        wind = item.get("wind") or {}
        wind_kmh = _kmh(wind.get("speed"))

        slots.append({
            "temp": item["main"]["temp"],
            "humidity": item["main"]["humidity"],
            "rain": rain,
            "rain_mm": rain_mm,
            "pop": round((item.get("pop") or 0) * 100),   # rain chance in %
            "dt": item.get("dt"),                          # unix time of the slot
            "condition": condition,
            "condition_id": w0.get("id", 800),
            "wind_kmh": wind_kmh,
            "gust_kmh": max(_kmh(wind.get("gust")), wind_kmh),
        })

    return {"h3": slots[0], "h6": slots[1]}


def _owm_forecast_by_coords(lat: float, lon: float):
    try:
        res = requests.get(
            OWM_FORECAST_URL,
            params={"lat": lat, "lon": lon, "appid": WEATHER_API_KEY, "units": "metric"},
            timeout=TIMEOUT,
        ).json()
        return _parse_forecast(res)
    except Exception as e:
        print("Forecast API (coords) error:", e)
        return None


def _owm_forecast_by_city(city: str):
    try:
        res = requests.get(
            OWM_FORECAST_URL,
            params={"q": f"{city},IN", "appid": WEATHER_API_KEY, "units": "metric"},
            timeout=TIMEOUT,
        ).json()
        return _parse_forecast(res)
    except Exception as e:
        print("Forecast API (city) error:", e)
        return None


# ---- public functions (same names as before) --------------------------------

def get_forecast_by_coords(lat: float, lon: float):
    """Next 3h and 6h forecast by GPS coordinates. Open-Meteo first, OpenWeather as backup."""
    return _open_meteo_forecast(lat, lon) or _owm_forecast_by_coords(lat, lon)


def get_forecast_by_city(city: str):
    """Next 3h and 6h forecast by city name. Open-Meteo first, OpenWeather as backup."""
    coords = _geocode_city(city)
    if coords:
        data = _open_meteo_forecast(coords[0], coords[1])
        if data:
            return data
    return _owm_forecast_by_city(city)
