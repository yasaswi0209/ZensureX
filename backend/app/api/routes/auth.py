import re
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.core.security import verify_password, create_access_token, hash_password

router = APIRouter()

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def find_user_by_email(db: Session, email: str):
    # case-insensitive lookup, works even for old mixed-case rows
    return db.query(User).filter(func.lower(User.email) == normalize_email(email)).first()


# ✅ USER SCHEMA
class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    platform: str
    location: str
    weekly_income: float


# 📧 CHECK EMAIL (used live on the signup page)
@router.get("/check-email")
def check_email(email: str, db: Session = Depends(get_db)):
    if not EMAIL_REGEX.match(email.strip()):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    return {"exists": find_user_by_email(db, email) is not None}


# 🔐 SIGNUP
@router.post("/signup")
def signup(user: UserCreate, db: Session = Depends(get_db)):
    try:
        email = normalize_email(user.email)

        if not EMAIL_REGEX.match(email):
            raise HTTPException(status_code=422, detail="Enter a valid email address")

        if len(user.password) < 6:
            raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

        if find_user_by_email(db, email):
            raise HTTPException(status_code=409, detail="Email already registered")

        new_user = User(
            name=user.name.strip(),
            email=email,
            password=hash_password(user.password),
            platform=user.platform,
            location=user.location.strip(),
            weekly_income=int(user.weekly_income),
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        access_token = create_access_token(
            {"sub": new_user.email},
            timedelta(hours=24),
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
        }

    except HTTPException:
        # let our own 409 / 422 errors through untouched
        raise

    except IntegrityError:
        # two signups with the same email at the same moment
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")

    except Exception as e:
        db.rollback()
        print("🔥 SIGNUP ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Signup failed")


# 🔐 LOGIN
@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):

    db_user = find_user_by_email(db, form_data.username)

    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(form_data.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(
        {"sub": db_user.email},
        timedelta(hours=24),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


# 👤 GET CURRENT USER
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

SECRET_KEY = "super-secret-key"   # ⚠️ must match the key used in create_access_token
ALGORITHM = "HS256"


@router.get("/me")
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")

        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = find_user_by_email(db, email)

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "name": user.name,
            "email": user.email,
            "platform": user.platform,
            "location": user.location,
            "weekly_income": user.weekly_income,
        }

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
