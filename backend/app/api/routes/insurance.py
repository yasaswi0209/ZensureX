from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
import os
import razorpay

from pydantic import BaseModel
from app.models.insurance_payment import InsurancePayment
from app.db.session import get_db
from app.schemas.insurance_schema import InsuranceCreate
from app.api.deps import get_current_user
from app.services.insurance_service import (
    create_or_update_policy,
    get_user_policies,
    get_latest_policy
)
from app.models.insurance import Insurance
from app.ml.premium_model import calculate_premium
from app.services.pricing import COVERAGE, plan_prices
from app.services import zone_pool

router = APIRouter(prefix="/insurance", tags=["Insurance"])


# 🔥 CREATE / UPDATE POLICY
@router.post("/")
def create_policy(
    data: InsuranceCreate,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    try:
        policy, action = create_or_update_policy(db, user.id, data)

        return {
            "message": f"Policy {action} successfully ✅",
            "policy": policy
        }

    except Exception as e:
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail="Failed to create/update policy")


# 🔥 GET ALL POLICIES
@router.get("/plans")
def get_my_policies(
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    try:
        return get_user_policies(db, user.id)

    except Exception as e:
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail="Failed to fetch policies")


# 🔥 DASHBOARD DATA
@router.get("/my")
def get_my_policy(
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    try:
        policy = get_latest_policy(db, user.id)

        if not policy:
            return {
                "plan_name": None,
                "premium": 0
            }

        return {
            "plan_name": policy.plan_name,
            "premium": policy.premium
        }

    except Exception as e:
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail="Failed to fetch policy")


# 🔒 GET LOCK STATUS
@router.get("/me")
def get_policy_lock_status(
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    try:
        policy = get_latest_policy(db, user.id)

        if not policy:
            return {}

        return {
            "plan": policy.plan_name,
            "locked_until": policy.locked_until.isoformat() if policy.locked_until else None
        }

    except Exception as e:
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail="Failed to fetch lock status")


# 🚀 UPGRADE PLAN
@router.post("/upgrade")
def upgrade_plan(
    plan: str,
    quoted_price: Optional[float] = None,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    coverage = COVERAGE.get(plan)
    if coverage is None:
        raise HTTPException(status_code=400, detail="Invalid plan")

    now = datetime.utcnow()
    policy = get_latest_policy(db, user.id)

    # 🔒 LOCK IS ENFORCED HERE, not only in the browser
    if policy and policy.locked_until and policy.locked_until > now:
        raise HTTPException(
            status_code=409,
            detail=f"Plan is locked until {policy.locked_until.strftime('%d %b %Y, %I:%M %p')} UTC"
        )

    try:
        # Server decides the price. The page's quote is only accepted inside a sane band.
        base = float(calculate_premium(user.location)["premium"])
        if quoted_price is None or not (base * 0.9 <= quoted_price <= base * 1.25):
            quoted_price = base
        premium = plan_prices(quoted_price)[plan]

        if policy:
            policy.plan_name = plan
            policy.premium = premium
            policy.coverage = coverage
            policy.status = "ACTIVE"
            action = "updated"
        else:
            policy = Insurance(
                user_id=user.id, plan_name=plan, premium=premium,
                coverage=coverage, status="ACTIVE"
            )
            db.add(policy)
            action = "created"

        policy.locked_until = now + timedelta(days=7)
        db.commit()
        db.refresh(policy)

        # the weekly premium goes into the worker's zone pool
        zone = zone_pool.zone_of_user(user)
        zone_pool.add_premium(db, zone, user.id, premium, plan)

        return {
            "message": f"Plan upgraded successfully 🚀 ({action})",
            "plan": policy.plan_name,
            "premium": policy.premium,
            "coverage": policy.coverage,
            "locked_until": policy.locked_until.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail="Failed to upgrade plan")
