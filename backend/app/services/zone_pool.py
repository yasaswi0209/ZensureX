
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2

from sqlalchemy import func

from app.models.insurance import Insurance
from app.models.pool_ledger import PoolLedger
from app.models.user import User


# ============================================================
# COMMUNITY POOL SETTINGS
# ============================================================

POOL_RADIUS_KM = 10.0
SEED_FUNDS = 10000.0


# ============================================================
# DISTANCE CALCULATION
# ============================================================

def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two GPS coordinates using
    the Haversine formula.
    """

    earth_radius_km = 6371.0

    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)

    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)

    a = (
        sin(delta_lat / 2) ** 2
        + cos(lat1_rad)
        * cos(lat2_rad)
        * sin(delta_lon / 2) ** 2
    )

    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return earth_radius_km * c


# ============================================================
# CITY FALLBACK
# ============================================================

def city_zone(city: str) -> str:
    return "city:" + (city or "hyderabad").strip().lower()


# ============================================================
# GPS ZONE
# ============================================================

def gps_zone(lat: float, lon: float) -> str:
    """
    Creates a stable zone identifier based on the pool center.

    Example:
        gps:17.40,78.48
    """

    return f"gps:{lat:.5f},{lon:.5f}"


# ============================================================
# ZONE LABEL
# ============================================================

def zone_label(zone: str, city: str = "") -> str:
    """
    Creates the label displayed on the frontend.
    """

    if zone.startswith("city:"):
        return zone[5:].title()

    return f"{city or 'Your area'} (~10 km zone)"


def label_for_user(user: User) -> str:
    """
    Returns the appropriate label for the user's pool.
    """

    zone = zone_of_user(user)

    if zone.startswith("gps:"):
        return zone_label(
            zone,
            getattr(user, "place", None) or ""
        )

    return zone_label(zone)


# ============================================================
# PARSE GPS ZONE
# ============================================================

def parse_gps_zone(zone: str):
    """
    Converts:

        gps:17.3850,78.4867

    into:

        (17.3850, 78.4867)
    """

    if not zone or not zone.startswith("gps:"):
        return None

    try:
        coordinates = zone[4:].split(",")

        if len(coordinates) != 2:
            return None

        lat = float(coordinates[0])
        lon = float(coordinates[1])

        return lat, lon

    except (ValueError, TypeError):
        return None


# ============================================================
# FIND EXISTING 10 KM POOL
# ============================================================

def find_nearby_pool(db, lat: float, lon: float):
    """
    Find an existing GPS pool whose center is within 10 km
    of the user's current position.

    Only users with a valid GPS zone are considered.
    """

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

        if not existing_user.zone:
            continue

        if not existing_user.zone.startswith("gps:"):
            continue

        if existing_user.last_lat is None or existing_user.last_lon is None:
            continue

        distance = distance_km(
            lat,
            lon,
            existing_user.last_lat,
            existing_user.last_lon,
        )

        if distance <= POOL_RADIUS_KM:
            return existing_user.zone

    return None


# ============================================================
# GET USER ZONE
# ============================================================

def zone_of_user(user: User) -> str:
    """
    Returns the user's current community pool.

    If the user already has a GPS zone, use it.

    Otherwise fall back to city-based pooling.
    """

    if user.zone:
        return user.zone

    if user.last_lat is not None and user.last_lon is not None:
        return gps_zone(
            user.last_lat,
            user.last_lon
        )

    return city_zone(user.location)


# ============================================================
# SAVE USER GPS POSITION
# ============================================================

def save_user_position(
    db,
    user: User,
    lat: float,
    lon: float,
    place: str = "",
) -> str:

    # --------------------------------------------------------
    # Save latest GPS position
    # --------------------------------------------------------

    user.last_lat = lat
    user.last_lon = lon

    # --------------------------------------------------------
    # Save readable place name
    # --------------------------------------------------------

    if place:
        user.place = place.strip()[:80]

    # --------------------------------------------------------
    # Find an existing pool within 10 km
    # --------------------------------------------------------

    existing_zone = find_nearby_pool(
        db,
        lat,
        lon
    )

    # --------------------------------------------------------
    # If a nearby pool exists, join it
    # --------------------------------------------------------

    if existing_zone:

        user.zone = existing_zone

    # --------------------------------------------------------
    # Otherwise create a new pool centered here
    # --------------------------------------------------------

    else:

        user.zone = gps_zone(
            lat,
            lon
        )

    db.commit()

    return user.zone


# ============================================================
# ENSURE SEED FUNDS
# ============================================================

def _ensure_seed(db, zone: str):

    has = (
        db.query(PoolLedger.id)
        .filter(
            PoolLedger.zone == zone
        )
        .first()
    )

    if not has:

        db.add(
            PoolLedger(
                zone=zone,
                kind="seed",
                amount=SEED_FUNDS,
                note="Seed funds",
            )
        )

        db.commit()


# ============================================================
# SUM LEDGER
# ============================================================

def _sum(db, zone, kinds):

    return float(
        db.query(
            func.coalesce(
                func.sum(PoolLedger.amount),
                0.0
            )
        )
        .filter(
            PoolLedger.zone == zone,
            PoolLedger.kind.in_(kinds),
        )
        .scalar()
        or 0.0
    )


# ============================================================
# POOL BALANCE
# ============================================================

def balance(db, zone: str) -> float:

    _ensure_seed(
        db,
        zone
    )

    return (
        _sum(
            db,
            zone,
            ["seed", "premium"]
        )
        -
        _sum(
            db,
            zone,
            ["payout"]
        )
    )


# ============================================================
# ADD PREMIUM
# ============================================================

def add_premium(
    db,
    zone: str,
    user_id: int,
    amount: float,
    plan: str,
):

    _ensure_seed(
        db,
        zone
    )

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


# ============================================================
# PAY FROM POOL
# ============================================================

def pay_from_pool(
    db,
    zone: str,
    user_id: int,
    amount: float,
    note: str,
) -> float:

    available = max(
        balance(
            db,
            zone
        ),
        0.0
    )

    paid = round(
        min(
            amount,
            available
        ),
        2
    )

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


# ============================================================
# ACTIVE POLICY
# ============================================================

def active_policy(db, user_id: int):

    p = (
        db.query(Insurance)
        .filter(
            Insurance.user_id == user_id
        )
        .order_by(
            Insurance.id.desc()
        )
        .first()
    )

    if (
        p
        and p.locked_until
        and p.locked_until > datetime.utcnow()
    ):
        return p

    return None


# ============================================================
# USERS IN ZONE
# ============================================================

def zone_users_query(db, zone: str):

    q = db.query(User)

    if zone.startswith("city:"):

        city = zone[5:]

        return q.filter(
            (User.zone == zone)
            |
            (
                User.zone.is_(None)
                &
                (
                    func.lower(User.location)
                    == city
                )
            )
        )

    return q.filter(
        User.zone == zone
    )


# ============================================================
# POOL SUMMARY
# ============================================================

def summary(
    db,
    zone: str,
    city: str = "",
):

    bal = balance(
        db,
        zone
    )

    seed = _sum(
        db,
        zone,
        ["seed"]
    )

    premiums = _sum(
        db,
        zone,
        ["premium"]
    )

    payouts = _sum(
        db,
        zone,
        ["payout"]
    )

    members = []

    for u in zone_users_query(
        db,
        zone
    ).all():

        pol = active_policy(
            db,
            u.id
        )

        if not pol:
            continue

        paid_out = float(
            db.query(
                func.coalesce(
                    func.sum(
                        PoolLedger.amount
                    ),
                    0.0
                )
            )
            .filter(
                PoolLedger.zone == zone,
                PoolLedger.user_id == u.id,
                PoolLedger.kind == "payout",
            )
            .scalar()
            or 0.0
        )

        first = (
            u.name or "Worker"
        ).split()[0]

        members.append(
            {
                "name": first,
                "plan": pol.plan_name,
                "contribution": pol.premium,
                "payout": paid_out,
            }
        )

    # --------------------------------------------------------
    # LAST 4 WEEKS
    # --------------------------------------------------------

    since = (
        datetime.utcnow()
        - timedelta(days=28)
    )

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
        {
            "period": f"Week {i + 1}",
            "contribution": 0.0,
            "payout": 0.0,
        }
        for i in range(4)
    ]

    for r in rows:

        idx = min(
            3,
            max(
                0,
                int(
                    (
                        r.created_at - since
                    ).days // 7
                )
            )
        )

        if r.kind == "payout":

            weeks[idx]["payout"] += r.amount

        else:

            weeks[idx]["contribution"] += r.amount

    # --------------------------------------------------------
    # RETURN
    # --------------------------------------------------------

    return {
        "balance": round(
            bal,
            2
        ),

        "seed_funds": seed,

        "total_premiums": round(
            premiums,
            2
        ),

        "total_payouts": round(
            payouts,
            2
        ),

        "member_count": len(
            members
        ),

        "members": members,

        "trend": weeks,
    }

