import os
import joblib
from app.services.risk_engine import assess, get_conditions, BANDS

_MODEL = None
_MODEL_LOADED = False


def load_model():
    """Load the ML model once, not on every request."""
    global _MODEL, _MODEL_LOADED
    if _MODEL_LOADED:
        return _MODEL
    try:
        path = os.path.join(os.path.dirname(__file__), "premium_model.pkl")
        _MODEL = joblib.load(path)
    except Exception as e:
        print("MODEL LOAD ERROR:", e)
        _MODEL = None
    _MODEL_LOADED = True
    return _MODEL


def calculate_premium(city: str, weather=None, aqi=None):
    if weather is None:
        weather, aqi = get_conditions(city)
    if aqi is None:
        aqi = 100

    temp = weather.get("temp", 30)
    humidity = weather.get("humidity", 50)
    rain = weather.get("rain", 0)
    rain_mm = weather.get("rain_mm", 0) or 0
    cond_id = weather.get("condition_id", 800)

    # 1. Risk level from the single shared function
    result = assess(temp, rain_mm, cond_id, aqi)
    level = result["level"]

    # 2. ML probability decides the exact spot inside the band
    model = load_model()
    if model is None:
        risk_score = 0.5
    else:
        try:
            risk_score = float(model.predict([[aqi, temp, rain, humidity]])[0])
        except Exception as e:
            print("MODEL PREDICT ERROR:", e)
            risk_score = 0.5

    prob = max(0.1, min(risk_score, 0.9))
    position = (prob - 0.1) / 0.8  # 0.0 to 1.0

    low, high = BANDS[level]
    premium = round(low + position * (high - low), 2)

    return {
        "premium": premium,
        "aqi": aqi,
        "temp": temp,
        "rain": rain,
        "humidity": humidity,
        "risk_score": risk_score,
        "risk_level": level,
        "risk_points": result["points"],
        "breakdown": result["factors"],
        "band": [low, high],
    }
