from datetime import timedelta, datetime
from math import radians, sin, cos, asin, sqrt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.user_schema import UserCreate
from app.api.deps import get_current_user

router = APIRouter()

POOL_RADIUS_KM = 5


def km_between(lat1, lon1, lat2, lon2):
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 6371 * 2 * asin(sqrt(a))


class LocationIn(BaseModel):
    lat: float
    lon: float


# 👤 SIGNUP (AUTO LOGIN)
@router.post("/signup")
def create_user(user: UserCreate, db: Session = Depends(get_db)):

    email = user.email.strip().lower()

    # ✅ check if user exists (case-insensitive)
    existing_user = db.query(User).filter(func.lower(User.email) == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    # ✅ create user
    db_user = User(
        name=user.name,
        email=email,
        password=hash_password(user.password),
        platform=user.platform,
        location=user.location,
        weekly_income=user.weekly_income
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # 🔥 AUTO LOGIN TOKEN
    access_token = create_access_token(
        {"sub": db_user.email},
        timedelta(hours=24)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


# 🔐 GET CURRENT USER (must be above "/{user_id}")
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


# 📍 SAVE GPS LOCATION
@router.post("/location")
def save_location(
    data: LocationIn,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not (-90 <= data.lat <= 90 and -180 <= data.lon <= 180):
        raise HTTPException(status_code=422, detail="Invalid coordinates")

    # re-load in this session so the commit definitely saves
    db_user = db.query(User).filter(User.id == user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    db_user.lat = data.lat
    db_user.lon = data.lon
    db_user.location_updated_at = datetime.utcnow()
    db.commit()

    return {"ok": True}


# 👥 RIDERS WITHIN ~5 KM (community pool by real GPS)
@router.get("/nearby")
def nearby_members(user=Depends(get_current_user), db: Session = Depends(get_db)):

    if user.lat is None or user.lon is None:
        return {"radius_km": POOL_RADIUS_KM, "count": 0, "members": []}

    members = []
    for u in db.query(User).filter(User.lat.isnot(None), User.lon.isnot(None)).all():
        dist = km_between(user.lat, user.lon, u.lat, u.lon)
        if dist <= POOL_RADIUS_KM:
            members.append({
                "id": u.id,
                "name": u.name,
                "platform": u.platform,
                # rounded to ~1 km so exact positions are not exposed
                "lat": round(u.lat, 2),
                "lon": round(u.lon, 2),
                "is_me": u.id == user.id,
            })

    return {"radius_km": POOL_RADIUS_KM, "count": len(members), "members": members}


# 🔍 GET USER BY ID (login required, safe fields only)
@router.get("/{user_id}")
def get_user(
    user_id: int,
    current=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user.id,
        "name": user.name,
        "platform": user.platform,
        "location": user.location,
    }
