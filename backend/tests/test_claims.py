from sqlalchemy.orm import Session
from app.models.claim import Claim
from app.services.fraud_service import check_fraud
from app.utils.payment_gateway import process_payout


# ============================================================
# CREATE CLAIM (DB + FRAUD + PAYMENT)
# ============================================================
def create_claim(
    db: Session,
    user_id: int,
    trigger: str,
    risk_score: float,
    amount: int,
    has_active_plan: bool = True,  # TODO: replace with a real plan lookup
):

    # Fraud check (behaviour based)
    is_fraud, fraud_reason = check_fraud(
        user_id,
        amount,
        risk_score,
        trigger=trigger,
        db=db,
        has_active_plan=has_active_plan,
    )
    status = "rejected" if is_fraud else "approved"

    # Save claim
    claim = Claim(
        user_id=user_id,
        trigger_type=trigger,
        risk_score=risk_score,
        amount=amount,
        status=status,
        is_fraud=is_fraud
    )

    db.add(claim)
    db.commit()
    db.refresh(claim)

    # Payment (auto payout)
    payment_data = None

    if not is_fraud and amount > 0:
        payment_data = process_payout(user_id, amount)

    return claim, fraud_reason, payment_data


# ============================================================
# AUTO CLAIM LOGIC
# ============================================================
# covers: set of perils in the user's plan, for example {"rain", "heat", "pollution", "demand"}.
# Leave it as None to apply every trigger (old behaviour).
def auto_claim_logic(
    weather: dict,
    aqi: int,
    orders: int,
    is_curfew: bool = False,
    covers: set = None,
):

    def covered(peril: str) -> bool:
        return covers is None or peril in covers

    amount = 0
    reasons = []
    risk_score = 0

    rain = weather.get("rain", 0)
    temp = weather.get("temp", 0)

    # RAIN
    if covered("rain"):
        if 20 <= rain < 50:
            amount += 150
            risk_score += 0.2
            reasons.append("Moderate Rain 🌧️")
        elif 50 <= rain < 80:
            amount += 250
            risk_score += 0.3
            reasons.append("Heavy Rain 🌧️")
        elif rain >= 80:
            amount += 350
            risk_score += 0.4
            reasons.append("Extreme Rain 🚨")

    # HEAT
    if covered("heat"):
        if 40 <= temp < 45:
            amount += 150
            risk_score += 0.2
            reasons.append("Heatwave 🔥")
        elif temp >= 45:
            amount += 250
            risk_score += 0.3
            reasons.append("Extreme Heat 🚨")

    # AIR POLLUTION
    if covered("pollution"):
        if 150 <= aqi < 300:
            amount += 150
            risk_score += 0.2
            reasons.append("High Pollution 🌫️")
        elif aqi >= 300:
            amount += 250
            risk_score += 0.3
            reasons.append("Severe Pollution 🚨")

    # CURFEW
    if is_curfew:
        amount += 300
        risk_score += 0.4
        reasons.append("Government Curfew 🚫")

    # LOW DEMAND
    if covered("demand") and orders < 5:
        amount += 50
        risk_score += 0.1
        reasons.append("Low Demand 📉")

    # LIMIT VALUES
    risk_score = min(round(risk_score, 2), 1.0)
    amount = min(amount, 700)

    # NO TRIGGER
    if amount == 0:
        return 0, "No threshold crossed", 0

    # MINIMUM PAYOUT IF TRIGGERED
    amount = max(amount, 150)

    return amount, ", ".join(reasons), risk_score
