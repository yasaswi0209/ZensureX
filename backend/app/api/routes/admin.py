import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.routes.auth import find_user_by_email
from app.core.security import SECRET_KEY, ALGORITHM

router = APIRouter(prefix="/admin", tags=["Admin"])
bearer = HTTPBearer()


def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        email = payload.get("sub")
    except JWTError:
        raise HTTPException(401, "Invalid token")

    if not email:
        raise HTTPException(401, "Invalid token")

    user = find_user_by_email(db, email)
    if not user:
        raise HTTPException(401, "User not found")

    admin_email = os.getenv("ADMIN_EMAIL", "").strip().lower()

    if not admin_email or user.email.lower() != admin_email:
        raise HTTPException(403, "Admin access required")

    return user


@router.get("/users")
def list_users(
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):
    rows = db.execute(text("""
        SELECT id, name, email, platform, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 100
    """))

    return [dict(row) for row in rows.mappings()]


@router.get("/stats")
def admin_stats(
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):
    total = db.execute(
        text("SELECT COUNT(*) FROM users")
    ).scalar()

    return {"total_users": total}
