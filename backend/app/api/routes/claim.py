from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from app.models.claim import Claim
from app.models.user import User
from app.api.deps import get_current_user
from app.services import zone_pool

from app.db.session import get_db
from app.services.claim_service import create_claim, auto_claim_logic
from app.utils.weather_api import get_weather_data, get_aqi_data

import random
from datetime import datetime, timedelta

router = APIRouter(prefix="/claims", tags=["Claims"])


COOLDOWN_MINUTES = 10   # one auto payout per worker per 10 minutes (protects the pool)


@router.post("/auto")
def auto_claim(
    request: dict = Body(default={}),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # The logged-in worker is always the claimant. user_id / city in the body are ignored.
    user_id = user.id
    city = user.location or "Hyderabad"
    trigger = request.get("trigger")
    zone = zone_pool.zone_of_user(user)

    # 1. Only workers with an active (paid, unexpired) plan can be paid
    policy = zone_pool.active_policy(db, user_id)
    if not policy:
        return {
            "message": "No active plan. Choose a plan first.",
            "claim_id": None, "city": city, "amount": 0,
            "reason": "No active plan", "risk_score": 0, "status": "rejected",
            "fraud": False, "fraud_reason": "No active policy",
            "payment_status": "failed", "payment": None,
        }

    # 2. Cooldown
    last = (
        db.query(Claim)
        .filter(Claim.user_id == user_id, Claim.status == "approved")
        .order_by(Claim.id.desc())
        .first()
    )
    if last and last.created_at and datetime.utcnow() - last.created_at < timedelta(minutes=COOLDOWN_MINUTES):
        return {
            "message": "A payout was already sent recently.",
            "claim_id": None, "city": city, "amount": 0,
            "reason": "Recent payout already sent", "risk_score": 0, "status": "rejected",
            "fraud": False, "fraud_reason": "Cooldown",
            "payment_status": "failed", "payment": None,
        }

    try:
        weather = get_weather_data(city) or {}
        aqi = get_aqi_data(city) or 100

        temp = weather.get("temp", 30)
        rain = weather.get("rain", 0)
        condition = weather.get("condition", "clear")

        if trigger == "rain":
            orders = random.randint(1, 4)
            rain = max(rain, 60)
        elif trigger == "heat":
            orders = random.randint(2, 5)
            temp = max(temp, 42)
        elif trigger == "pollution":
            orders = random.randint(1, 3)
            aqi = max(aqi, 180)
        elif trigger == "curfew":
            orders = 0
            aqi = max(aqi, 320)
        else:
            orders = random.randint(8, 15)

        is_curfew = (temp > 45 or aqi > 300)

        weather_data = {"type": "rain" if rain > 0 else condition, "temp": temp, "rain": rain}

        amount, reason, risk_score = auto_claim_logic(weather_data, aqi, orders, is_curfew)

        if amount <= 0:
            return {
                "message": "No claim triggered",
                "claim_id": None, "city": city, "amount": 0, "reason": reason,
                "risk_score": risk_score, "status": "rejected", "fraud": False,
                "fraud_reason": "Low risk / No trigger",
                "payment_status": "failed", "payment": None,
                "weather": {"temp": temp, "rain": rain, "condition": condition},
                "aqi": aqi, "orders": orders
            }

        # Never pay more than the plan's coverage
        amount = min(amount, policy.coverage)

        claim, fraud_reason, payment_data = create_claim(
            db=db, user_id=user_id, trigger=reason, risk_score=risk_score, amount=amount
        )

        # The payout is taken from the worker's zone pool
        paid_from_pool = 0.0
        if claim.status == "approved":
            paid_from_pool = zone_pool.pay_from_pool(db, zone, user_id, claim.amount, reason)

        payment_status = "success" if claim and claim.status == "approved" else "failed"

        if payment_data:
            payment_data["time"] = datetime.now().strftime("%d %b %Y, %I:%M %p")

        return {
            "message": "🔥 Fully Automated AI Claim",
            "claim_id": claim.id,
            "city": city,
            "amount": claim.amount,
            "paid_from_pool": paid_from_pool,
            "pool_balance": round(zone_pool.balance(db, zone), 2),
            "reason": reason,
            "risk_score": risk_score,
            "status": claim.status,
            "fraud": claim.is_fraud,
            "fraud_reason": fraud_reason,
            "payment_status": payment_status,
            "payment": payment_data,
            "weather": {"temp": temp, "rain": rain, "condition": condition},
            "aqi": aqi,
            "orders": orders,
            "trigger": trigger
        }

    except Exception as e:
        db.rollback()
        print("❌ ERROR:", str(e))
        return {"message": "Server error", "error": str(e), "status": "failed", "payment": None}


@router.get("/recent")
def get_recent_claims(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    claims = (
        db.query(Claim)
        .filter(Claim.user_id == user.id)
        .order_by(Claim.id.desc())
        .limit(5)
        .all()
    )

    return [
        {
            "type": c.trigger_type,
            "amount": c.amount,
            "date": c.created_at.strftime("%d %b")
        }
        for c in claims
    ]


@router.get("/weather/{city}")
def get_weather(city: str):
    from app.utils.weather_api import get_weather_data, get_aqi_data

    weather = get_weather_data(city) or {}
    aqi = get_aqi_data(city) or 100

    return {
        "temp": weather.get("temp", 30),
        "rain": weather.get("rain", 0),
        "condition": weather.get("condition", "clear"),
        "aqi": aqi
    }


@router.post("/risk")
def calculate_risk(data: dict):

    weather = data.get("weather")
    aqi = data.get("aqi")

    if not weather or aqi is None:
        return {"error": "Missing input"}

    level = ""
    reason = ""

    if weather == "rain" and aqi > 150:
        level = "High"
        reason = "Rain + poor air quality"

    elif weather == "rain":
        level = "Medium"
        reason = "Rain disruption possible"

    elif weather == "heat":
        level = "Medium"
        reason = "Extreme heat fatigue"

    elif aqi > 150:
        level = "High"
        reason = "Severe pollution"

    else:
        level = "Low"
        reason = "Normal environment"

    return {
        "risk": level,
        "reason": reason
    }
