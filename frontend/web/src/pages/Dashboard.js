import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";

import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "../styles/zensurex-ui.css";
import RainCanvas from "../components/RainCanvas";
import CountUp from "../components/CountUp";

const API_BASE = "https://zensurex-backend.onrender.com";

const RISK = { LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#ef4444" };

const inr = n => Number(n || 0).toLocaleString("en-IN");

const PERILS = [
  { key: "rain", icon: "🌧", label: "Heavy rain" },
  { key: "heat", icon: "🔥", label: "Extreme heat" },
  { key: "pollution", icon: "🌫", label: "High pollution" },
  { key: "demand", icon: "📉", label: "Demand drop" },
  { key: "accident", icon: "🚑", label: "Accident protection" }
];

const PLAN_COVERS = {
  Basic: ["rain", "demand"],
  Moderate: ["rain", "pollution", "demand"],
  Premium: ["rain", "heat", "pollution", "demand", "accident"]
};

function aqiLabel(a) {
  if (a <= 50) return "Good";
  if (a <= 100) return "Satisfactory";
  if (a <= 200) return "Moderate";
  if (a <= 300) return "Poor";
  return "Severe";
}

function makePin(color) {
  return L.divIcon({
    className: "",
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    popupAnchor: [0, -40],
    html: `
      <div class="zx-pin">
        <span class="zx-pin-pulse" style="background:${color}"></span>
        <svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.2 0 0 7 0 15.7 0 27.5 16 44 16 44s16-16.5 16-28.3C32 7 24.8 0 16 0z"
                fill="${color}" stroke="#ffffff" stroke-width="2"/>
          <circle cx="16" cy="15.5" r="6" fill="#ffffff"/>
        </svg>
      </div>`
  });
}

// Small "i" with a tooltip. Hover on desktop, tap on mobile.
function InfoTip({ text }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  function show() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const width = 230;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    setPos({ top: r.bottom + 8, left, width });
  }

  function hide() {
    setPos(null);
  }

  useEffect(() => {
    if (!pos) return undefined;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos]);

  return (
    <>
      <span
        ref={ref}
        className="zx-info"
        role="button"
        tabIndex={0}
        aria-label="About the community pool"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={e => {
          e.stopPropagation();
          if (pos) hide();
          else show();
        }}
      >
        i
      </span>
      {pos &&
        createPortal(
          <div className="zx-tooltip" role="tooltip" style={{ top: pos.top, left: pos.left, width: pos.width }}>
            {text}
          </div>,
          document.body
        )}
    </>
  );
}

// Half-circle risk meter with a needle
function RiskGauge({ risk }) {
  const rotation = { LOW: -60, MEDIUM: 0, HIGH: 60 }[risk] ?? -90;

  const pt = (deg, r) => {
    const a = (deg * Math.PI) / 180;
    return [100 + r * Math.cos(a), 100 - r * Math.sin(a)];
  };
  const arc = (from, to) => {
    const [x1, y1] = pt(from, 80);
    const [x2, y2] = pt(to, 80);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A 80 80 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };

  const segments = [
    { key: "LOW", from: 178, to: 122 },
    { key: "MEDIUM", from: 118, to: 62 },
    { key: "HIGH", from: 58, to: 2 }
  ];

  return (
    <svg viewBox="0 0 200 112" width="100%" style={{ maxWidth: 250 }} role="img" aria-label={`Risk level ${risk || "loading"}`}>
      {segments.map(s => (
        <path
          key={s.key}
          d={arc(s.from, s.to)}
          fill="none"
          stroke={RISK[s.key]}
          strokeWidth="15"
          strokeLinecap="round"
          opacity={risk === s.key ? 1 : 0.3}
        />
      ))}
      <g
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "100px 100px",
          transition: "transform 1.1s cubic-bezier(.3,1.4,.5,1)"
        }}
      >
        <line x1="100" y1="100" x2="100" y2="38" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="100" r="8" fill="#fff" />
    </svg>
  );
}

function Dashboard() {

  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [pool, setPool] = useState(null);
  const [position, setPosition] = useState([17.385, 78.4867]);
  const [accuracy, setAccuracy] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tick, setTick] = useState(0);

  // true once the browser gave us a real GPS position
  const gpsUsed = useRef(false);

  const city = localStorage.getItem("city");

  let userName = "";
  try {
    userName = JSON.parse(localStorage.getItem("user"))?.name || "";
  } catch (e) {
    userName = "";
  }

  // ---- values from the backend ----
  const temp = data?.weather?.temp ?? 0;
  const humidity = data?.weather?.humidity;
  const rainMm = data?.weather?.rain_mm ?? 0;
  const aqi = data?.aqi ?? 0;
  const usingGps = data?.location_source === "gps";
  const shownCity = data?.city || city || "Your area";
  const forecast = data?.forecast || null;
  const next6 = forecast?.h6?.risk || "";

  // ---- rain effect: real rain, or ?rain=1 / ?rain=2 to preview ----
  const demo = new URLSearchParams(window.location.search).get("rain");
  const raining = demo === "1" || demo === "2" || rainMm > 0.1;
  const stormy = demo === "2" || rainMm > 7.5;
  const rainIntensity = demo ? (demo === "2" ? 1 : 0.6) : Math.min(1, 0.25 + rainMm / 10);

  let scene = "clear";
  if (raining) scene = "rain";
  else if (temp > 38) scene = "hot";
  else if (aqi > 200) scene = "smog";

  const hour = new Date().getHours();
  const sceneIcon = {
    rain: "🌧",
    hot: "🔥",
    smog: "🌫",
    clear: hour >= 19 || hour < 6 ? "🌙" : "☀️"
  }[scene];

  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ---- next payout ----
  let nextPayout = "Loading";
  let nextPayoutNote = "";
  if (pool) {
    if (!pool.plan) {
      nextPayout = "No active plan";
      nextPayoutNote = "Choose a plan to be covered";
    } else if (data?.outlook_risk === "HIGH") {
      nextPayout = "Payout ready";
      nextPayoutNote = "High risk ahead, pays on trigger";
    } else {
      nextPayout = "No disruption";
      nextPayoutNote = pool.locked_until
        ? `Plan active until ${new Date(pool.locked_until).toLocaleDateString()}`
        : "";
    }
  }

  // ---- banner under the hero ----
  let banner = { tone: "", icon: "✅", text: "Conditions are stable. Auto payout is watching your zone." };
  if (data) {
    if (data.outlook_risk === "HIGH") {
      banner = {
        tone: "danger",
        icon: "⚠️",
        text: pool?.plan
          ? "High risk ahead. Your plan pays out automatically if conditions trigger it."
          : "High risk ahead and you have no active plan. Choose a plan to stay covered."
      };
    } else if (raining) {
      banner = { tone: "warn", icon: "🌧", text: "It is raining in your area right now. Rain cover is being monitored." };
    } else if (forecast?.h3?.pop >= 50) {
      banner = { tone: "warn", icon: "☔", text: `Rain likely in the next 3 hours (${forecast.h3.pop}% chance).` };
    }
  }

  // ---- Income Disruption Trend: real weekly payouts, no fake numbers ----
  const trend = pool?.trend || [];
  const hasTrend = trend.some(t => Number(t.payout) > 0);

  const covered = PLAN_COVERS[pool?.plan] || [];

  async function getCityCoordinates(cityName) {
    try {
      const res = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`
      );
      if (res.data.length > 0) {
        return [parseFloat(res.data[0].lat), parseFloat(res.data[0].lon)];
      }
    } catch (err) {
      console.error("Location error:", err);
    }
    return [20.5937, 78.9629];
  }

  // refresh every 5 minutes so rain shows up without a manual reload
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // RISK: GPS first, saved city as fallback
  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    async function load(params) {
      try {
        const res = await axios.get(`${API_BASE}/risk/`, { headers, params });
        setData(res.data);
        setUpdatedAt(new Date());
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        if (params && params.lat !== undefined) {
          load(city ? { city } : {});
          return;
        }
        console.error(err);
      }
    }

    const byCity = () => load(city ? { city } : {});

    if (!navigator.geolocation) {
      byCity();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy: acc } = pos.coords;
        gpsUsed.current = true;
        setPosition([latitude, longitude]);
        setAccuracy(acc);
        load({ lat: latitude, lon: longitude });
      },
      () => byCity(),
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, [city, navigate, tick]);

  // POOL, PLAN, COVERAGE: real values (reload after risk so the GPS zone is saved)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !data) return;
    axios
      .get(`${API_BASE}/pool/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setPool(res.data))
      .catch(err => console.error("Pool load failed", err));
  }, [data]);

  // MAP: saved city only when GPS was not used
  useEffect(() => {
    const target = city || data?.city;

    async function updateLocation() {
      if (target) {
        const coords = await getCityCoordinates(target);
        if (!gpsUsed.current) setPosition(coords);
      }
    }
    updateLocation();
  }, [city, data?.city]);

  const riskKey = data?.risk || "LOW";
  const riskColor = RISK[riskKey] || RISK.LOW;

  const forecastCards = [
    { label: "Now", temp, rain: rainMm, pop: null, risk: data?.risk },
    forecast?.h3 && { label: "Next 3 hours", temp: forecast.h3.temp, rain: forecast.h3.rain_mm, pop: forecast.h3.pop, risk: forecast.h3.risk },
    forecast?.h6 && { label: "Next 6 hours", temp: forecast.h6.temp, rain: forecast.h6.rain_mm, pop: forecast.h6.pop, risk: forecast.h6.risk }
  ].filter(Boolean);

  const skel = (w, h = 26) => <span className="zx-skel" style={{ width: w, height: h }} />;

  return (

    <section className="scene active">

      {raining && <RainCanvas intensity={rainIntensity} storm={stormy} />}

      <div className="zx-page">

        {/* HERO */}
        <div className={`zx-hero zx-scene-${scene} zx-rise`} style={{ "--i": 0 }}>

          <div>
            <p className="zx-greet">{greeting}</p>
            <h1 className="zx-name">{userName || "Welcome back"} 👋</h1>

            <p className="zx-loc">
              <span className="zx-live-dot" />
              {usingGps ? "Live location" : shownCity}
              {usingGps && data?.city ? ` (profile city: ${data.city})` : ""}
              {updatedAt ? `  •  Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>

            <div className="zx-temp-row">
              <span className="zx-temp-icon">{sceneIcon}</span>
              <span className="zx-temp">{data ? `${Number(temp).toFixed(0)}°C` : "--"}</span>
            </div>

            {data && (
              <div className="zx-chips">
                {humidity !== undefined && <span className="zx-chip">💧 Humidity {humidity}%</span>}
                <span className="zx-chip">🌧 Rain {Number(rainMm).toFixed(1)} mm/h</span>
                <span className="zx-chip">🌫 AQI {aqi} ({aqiLabel(aqi)})</span>
              </div>
            )}
          </div>

          <div className="zx-gauge-box">
            <RiskGauge risk={data?.risk} />
            <p className="zx-gauge-value">{data ? `${data.risk} risk` : "Checking risk"}</p>
            <p className="zx-gauge-label">
              Next 6 hours: {data ? (next6 || "Unavailable") : "..."}
            </p>
            <button className="zx-refresh" onClick={() => setTick(t => t + 1)}>
              Refresh now
            </button>
          </div>

        </div>

        {/* BANNER */}
        {data && (
          <div className={`zx-banner ${banner.tone ? `zx-banner-${banner.tone}` : ""} zx-rise`} style={{ "--i": 1 }}>
            <span>{banner.icon}</span>
            <span>{banner.text}</span>
          </div>
        )}

        {/* KPI CARDS */}
        <div className="zx-kpis">

          <div className="zx-kpi zx-rise" style={{ "--i": 2 }}>
            <p className="zx-kpi-label">📋 Active plan</p>
            <p className="zx-kpi-value">{pool ? (pool.plan || "No plan") : skel(80)}</p>
            {pool && !pool.plan ? (
              <button className="zx-cta" onClick={() => navigate("/policy")}>Choose a plan</button>
            ) : (
              <p className="zx-kpi-sub">
                {pool?.locked_until ? `Until ${new Date(pool.locked_until).toLocaleDateString()}` : "\u00a0"}
              </p>
            )}
          </div>

          <div className="zx-kpi zx-rise" style={{ "--i": 3 }}>
            <p className="zx-kpi-label">💰 Weekly premium</p>
            <p className="zx-kpi-value">{pool ? <CountUp value={pool.premium} prefix="₹" /> : skel(80)}</p>
            <p className="zx-kpi-sub">{data?.price ? `Price today: ₹${data.price}` : "\u00a0"}</p>
          </div>

          <div className="zx-kpi zx-rise" style={{ "--i": 4 }}>
            <p className="zx-kpi-label">📊 Coverage amount</p>
            <p className="zx-kpi-value">{pool ? <CountUp value={pool.coverage} prefix="₹" /> : skel(80)}</p>
            <p className="zx-kpi-sub">Maximum protected</p>
          </div>

          <div className="zx-kpi zx-kpi-click zx-rise" style={{ "--i": 5 }} onClick={() => navigate("/pool")}>
            <p className="zx-kpi-label">
              👥 Community pool
              <InfoTip text="Workers in your area share a small weekly premium. When rain, heat or pollution disrupts work, payouts come from this shared pool. Tap the card to see members and activity." />
            </p>
            <p className="zx-kpi-value green">{pool ? <CountUp value={pool.balance} prefix="₹" /> : skel(90)}</p>
            <p className="zx-kpi-sub">
              {pool ? `${pool.member_count} ${pool.member_count === 1 ? "member" : "members"} • ${pool.zone_label}` : "\u00a0"}
            </p>
          </div>

          <div className="zx-kpi zx-rise" style={{ "--i": 6 }}>
            <p className="zx-kpi-label">⏱ Next payout</p>
            <p className="zx-kpi-value" style={{ fontSize: 18 }}>{pool ? nextPayout : skel(100)}</p>
            <p className="zx-kpi-sub">
              <span className="zx-live-dot" />Auto payout enabled
            </p>
            {nextPayoutNote ? <p className="zx-kpi-sub">{nextPayoutNote}</p> : null}
          </div>

        </div>

        <div className="zx-grid">

          {/* LEFT COLUMN */}
          <div className="zx-col">

            {/* MAP */}
            <div className="zx-card zx-rise" style={{ "--i": 7 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">Your location</h3>
                  <p className="zx-card-sub">
                    {usingGps
                      ? `Exact GPS position${accuracy ? ` (accurate to about ${Math.round(accuracy)} m)` : ""}`
                      : "Approximate position from your saved city. Allow location for an exact pin."}
                  </p>
                </div>
              </div>

              <div className="zx-map-wrap">
                <MapContainer
                  center={position}
                  key={position.toString()}
                  zoom={usingGps ? 15 : 13}
                  className="zx-map"
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                  {data?.risk && (
                    <Circle
                      center={position}
                      radius={800}
                      pathOptions={{ color: riskColor, fillColor: riskColor, fillOpacity: 0.2, weight: 2 }}
                    />
                  )}

                  {usingGps && accuracy && accuracy < 2000 && (
                    <Circle
                      center={position}
                      radius={accuracy}
                      pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.12, weight: 1 }}
                    />
                  )}

                  <Marker position={position} icon={makePin(riskColor)}>
                    <Popup>
                      <b>{usingGps ? "You are here" : "Saved city (approximate)"}</b>
                      <br />
                      Risk: {data?.risk || "Loading"}
                    </Popup>
                  </Marker>
                </MapContainer>

                <div className="zx-legend">
                  <div className="zx-legend-row">
                    {["LOW", "MEDIUM", "HIGH"].map(k => (
                      <span
                        key={k}
                        className="zx-legend-item"
                        style={{ fontWeight: data?.risk === k ? 800 : 400 }}
                      >
                        <span className="zx-dot" style={{ background: RISK[k] }} />
                        {k.charAt(0) + k.slice(1).toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* TREND */}
            <div className="zx-card zx-rise" style={{ "--i": 8 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">Income disruption trend</h3>
                  <p className="zx-card-sub">Payouts released from your zone's pool, last 4 weeks</p>
                </div>
              </div>

              {!pool ? (
                <div className="zx-empty"><span className="zx-skel" style={{ width: "100%", height: 160 }} /></div>
              ) : !hasTrend ? (
                <div className="zx-empty">
                  <span className="zx-empty-icon">☂️</span>
                  <b>No disruptions recorded yet</b>
                  <span className="zx-muted">Nothing has interrupted earnings in the last 4 weeks. Payouts appear here when a claim is approved.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="zxPayout" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="period" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => `₹${v}`} tickLine={false} axisLine={false} />
                    <Tooltip formatter={v => [`₹${inr(v)}`, "Payout"]} />
                    <Area type="monotone" dataKey="payout" stroke="#ef4444" strokeWidth={3} fill="url(#zxPayout)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN */}
          <div className="zx-col">

            {/* FORECAST */}
            <div className="zx-card zx-rise" style={{ "--i": 9 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">Weather outlook</h3>
                  <p className="zx-card-sub">
                    Outlook risk:{" "}
                    <b style={{ color: RISK[data?.outlook_risk] || "#64748b" }}>{data?.outlook_risk || "..."}</b>
                  </p>
                </div>
              </div>

              {!data ? (
                <span className="zx-skel" style={{ width: "100%", height: 110 }} />
              ) : !forecast ? (
                <p className="zx-muted">Forecast unavailable right now. Showing current conditions only.</p>
              ) : (
                <div className="zx-forecast">
                  {forecastCards.map(c => (
                    <div key={c.label} className="zx-fc" style={{ "--c": RISK[c.risk] || "#94a3b8" }}>
                      <p className="zx-fc-label">{c.label}</p>
                      <p className="zx-fc-temp">{Number(c.temp).toFixed(0)}°C</p>
                      <p className="zx-fc-risk">{c.risk}</p>
                      <p className="zx-fc-meta">🌧 {Number(c.rain).toFixed(1)} mm/h</p>
                      {c.pop !== null && (
                        <>
                          <p className="zx-fc-meta">☔ {c.pop}% chance</p>
                          <div className="zx-bar"><div className="zx-bar-fill" style={{ width: `${c.pop}%` }} /></div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {data?.data_fallback && (
                <p className="zx-muted" style={{ marginTop: 10 }}>⚠ Live weather unavailable, showing estimated values.</p>
              )}
            </div>

            {/* PROTECTION SUMMARY */}
            <div className="zx-card zx-rise" style={{ "--i": 10 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">Protection summary</h3>
                  <p className="zx-card-sub">
                    {pool?.plan ? `What your ${pool.plan} plan covers` : "Choose a plan to start being covered"}
                  </p>
                </div>
              </div>

              <div className="zx-cover-list">
                {PERILS.map(p => {
                  const on = covered.includes(p.key);
                  return (
                    <div key={p.key} className={`zx-cover ${on ? "on" : ""}`}>
                      <span className="zx-cover-icon">{p.icon}</span>
                      <span className="zx-cover-name">{p.label}</span>
                      <span className="zx-cover-state">{on ? "Covered" : "Not in plan"}</span>
                    </div>
                  );
                })}
              </div>

              {pool && pool.plan !== "Premium" && (
                <button className="zx-cta" style={{ marginTop: 14 }} onClick={() => navigate("/policy")}>
                  {pool.plan ? "Upgrade plan" : "Choose a plan"}
                </button>
              )}
            </div>

          </div>

        </div>

      </div>

    </section>

  );

}

export default Dashboard;
