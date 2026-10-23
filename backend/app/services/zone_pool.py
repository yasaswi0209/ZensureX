from datetime import datetime, timedelta

from sqlalchemy import func

from app.models.insurance import Insurance
from app.models.pool_ledger import PoolLedger
from app.models.user import User

GRID = 0.05            # degrees, about 5.5 km: workers in the same cell share a pool
SEED_FUNDS = 10000.0   # starting demo balance for every new zone (shown as "seed funds")


def city_zone(city: str) -> str:
    return "city:" + (city or "hyderabad").strip().lower()


def gps_zone(lat: float, lon: float) -> str:
    return f"gps:{round(lat / GRID) * GRID:.2f},{round(lon / GRID) * GRID:.2f}"


def zone_label(zone: str, city: str = "") -> str:
    if zone.startswith("city:"):
        return zone[5:].title()
    return f"{city or 'Your area'} (~5 km zone)"


def zone_of_user(user: User) -> str:
    return user.zone or city_zone(user.location)


def save_user_position(db, user: User, lat: float, lon: float) -> str:
    user.last_lat, user.last_lon = lat, lon
    user.zone = gps_zone(lat, lon)
    db.commit()
    return user.zone


def _ensure_seed(db, zone: str):
    has = db.query(PoolLedger.id).filter(PoolLedger.zone == zone).first()
    if not has:
        db.add(PoolLedger(zone=zone, kind="seed", amount=SEED_FUNDS, note="Seed funds"))
        db.commit()


def _sum(db, zone, kinds):
    return float(
        db.query(func.coalesce(func.sum(PoolLedger.amount), 0.0))
        .filter(PoolLedger.zone == zone, PoolLedger.kind.in_(kinds))
        .scalar() or 0.0
    )


def balance(db, zone: str) -> float:
    _ensure_seed(db, zone)
    return _sum(db, zone, ["seed", "premium"]) - _sum(db, zone, ["payout"])


def add_premium(db, zone: str, user_id: int, amount: float, plan: str):
    _ensure_seed(db, zone)
    db.add(PoolLedger(zone=zone, user_id=user_id, kind="premium", amount=amount, note=f"{plan} weekly premium"))
    db.commit()


def pay_from_pool(db, zone: str, user_id: int, amount: float, note: str) -> float:
    """Take a payout out of the pool. Pays at most what the pool holds. Returns the amount paid."""
    available = max(balance(db, zone), 0.0)
    paid = round(min(amount, available), 2)
    if paid > 0:
        db.add(PoolLedger(zone=zone, user_id=user_id, kind="payout", amount=paid, note=note))
        db.commit()
    return paid


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
            (User.zone == zone) | (User.zone.is_(None) & (func.lower(User.location) == city))
        )
    return q.filter(User.zone == zone)


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
            .filter(PoolLedger.zone == zone, PoolLedger.user_id == u.id, PoolLedger.kind == "payout")
            .scalar() or 0.0
        )
        first = (u.name or "Worker").split()[0]
        members.append({
            "name": first,
            "plan": pol.plan_name,
            "contribution": pol.premium,
            "payout": paid_out,
        })

    # last 4 weeks of premiums vs payouts
    since = datetime.utcnow() - timedelta(days=28)
    rows = db.query(PoolLedger).filter(
        PoolLedger.zone == zone, PoolLedger.created_at >= since, PoolLedger.kind != "seed"
    ).all()
    weeks = [{"period": f"Week {i + 1}", "contribution": 0.0, "payout": 0.0} for i in range(4)]
    for r in rows:
        idx = min(3, max(0, int((r.created_at - since).days // 7)))
        weeks[idx]["payout" if r.kind == "payout" else "contribution"] += r.amount

    return {
        "balance": round(bal, 2),
        "seed_funds": seed,
        "total_premiums": round(premiums, 2),
        "total_payouts": round(payouts, 2),
        "member_count": len(members),
        "members": members,
        "trend": weeks,
    }
