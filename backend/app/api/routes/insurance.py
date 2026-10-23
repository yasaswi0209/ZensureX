
import os
from datetime import datetime, timedelta
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
# REQUEST SCHEMAS
# --------------------------------------------------

class CreatePaymentOrder(BaseModel):
    plan: str
    quoted_price: Optional[float] = None


class VerifyPayment(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# --------------------------------------------------
# HELPERS
# --------------------------------------------------

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


def check_policy_lock(db: Session, user_id: int):
    """Enforce the existing seven-day policy lock on the backend."""

    policy = get_latest_policy(db, user_id)
    now = datetime.utcnow()

    if policy and policy.locked_until:
        locked_until = policy.locked_until

        # Handle timezone-aware database values.
        if locked_until.tzinfo is not None:
            from datetime import timezone
            now = datetime.now(timezone.utc)
        elif now.tzinfo is not None:
            now = now.replace(tzinfo=None)

        if locked_until > now:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Plan is locked until "
                    f"{locked_until.strftime('%d %b %Y, %I:%M %p')} UTC"
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

    check_policy_lock(db, user.id)

    premium, coverage = calculate_plan_price(
        user,
        data.plan,
        data.quoted_price,
    )

    try:
        order = razorpay_client.order.create(
            data={
                "amount": premium * 100,
                "currency": "INR",
                "receipt": f"ins_{user.id}_{int(datetime.utcnow().timestamp())}",
                "notes": {
                    "user_id": str(user.id),
                    "plan_name": data.plan,
                },
            }
        )

        payment_record = InsurancePayment(
            user_id=user.id,
            order_id=order["id"],
            plan_name=data.plan,
            premium=premium,
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
            "premium": premium,
            "coverage": coverage,
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
# STEP 2: VERIFY PAYMENT AND ACTIVATE POLICY
# --------------------------------------------------

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

    # A completed order must not activate or credit the pool twice.
    if record.status == "VERIFIED":
        policy = get_latest_policy(db, user.id)
        return {
            "message": "Payment already verified",
            "plan": record.plan_name,
            "premium": record.premium,
            "coverage": record.coverage,
            "locked_until": (
                policy.locked_until.isoformat()
                if policy and policy.locked_until
                else None
            ),
        }

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

        # Check the lock again before activating the policy.
        policy = check_policy_lock(db, user.id)

        now = datetime.utcnow()

        if policy:
            policy.plan_name = record.plan_name
            policy.premium = record.premium
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

        policy.locked_until = now + timedelta(days=7)

        # Mark processing first so a failed pool operation can be retried.
        record.payment_id = data.razorpay_payment_id
        record.status = "PROCESSING"

        db.commit()
        db.refresh(policy)

        # IMPORTANT:
        # Make this operation idempotent in zone_pool before production use.
        # It must not add the same payment's premium twice on retries.
        zone = zone_pool.zone_of_user(user)
        zone_pool.add_premium(
            db,
            zone,
            user.id,
            record.premium,
            record.plan_name,
        )

        record.status = "VERIFIED"
        db.commit()
        db.refresh(policy)

        return {
            "message": "Payment verified and policy activated",
            "plan": policy.plan_name,
            "premium": policy.premium,
            "coverage": policy.coverage,
            "locked_until": (
                policy.locked_until.isoformat()
                if policy.locked_until
                else None
            ),
        }

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
