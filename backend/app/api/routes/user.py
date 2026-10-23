
from datetime import datetime, timedelta, timezone
from math import radians, sin, cos, asin, sqrt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.user_schema import UserCreate
from app.api.deps import get_current_user

router = APIRouter()

POOL_RADIUS_KM = 5.0


def km_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the distance between two GPS coordinates in kilometers."""
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)

    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1))
        * cos(radians(lat2))
        * sin(dlon / 2) ** 2
    )

    # Protect against floating-point rounding errors.
    a = max(0.0, min(1.0, a))
    return 6371.0 * 2 * asin(sqrt(a))


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


# SIGNUP + AUTO LOGIN
@router.post("/signup")
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    email = user.email.strip().lower()

    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User already exists",
        )

    db_user = User(
        name=user.name,
        email=email,
        password=hash_password(user.password),
        platform=user.platform,
        location=user.location,
        weekly_income=user.weekly_income,
    )

    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        access_token = create_access_token(
            {"sub": db_user.email},
            timedelta(hours=24),
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
        }

    except Exception:
        db.rollback()
        raise


# CURRENT USER PROFILE
@router.get("/me")
def get_profile(user=Depends(get_current_user)):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "platform": user.platform,
        "location": user.location,
        "weekly_income": user.weekly_income,
        "lat": user.lat,
        "lon": user.lon,
    }


# SAVE CURRENT USER GPS LOCATION
@router.post("/location")
def save_location(
    data: LocationIn,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_user = db.query(User).filter(User.id == user.id).first()

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    db_user.lat = data.lat
    db_user.lon = data.lon
    db_user.location_updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {"ok": True, "message": "Location saved successfully"}


# FIND OTHER RIDERS WITHIN 5 KM
@router.get("/nearby")
def nearby_members(
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_user = db.query(User).filter(User.id == user.id).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if db_user.lat is None or db_user.lon is None:
        return {
            "radius_km": POOL_RADIUS_KM,
            "count": 0,
            "members": [],
            "message": "Save your GPS location first",
        }

    users = (
        db.query(User)
        .filter(
            User.id != db_user.id,
            User.lat.isnot(None),
            User.lon.isnot(None),
        )
        .all()
    )

    members = []

    for other in users:
        distance = km_between(
            db_user.lat,
            db_user.lon,
            other.lat,
            other.lon,
        )

        if distance <= POOL_RADIUS_KM:
            members.append({
                "id": other.id,
                "name": other.name,
                "platform": other.platform,
                "distance_km": round(distance, 2),
            })

    members.sort(key=lambda member: member["distance_km"])

    return {
        "radius_km": POOL_RADIUS_KM,
        "count": len(members),
        "members": members,
    }


# GET USER BY ID - AUTHENTICATED, SAFE FIELDS ONLY
@router.get("/{user_id}")
def get_user(
    user_id: int,
    current=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    return {
        "id": user.id,
        "name": user.name,
        "platform": user.platform,
        "location": user.location,
    }
