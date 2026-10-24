from datetime import datetime, timedelta

from app.models.claim import Claim

MAX_PAYOUT = 700             # same cap as auto_claim_logic
DUPLICATE_WINDOW_HOURS = 24  # one payout per trigger per 24 hours
MAX_CLAIMS_PER_WEEK = 3


def check_fraud(
    user_id: int,
    amount: float,
    risk_score: float,
    trigger: str = None,
    db=None,
    has_active_plan: bool = True,
):
    """
    Fraud checks based on the user's behaviour, not on how severe the weather is.

    A bigger disaster means a bigger payout, so a high risk_score or a high amount
    is NOT suspicious by itself. What is suspicious: no plan, a repeat payout,
    too many claims, or an amount above the cap.

    Returns:
        (is_fraud: bool, reason: str)
    """

    # Rule 1: the user must have an active plan
    if not has_active_plan:
        return True, "No active plan"

    # Rule 2: amount can never exceed the policy cap
    if amount > MAX_PAYOUT:
        return True, "Amount is above the maximum payout"

    # Rules 3 and 4 need the database
    if db is not None:
        now = datetime.utcnow()

        # Rule 3: same trigger already paid in the last 24 hours
        duplicate = (
            db.query(Claim)
            .filter(
                Claim.user_id == user_id,
                Claim.trigger_type == trigger,
                Claim.status == "approved",
                Claim.created_at >= now - timedelta(hours=DUPLICATE_WINDOW_HOURS),
            )
            .first()
        )
        if duplicate:
            return True, "Already paid for this event in the last 24 hours"

        # Rule 4: too many approved claims this week
        weekly = (
            db.query(Claim)
            .filter(
                Claim.user_id == user_id,
                Claim.status == "approved",
                Claim.created_at >= now - timedelta(days=7),
            )
            .count()
        )
        if weekly >= MAX_CLAIMS_PER_WEEK:
            return True, "Too many claims this week"

    return False, "Legitimate claim"
