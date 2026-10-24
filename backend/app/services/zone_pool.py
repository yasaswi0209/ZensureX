from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2

from sqlalchemy import func

from app.models.insurance import Insurance
from app.models.pool_ledger import PoolLedger
from app.models.user import User


# ---------- settings ----------
POOL_RADIUS_KM = 10.0
SEED_FUNDS = 10000.0
SEED_NOTE = "Platform reserve (demo funds)"


# ---------- distance ----------
def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance between two GPS points."""
    earth_radius_km = 6371.0

    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)

    a = (
        sin(delta_lat / 2) ** 2
        + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
    )
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return earth_radius_km * c


# ---------- zones ----------
def city_zone(city: str) -> str:
    return "city:" + (city or "hyderabad").strip().lower()


def gps_zone(lat: float, lon: float) -> str:
    """Zone id based on the pool centre, e.g. gps:17.40000,78.48000"""
    return f"gps:{lat:.5f},{lon:.5f}"


def zone_label(zone: str, city: str = "") -> str:
    if zone.startswith("city:"):
        return zone[5:].title()
    return f"{city or 'Your area'} (~10 km zone)"


def label_for_user(user: User) -> str:
    zone = zone_of_user(user)
    if zone.startswith("gps:"):
        return zone_label(zone, getattr(user, "place", None) or "")
    return zone_label(zone)


def parse_gps_zone(zone: str):
    """'gps:17.3850,78.4867' -> (17.3850, 78.4867), or None."""
    if not zone or not zone.startswith("gps:"):
        return None
    try:
        coordinates = zone[4:].split(",")
        if len(coordinates) != 2:
            return None
        return float(coordinates[0]), float(coordinates[1])
    except (ValueError, TypeError):
        return None


def find_nearby_pool(db, lat: float, lon: float):
    """Find an existing GPS pool with a member within 10 km."""
    users = (
        db.query(User)
        .filter(
            User.zone.isnot(None),
            User.last_lat.isnot(None),
            User.last_lon.isnot(None),
        )
        .all()
    )

    for existing_user in users:
        if not existing_user.zone or not existing_user.zone.startswith("gps:"):
            continue
        if existing_user.last_lat is None or existing_user.last_lon is None:
            continue

        distance = distance_km(lat, lon, existing_user.last_lat, existing_user.last_lon)
        if distance <= POOL_RADIUS_KM:
            return existing_user.zone

    return None


def zone_of_user(user: User) -> str:
    """The user's current pool: saved zone, then GPS position, then city."""
    if user.zone:
        return user.zone

    if user.last_lat is not None and user.last_lon is not None:
        return gps_zone(user.last_lat, user.last_lon)

    return city_zone(user.location)


def save_user_position(db, user: User, lat: float, lon: float, place: str = "") -> str:
    user.last_lat = lat
    user.last_lon = lon

    if place:
        user.place = place.strip()[:80]

    existing_zone = find_nearby_pool(db, lat, lon)

    # join a nearby pool, or start a new one centred here
    user.zone = existing_zone or gps_zone(lat, lon)

    db.commit()
    return user.zone


# ---------- ledger ----------
def _ensure_seed(db, zone: str):
    has = db.query(PoolLedger.id).filter(PoolLedger.zone == zone).first()

    if not has:
        db.add(
            PoolLedger(
                zone=zone,
                kind="seed",
                amount=SEED_FUNDS,
                note=SEED_NOTE,
            )
        )
        db.commit()


def _sum(db, zone, kinds):
    return float(
        db.query(func.coalesce(func.sum(PoolLedger.amount), 0.0))
        .filter(PoolLedger.zone == zone, PoolLedger.kind.in_(kinds))
        .scalar()
        or 0.0
    )


def balance(db, zone: str) -> float:
    """seed + premiums - payouts"""
    _ensure_seed(db, zone)
    return _sum(db, zone, ["seed", "premium"]) - _sum(db, zone, ["payout"])


def add_premium(db, zone: str, user_id: int, amount: float, plan: str):
    _ensure_seed(db, zone)

    db.add(
        PoolLedger(
            zone=zone,
            user_id=user_id,
            kind="premium",
            amount=amount,
            note=f"{plan} weekly premium",
        )
    )
    db.commit()


def pay_from_pool(db, zone: str, user_id: int, amount: float, note: str) -> float:
    """Pays at most what the pool has. Returns the amount actually paid."""
    available = max(balance(db, zone), 0.0)
    paid = round(min(amount, available), 2)

    if paid > 0:
        db.add(
            PoolLedger(
                zone=zone,
                user_id=user_id,
                kind="payout",
                amount=paid,
                note=note,
            )
        )
        db.commit()

    return paid


# ---------- policy and members ----------
def active_policy(db, user_id: int):
    p = (
        db.query(Insurance)
        .filter(Insurance.user_id == user_id)
        .order_by(Insurance.id.desc())
        .first()
    )

    if p and p.locked_until and p.locked_until > datetime.utcnow():
        return p

    return None


def zone_users_query(db, zone: str):
    q = db.query(User)

    if zone.startswith("city:"):
        city = zone[5:]
        return q.filter(
            (User.zone == zone)
            | (User.zone.is_(None) & (func.lower(User.location) == city))
        )

    return q.filter(User.zone == zone)


# ---------- summary for the Dashboard ----------
def summary(db, zone: str, city: str = ""):
    bal = balance(db, zone)
    seed = _sum(db, zone, ["seed"])
    premiums = _sum(db, zone, ["premium"])
    payouts = _sum(db, zone, ["payout"])

    members = []

    for u in zone_users_query(db, zone).all():
        pol = active_policy(db, u.id)
        if not pol:
            continue

        paid_out = float(
            db.query(func.coalesce(func.sum(PoolLedger.amount), 0.0))
            .filter(
                PoolLedger.zone == zone,
                PoolLedger.user_id == u.id,
                PoolLedger.kind == "payout",
            )
            .scalar()
            or 0.0
        )

        first = (u.name or "Worker").split()[0]

        members.append(
            {
                "name": first,
                "plan": pol.plan_name,
                "contribution": pol.premium,
                "payout": paid_out,
            }
        )

    # last 4 weeks
    since = datetime.utcnow() - timedelta(days=28)

    rows = (
        db.query(PoolLedger)
        .filter(
            PoolLedger.zone == zone,
            PoolLedger.created_at >= since,
            PoolLedger.kind != "seed",
        )
        .all()
    )

    weeks = [
        {"period": f"Week {i + 1}", "contribution": 0.0, "payout": 0.0}
        for i in range(4)
    ]

    for r in rows:
        idx = min(3, max(0, int((r.created_at - since).days // 7)))

        if r.kind == "payout":
            weeks[idx]["payout"] += r.amount
        else:
            weeks[idx]["contribution"] += r.amount

    return {
        "balance": round(bal, 2),
        "seed_funds": seed,
        "total_premiums": round(premiums, 2),
        "total_payouts": round(payouts, 2),
        "member_count": len(members),
        "members": members,
        "trend": weeks,
    }
