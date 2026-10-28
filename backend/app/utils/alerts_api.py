"""
Official weather alerts (cyclone, heavy rain, storm) for ONE user's location.

Sources (both are CAP feeds):
  1. NDMA SACHET  https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml
  2. IMD CAP      https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml

How it works:
  1. Read the RSS feeds. Every item links to one CAP XML alert.
  2. Download and parse each alert (in parallel), keep the weather ones that have not expired.
  3. Cache everything for 10 minutes, so users do not trigger a download each time.
  4. For a user: match the alert area against their GPS point (polygon / circle),
     or against their district / state name (from reverse geocoding).
  5. Return LOW / MEDIUM / HIGH plus the alert texts.

Put this file in: backend/app/utils/alerts_api.py
"""
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from math import radians, sin, cos, asin, sqrt

import requests

FEEDS = [
    "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml",
    "https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml",
]
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"

# Nominatim requires a real User-Agent. Put your own contact e-mail here.
HEADERS = {"User-Agent": "ZensureX/1.0 (contact: your-email@example.com)"}

TIMEOUT = 8
ALERT_TTL = 600          # keep parsed alerts for 10 minutes
RETRY_AFTER = 60         # if the feeds are unreachable, try again after 60 seconds
MAX_ITEMS = 80           # newest alerts to download per refresh
IST = timezone(timedelta(hours=5, minutes=30))

LEVEL_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}

# An alert is kept only if its text mentions one of these
WEATHER_WORDS = (
    "cyclone", "cyclonic", "depression", "storm surge", "heavy rain", "rainfall",
    "thunderstorm", "squall", "gale", "strong wind", "flood", "lightning", "very heavy",
)
CYCLONE_WORDS = ("cyclone", "cyclonic", "depression", "storm surge")

_alert_cache = {"t": 0.0, "alerts": []}
_geo_cache = {}


# ------------------------------------------------------------ small helpers ---

def _strip(tag):
    """'{urn:oasis:names:tc:emergency:cap:1.2}info' -> 'info'"""
    return tag.split("}")[-1]


def _kids(el, name):
    return [c for c in el if _strip(c.tag) == name]


def _first_text(el, name):
    for c in el:
        if _strip(c.tag) == name:
            return (c.text or "").strip()
    return ""


def _has(text, name):
    """Whole-word match, so 'ntr' does not match 'central'."""
    return bool(re.search(r"\b" + re.escape(name) + r"\b", text))


def _parse_time(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=IST)
    except Exception:
        return None


# ------------------------------------------------------------ CAP parsing ---

def _level_for(event, headline, severity, cyclone):
    text = f"{event} {headline}".lower()
    level = {"extreme": "HIGH", "severe": "HIGH", "moderate": "MEDIUM", "minor": "LOW"}.get(
        (severity or "").lower(), "MEDIUM"
    )
    # IMD colour codes: red / orange = act now, yellow = be aware
    if re.search(r"\b(red|orange)\b", text):
        level = "HIGH"
    elif re.search(r"\byellow\b", text) and level == "LOW":
        level = "MEDIUM"
    if cyclone:
        level = "HIGH"
    return level


def _parse_cap(xml_bytes):
    """One CAP message -> list of weather alerts (empty if not relevant or expired)."""
    root = ET.fromstring(xml_bytes)
    sender = _first_text(root, "senderName") or _first_text(root, "sender") or "SACHET"

    infos = _kids(root, "info")
    english = [i for i in infos if (_first_text(i, "language") or "en").lower().startswith("en")]
    infos = english or infos

    now = datetime.now(timezone.utc)
    out = []
    for info in infos:
        event = _first_text(info, "event")
        headline = _first_text(info, "headline") or event
        description = _first_text(info, "description")
        severity = _first_text(info, "severity")

        blob = f"{event} {headline} {description}".lower()
        if not any(w in blob for w in WEATHER_WORDS):
            continue

        expires = _parse_time(_first_text(info, "expires"))
        if expires and expires < now:
            continue

        cyclone = any(w in blob for w in CYCLONE_WORDS)

        areas = []
        for a in _kids(info, "area"):
            geocodes = []
            for g in _kids(a, "geocode"):
                geocodes.append(f"{_first_text(g, 'valueName')}={_first_text(g, 'value')}"[:60])
            areas.append({
                "desc": _first_text(a, "areaDesc"),
                "polygons": [(p.text or "").strip() for p in _kids(a, "polygon")],
                "circles": [(c.text or "").strip() for c in _kids(a, "circle")],
                "tags": sorted({_strip(c.tag) for c in a}),
                "geocodes": geocodes,
            })

        resources = []
        for r in _kids(info, "resource"):
            resources.append(f"{_first_text(r, 'mimeType')} {_first_text(r, 'uri')}"[:120])

        out.append({
            "text": f"{headline} {description}".lower(),
            "resources": resources,
            "event": event,
            "headline": headline,
            "severity": severity,
            "source": sender,
            "expires": expires.isoformat() if expires else None,
            "cyclone": cyclone,
            "level": _level_for(event, headline, severity, cyclone),
            "areas": areas,
        })
    return out


def _feed_links():
    links = []
    for url in FEEDS:
        try:
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            r.raise_for_status()
            root = ET.fromstring(r.content)
            for el in root.iter():
                if _strip(el.tag) in ("item", "entry"):
                    link = ""
                    for c in el:
                        if _strip(c.tag) == "link":
                            link = (c.text or "").strip() or c.attrib.get("href", "")
                    if link:
                        links.append(link)
        except Exception as e:
            print("Alert feed error:", url, e)

    seen, unique = set(), []
    for link in links:
        if link not in seen:
            seen.add(link)
            unique.append(link)
    return unique[:MAX_ITEMS]


def _load_alerts():
    """All current weather alerts in India, cached."""
    now = time.time()
    if now - _alert_cache["t"] < ALERT_TTL:
        return _alert_cache["alerts"]

    links = _feed_links()
    if not links:
        # feeds unreachable: keep the old alerts and retry soon
        _alert_cache["t"] = now - ALERT_TTL + RETRY_AFTER
        return _alert_cache["alerts"]

    def one(url):
        try:
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            r.raise_for_status()
            return _parse_cap(r.content)
        except Exception as e:
            print("CAP parse error:", url, e)
            return []

    alerts = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for res in pool.map(one, links):
            alerts.extend(res)

    _alert_cache["t"] = now
    _alert_cache["alerts"] = alerts
    return alerts


# ----------------------------------------------------------- location match ---

def _place_names(lat, lon):
    """GPS -> state and district / city names (cached by rounded position)."""
    key = (round(lat, 2), round(lon, 2))
    if key in _geo_cache:
        return _geo_cache[key]

    try:
        resp = requests.get(
            NOMINATIM_URL,
            params={"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 10, "addressdetails": 1},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            # usually 403 / 429: Nominatim blocks shared cloud servers or placeholder e-mails
            print("Reverse geocode HTTP", resp.status_code)
            return {"state": "", "places": []}
        res = resp.json()
        addr = res.get("address") or {}
        places = []
        for k in ("state_district", "county", "city", "town", "village", "suburb"):
            v = (addr.get(k) or "").lower().replace(" district", "").strip()
            if len(v) >= 3 and v not in places:
                places.append(v)
        names = {"state": (addr.get("state") or "").lower(), "places": places}
        if names["state"] or names["places"]:      # never cache an empty answer
            _geo_cache[key] = names
        return names
    except Exception as e:
        print("Reverse geocode error:", e)
        return {"state": "", "places": []}


def _pts(text):
    """
    Extract (lat, lon) pairs from CAP polygon text.
    Reads every number, so odd spacing / separators do not break it.
    If a pair looks like lon,lat (first > 40, second < 40) it is swapped:
    India's latitudes are below 40, its longitudes above 68.
    """
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", text or "")]
    pts = []
    for i in range(0, len(nums) - 1, 2):
        a, b = nums[i], nums[i + 1]
        if a > 40 and b < 40:      # written as lon,lat -> swap
            a, b = b, a
        pts.append((a, b))
    return pts


def _in_polygon(lat, lon, text):
    pts = _pts(text)
    if len(pts) < 3:
        return False
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        yi, xi = pts[i]
        yj, xj = pts[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _in_circle(lat, lon, text):
    """CAP circle text: 'lat,lon radius_km'"""
    try:
        nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", text or "")]
        if len(nums) < 3:
            return False
        clat, clon, radius = nums[0], nums[1], nums[2]
        if clat > 40 and clon < 40:    # lon,lat order -> swap
            clat, clon = clon, clat
        dlat, dlon = radians(lat - clat), radians(lon - clon)
        a = sin(dlat / 2) ** 2 + cos(radians(clat)) * cos(radians(lat)) * sin(dlon / 2) ** 2
        return 6371 * 2 * asin(sqrt(a)) <= radius
    except Exception:
        return False


def _matches(alert, lat, lon, names):
    # Fallback for alerts that carry no polygon/circle at all: look for the
    # user's district (or, for cyclones, state) in the alert's own text.
    has_geometry = any(ar["polygons"] or ar["circles"] for ar in alert["areas"])
    if not has_geometry:
        text = alert.get("text", "")
        if any(_has(text, p) for p in names["places"]):
            return True
        if alert["cyclone"] and names["state"] and _has(text, names["state"]):
            return True

    for area in alert["areas"]:
        if any(_in_polygon(lat, lon, p) for p in area["polygons"]):
            return True
        if any(_in_circle(lat, lon, c) for c in area["circles"]):
            return True
        desc = (area["desc"] or "").lower()
        if any(_has(desc, p) for p in names["places"]):
            return True
        # a state-wide area only counts for cyclones, so a heat alert for another
        # district of the same state does not light up this user
        if names["state"] and _has(desc, names["state"]) and alert["cyclone"]:
            return True
    return False


# ------------------------------------------------------------------ public ---

def get_alert_for_location(lat: float, lon: float, state=None, district=None):
    """
    Returns:
      {"level": "LOW|MEDIUM|HIGH",
       "alerts": [{"headline","event","severity","level","source","expires"}, ...],
       "debug": {...}}
    Never raises. If anything fails the level is LOW and alerts is empty.
    """
    try:
        alerts = _load_alerts()
        names = _place_names(lat, lon)

        # Names sent by the user's browser only fill gaps when the server lookup failed.
        # (Before using this for payouts, verify the location on the server instead.)
        extra_state = (state or "").strip().lower()
        extra_place = (district or "").strip().lower().replace(" district", "")
        names = {"state": names["state"] or extra_state, "places": list(names["places"])}
        if len(extra_place) >= 3 and extra_place not in names["places"]:
            names["places"].append(extra_place)

        hits = [a for a in alerts if _matches(a, lat, lon, names)]
        hits.sort(key=lambda a: LEVEL_ORDER[a["level"]], reverse=True)

        level = hits[0]["level"] if hits else "LOW"
        return {
            "level": level,
            "alerts": [
                {k: a[k] for k in ("headline", "event", "severity", "level", "source", "expires")}
                for a in hits[:5]
            ],
            "debug": {
                "alerts_loaded": len(alerts),
                "cyclone_alerts": sum(1 for a in alerts if a["cyclone"]),
                "state": names["state"],
                "places": names["places"],
                "sample_events": [a["headline"][:80] for a in alerts[:8]],
                # geometry info: polys=0 means the alert carries no polygon at all
                "sample_areas": [
                    f"{ar['desc'][:30]} | polys={len(ar['polygons'])} circles={len(ar['circles'])} "
                    f"tags={ar['tags']} geocodes={ar['geocodes'][:2]} "
                    f"resources={a['resources'][:1]} text={a['text'][:120]}"
                    for a in alerts if a["cyclone"] for ar in a["areas"]
                ][:3],
            },
        }
    except Exception as e:
        print("Alert lookup failed:", e)
        return {"level": "LOW", "alerts": [], "debug": {"error": str(e)}}
