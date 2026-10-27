import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.insurance_schema import InsuranceCreate
from app.api.deps import get_current_user
from app.services.insurance_service import (
    create_or_update_policy,
    get_user_policies,
    get_latest_policy,
)
from app.models.insurance import Insurance
from app.models.insurance_payment import InsurancePayment
from app.ml.premium_model import calculate_premium
from app.services.pricing import COVERAGE, plan_prices
from app.services import zone_pool


router = APIRouter(prefix="/insurance", tags=["Insurance"])


# --------------------------------------------------
# RAZORPAY CONFIGURATION
# --------------------------------------------------

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

razorpay_client = None

if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    razorpay_client = razorpay.Client(
        auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
    )
else:
    print("WARNING: Razorpay credentials are not configured")


# --------------------------------------------------
# PLAN ORDER (used to allow upgrades only)
# --------------------------------------------------

PLAN_RANK = {"Basic": 1, "Moderate": 2, "Premium": 3}


# --------------------------------------------------
# REQUEST SCHEMAS
# --------------------------------------------------

class CreatePaymentOrder(BaseModel):
    plan: str
    quoted_price: Optional[float] = None
    # Sent by the frontend for convenience. The server decides on its own
    # whether this is an upgrade, so this value is never trusted.
    upgrade: Optional[bool] = False


class VerifyPayment(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# --------------------------------------------------
# HELPERS
# --------------------------------------------------

def _naive_utc(dt):
    """Convert any datetime to naive UTC so comparisons never fail."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _is_locked(policy) -> bool:
    """True while the policy's seven-day lock is still running."""
    if not policy or not policy.locked_until:
        return False
    return _naive_utc(policy.locked_until) > datetime.utcnow()


def _is_higher_plan(new_plan: str, current_plan: Optional[str]) -> bool:
    return PLAN_RANK.get(new_plan, 0) > PLAN_RANK.get(current_plan or "", 0)


def calculate_plan_price(user, plan: str, quoted_price: Optional[float]):
    """Calculate the premium on the backend, never trust frontend pricing."""

    if plan not in COVERAGE:
        raise HTTPException(status_code=400, detail="Invalid plan")

    try:
        base = float(calculate_premium(user.location)["premium"])
    except Exception as exc:
        print("Premium calculation error:", exc)
        raise HTTPException(
            status_code=500,
            detail="Could not calculate policy premium",
        )

    if (
        quoted_price is None
        or not (base * 0.9 <= quoted_price <= base * 1.25)
    ):
        quoted_price = base

    try:
        premium = int(plan_prices(quoted_price)[plan])
        coverage = int(COVERAGE[plan])
    except Exception as exc:
        print("Plan pricing error:", exc)
        raise HTTPException(
            status_code=500,
            detail="Could not calculate plan price",
        )

    if premium <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid premium amount",
        )

    return premium, coverage


def check_policy_lock(db: Session, user_id: int, new_plan: Optional[str] = None):
    """Enforce the seven-day lock on the backend.

    While the policy is locked, the only allowed change is an UPGRADE to a
    higher plan. Same-plan purchases and downgrades are rejected.
    Returns the latest policy (or None).
    """

    policy = get_latest_policy(db, user_id)

    if _is_locked(policy):
        if new_plan and _is_higher_plan(new_plan, policy.plan_name):
            return policy  # upgrade allowed

        locked_until = _naive_utc(policy.locked_until)
        raise HTTPException(
            status_code=409,
            detail=(
                "Plan is locked until "
                f"{locked_until.strftime('%d %b %Y, %I:%M %p')} UTC. "
                "You can only upgrade to a higher plan."
            ),
        )

    return policy


# --------------------------------------------------
# CREATE / UPDATE POLICY (EXISTING ROUTE)
# --------------------------------------------------

@router.post("/")
def create_policy(
    data: InsuranceCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        policy, action = create_or_update_policy(db, user.id, data)

        return {
            "message": f"Policy {action} successfully",
            "policy": policy,
        }

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        print("Policy creation error:", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to create/update policy",
        )


# --------------------------------------------------
# GET ALL POLICIES
# --------------------------------------------------

@router.get("/plans")
def get_my_policies(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        return get_user_policies(db, user.id)

    except Exception as exc:
        print("Policy listing error:", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch policies",
        )


# --------------------------------------------------
# DASHBOARD POLICY DATA
# --------------------------------------------------

@router.get("/my")
def get_my_policy(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        policy = get_latest_policy(db, user.id)

        if not policy:
            return {
                "plan_name": None,
                "premium": 0,
            }

        return {
            "plan_name": policy.plan_name,
            "premium": policy.premium,
        }

    except Exception as exc:
        print("Dashboard policy error:", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch policy",
        )


# --------------------------------------------------
# GET POLICY LOCK STATUS
# --------------------------------------------------

@router.get("/me")
def get_policy_lock_status(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        policy = get_latest_policy(db, user.id)

        if not policy:
            return {}

        return {
            "plan": policy.plan_name,
            # NEW: lets the frontend show the exact upgrade price
            "premium": policy.premium,
            "locked_until": (
                policy.locked_until.isoformat()
                if policy.locked_until
                else None
            ),
        }

    except Exception as exc:
        print("Policy lock lookup error:", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch lock status",
        )


# --------------------------------------------------
# PLAN + PAYMENT HISTORY FOR THE PROFILE PAGE
# --------------------------------------------------

@router.get("/history")
def get_payment_history(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        policy = get_latest_policy(db, user.id)

        current = None
        if policy:
            locked_until = _naive_utc(policy.locked_until)
            current = {
                "plan": policy.plan_name,
                "premium": policy.premium,
                "coverage": policy.coverage,
                "active_until": (
                    locked_until.isoformat() + "Z" if locked_until else None
                ),
                "active": bool(
                    locked_until and locked_until > datetime.utcnow()
                ),
            }

        rows = (
            db.query(InsurancePayment)
            .filter(
                InsurancePayment.user_id == user.id,
                InsurancePayment.status == "VERIFIED",
            )
            .order_by(InsurancePayment.id.desc())
            .limit(10)
            .all()
        )

        payments = []
        for r in rows:
            created = getattr(r, "created_at", None)
            payments.append(
                {
                    "plan": r.plan_name,
                    "amount": r.premium,
                    "coverage": r.coverage,
                    "order_id": r.order_id,
                    "payment_id": r.payment_id,
                    "date": created.isoformat() if created else None,
                }
            )

        return {"current": current, "payments": payments}

    except Exception as exc:
        print("Payment history error:", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch payment history",
        )


# --------------------------------------------------
# STEP 1: CREATE RAZORPAY ORDER
# --------------------------------------------------

@router.post("/create-order")
def create_payment_order(
    data: CreatePaymentOrder,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if razorpay_client is None:
        raise HTTPException(
            status_code=503,
            detail="Razorpay is not configured on the server",
        )

    # While locked, only a higher plan passes this check.
    policy = check_policy_lock(db, user.id, data.plan)

    full_premium, coverage = calculate_plan_price(
        user,
        data.plan,
        data.quoted_price,
    )

    # The server decides if this is an upgrade (never the client).
    is_upgrade = _is_locked(policy)

    if is_upgrade:
        # Pay only the difference between the new plan and what is
        # already active. Minimum charge is Rs 1.
        amount_to_pay = max(full_premium - int(policy.premium or 0), 1)
    else:
        amount_to_pay = full_premium

    try:
        order = razorpay_client.order.create(
            data={
                "amount": amount_to_pay * 100,
                "currency": "INR",
                "receipt": f"ins_{user.id}_{int(datetime.utcnow().timestamp())}",
                "notes": {
                    "user_id": str(user.id),
                    "plan_name": data.plan,
                    "upgrade": "1" if is_upgrade else "0",
                    # Full price of the new plan, saved on the policy at verify
                    "full_premium": str(full_premium),
                },
            }
        )

        # record.premium = the amount actually charged for this payment.
        payment_record = InsurancePayment(
            user_id=user.id,
            order_id=order["id"],
            plan_name=data.plan,
            premium=amount_to_pay,
            coverage=coverage,
            status="PENDING",
        )

        db.add(payment_record)
        db.commit()

        return {
            "key_id": RAZORPAY_KEY_ID,
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "plan": data.plan,
            "premium": amount_to_pay,
            "full_premium": full_premium,
            "coverage": coverage,
            "is_upgrade": is_upgrade,
        }

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        print("Razorpay order creation error:", exc)
        raise HTTPException(
            status_code=502,
            detail="Could not create payment order",
        )


# --------------------------------------------------
# STEP 2: VERIFY PAYMENT AND ACTIVATE / UPGRADE POLICY
# --------------------------------------------------

def _verify_response(message: str, record, policy, is_upgrade: bool = False):
    return {
        "message": message,
        "plan": record.plan_name,
        "premium": record.premium,
        "coverage": record.coverage,
        "payment_id": record.payment_id,
        "is_upgrade": is_upgrade,
        "locked_until": (
            policy.locked_until.isoformat()
            if policy and policy.locked_until
            else None
        ),
    }


@router.post("/verify-payment")
def verify_payment(
    data: VerifyPayment,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if razorpay_client is None:
        raise HTTPException(
            status_code=503,
            detail="Razorpay is not configured on the server",
        )

    record = (
        db.query(InsurancePayment)
        .filter(
            InsurancePayment.order_id == data.razorpay_order_id,
            InsurancePayment.user_id == user.id,
        )
        .with_for_update()
        .first()
    )

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Payment order not found",
        )

    # Already finished: return the saved result.
    if record.status == "VERIFIED":
        policy = get_latest_policy(db, user.id)
        return _verify_response("Payment already verified", record, policy)

    # A previous attempt activated the policy but did not finish crediting
    # the pool. Finish it now. The ref makes the credit safe to repeat.
    if record.status == "PROCESSING":
        if record.payment_id != data.razorpay_payment_id:
            raise HTTPException(
                status_code=400,
                detail="Payment does not match this order",
            )
        try:
            zone = zone_pool.zone_of_user(user)
            zone_pool.add_premium(
                db,
                zone,
                user.id,
                record.premium,
                record.plan_name,
                ref=record.payment_id,
            )
            record.status = "VERIFIED"
            db.commit()
            policy = get_latest_policy(db, user.id)
            return _verify_response(
                "Payment verified and policy activated", record, policy
            )
        except Exception as exc:
            db.rollback()
            print("Payment retry error:", exc)
            raise HTTPException(
                status_code=400,
                detail="Could not finish processing. Try again.",
            )

    if record.status != "PENDING":
        raise HTTPException(
            status_code=409,
            detail="Payment order is not pending",
        )

    try:
        # Verify the Checkout signature using the server-side secret.
        razorpay_client.utility.verify_payment_signature(
            {
                "razorpay_order_id": data.razorpay_order_id,
                "razorpay_payment_id": data.razorpay_payment_id,
                "razorpay_signature": data.razorpay_signature,
            }
        )

        # Fetch payment details directly from Razorpay.
        payment = razorpay_client.payment.fetch(
            data.razorpay_payment_id
        )

        if payment.get("order_id") != record.order_id:
            raise HTTPException(
                status_code=400,
                detail="Payment does not match this order",
            )

        if int(payment.get("amount", 0)) != record.premium * 100:
            raise HTTPException(
                status_code=400,
                detail="Payment amount does not match the order",
            )

        if payment.get("currency") != "INR":
            raise HTTPException(
                status_code=400,
                detail="Invalid payment currency",
            )

        if payment.get("status") != "captured":
            raise HTTPException(
                status_code=409,
                detail="Payment has not been captured",
            )

        # Read the notes we saved on the order at create-order time.
        # They were written by the server, so they can be trusted.
        order = razorpay_client.order.fetch(record.order_id)
        notes = order.get("notes") or {}
        is_upgrade = notes.get("upgrade") == "1"
        try:
            full_premium = int(notes.get("full_premium") or record.premium)
        except (TypeError, ValueError):
            full_premium = record.premium

        # Check the lock again before changing the policy.
        # Locked   -> only an upgrade order may pass.
        # Unlocked -> only a normal purchase may pass.
        policy = get_latest_policy(db, user.id)
        locked = _is_locked(policy)

        if locked:
            if not is_upgrade or not _is_higher_plan(
                record.plan_name, policy.plan_name
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Plan is locked. Only upgrades to a higher plan are allowed.",
                )
        elif is_upgrade:
            # The lock expired between order creation and payment, but the
            # amount paid was only the upgrade difference.
            raise HTTPException(
                status_code=409,
                detail=(
                    "Your lock expired while paying, so this upgrade order is "
                    "no longer valid. Please contact support for a refund."
                ),
            )

        now = datetime.utcnow()

        if policy:
            policy.plan_name = record.plan_name
            # Policy stores the FULL price of the new plan, so the next
            # upgrade difference is calculated correctly.
            policy.premium = full_premium if is_upgrade else record.premium
            policy.coverage = record.coverage
            policy.status = "ACTIVE"
        else:
            policy = Insurance(
                user_id=user.id,
                plan_name=record.plan_name,
                premium=record.premium,
                coverage=record.coverage,
                status="ACTIVE",
            )
            db.add(policy)

        # A normal purchase starts a new 7-day lock.
        # An upgrade keeps the existing lock window untouched.
        if not is_upgrade:
            policy.locked_until = now + timedelta(days=7)

        # Mark processing first so a failed pool credit can be retried.
        record.payment_id = data.razorpay_payment_id
        record.status = "PROCESSING"

        db.commit()
        db.refresh(policy)

        # The ref (payment id) means this payment is credited only once.
        # Only the amount actually paid (the difference for upgrades) is credited.
        zone = zone_pool.zone_of_user(user)
        zone_pool.add_premium(
            db,
            zone,
            user.id,
            record.premium,
            record.plan_name,
            ref=record.payment_id,
        )

        record.status = "VERIFIED"
        db.commit()
        db.refresh(policy)

        return _verify_response(
            "Plan upgraded successfully"
            if is_upgrade
            else "Payment verified and policy activated",
            record,
            policy,
            is_upgrade,
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        print("Payment verification error:", exc)
        raise HTTPException(
            status_code=400,
            detail=(
                "Payment verification or policy processing failed. "
                "Check payment status before retrying."
            ),
        )


# --------------------------------------------------
# DISABLE DIRECT ACTIVATION WITHOUT PAYMENT
# --------------------------------------------------

@router.post("/upgrade")
def upgrade_plan_blocked():
    raise HTTPException(
        status_code=410,
        detail=(
            "Direct policy activation is disabled. "
            "Create a payment order and verify payment instead."
        ),
    )
