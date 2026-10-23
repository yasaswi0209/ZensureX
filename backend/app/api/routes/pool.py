from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import zone_pool

router = APIRouter(prefix="/pool", tags=["Pool"])


@router.get("/me")
def my_pool(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    zone = zone_pool.zone_of_user(user)
    data = zone_pool.summary(db, zone, user.location)
    pol = zone_pool.active_policy(db, user.id)

    data.update({
        "zone": zone,
        "zone_label": zone_pool.zone_label(zone, user.location),
        "plan": pol.plan_name if pol else None,
        "premium": pol.premium if pol else 0,
        "coverage": pol.coverage if pol else 0,
        "locked_until": pol.locked_until.isoformat() if pol else None,
        "server_time": datetime.utcnow().isoformat(),
    })
    return data
class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


@router.post("/location")
def save_location(
    data: LocationIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user.lat = data.lat
    user.lon = data.lon
    user.location_updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
