from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy import text
from app.db.session import engine
from app.db.session import engine, Base
import app.db.base  # noqa: F401  (registers all models)
from app.db.schema import ensure_schema
from app.api.routes.admin import router as admin_router
Base.metadata.create_all(bind=engine)
ensure_schema(engine)


def add_gps_columns():
    """Adds GPS columns to the existing users table (safe to run repeatedly)."""
    with engine.begin() as conn:
        conn.execute(text("""
            ALTER TABLE users
                ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP WITH TIME ZONE
        """))


add_gps_columns()

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://zensurex.vercel.app",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ROUTES
from app.api.routes.auth import router as auth_router
from app.api.routes.risk import router as risk_router
from app.api.routes.claim import router as claim_router
from app.api.routes.payout import router as payout_router
from app.api.routes.settings import router as settings_router
from app.api.routes.insurance import router as insurance_router

from app.api.routes.pool import router as pool_router

app.include_router(insurance_router)
app.include_router(pool_router)
app.include_router(admin_router)
app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(risk_router, prefix="/risk", tags=["Risk"])
app.include_router(claim_router)
app.include_router(payout_router, tags=["Payout"])
app.include_router(settings_router)

@app.get("/")
def root():
    return {"message": "Backend running 🚀"}
@app.on_event("startup")
def add_place_column():
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS place VARCHAR"))
@app.get("/health")
def health():
    return {"ok": True}

@app.head("/health")
def health_head():
    return {"ok": True}
