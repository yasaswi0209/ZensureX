from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.session import engine, Base
import app.db.base  # noqa: F401  (registers all models)
from app.db.schema import ensure_schema

Base.metadata.create_all(bind=engine)
ensure_schema(engine)

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

app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(risk_router, prefix="/risk", tags=["Risk"])
app.include_router(claim_router)
app.include_router(payout_router, tags=["Payout"])
app.include_router(settings_router)

@app.get("/")
def root():
    return {"message": "Backend running 🚀"}
