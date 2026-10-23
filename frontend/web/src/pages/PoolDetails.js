import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

import { useState, useEffect } from "react";
import axios from "axios";

import "../styles/zensurex-ui.css";
import CountUp from "../components/CountUp";

const API_BASE = "https://zensurex-backend.onrender.com";

const inr = n => Number(n || 0).toLocaleString("en-IN");

// Night-city skyline, generated once so it never changes between renders
const BUILDINGS = Array.from({ length: 25 }, (_, i) => {
  const w = 38 + ((i * 17) % 18);
  const h = 50 + ((i * 53) % 95);
  return { x: i * 52, w, h, y: 160 - h };
});

const RIDERS = [
  { d: "11s", delay: "-2s", s: "32px" },
  { d: "15s", delay: "-9s", s: "26px" },
  { d: "9s", delay: "-5s", s: "30px" }
];

const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

function avatarColor(name) {
  const sum = String(name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

// Turns coordinates into a readable area name (e.g. "Adyar"). Returns "" on any failure.
async function lookupPlace(lat, lon) {
  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: { format: "jsonv2", lat, lon, zoom: 14 },
      timeout: 5000
    });
    const a = r.data.address || {};
    return a.suburb || a.city_district || a.neighbourhood || a.city || a.town || a.village || "";
  } catch (e) {
    return "";
  }
}

// Reads the browser GPS and saves it on the server. Always resolves, even if denied or failed.
function sendLocation(token) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve();
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const place = await lookupPlace(lat, lon);
        axios
          .post(
            `${API_BASE}/pool/location`,
            { lat, lon, place },
            { headers: { Authorization: `Bearer ${token}` } }
          )
          .catch(() => {})
          .finally(resolve);
      },
      () => resolve(), // permission denied or unavailable: keep the old city pool
      { timeout: 8000, maximumAge: 600000 }
    );
  });
}

function PoolDetails() {

  const [search, setSearch] = useState("");
  const [pool, setPool] = useState(null);
  const [error, setError] = useState("");

  let me = "";
  try {
    me = (JSON.parse(localStorage.getItem("user"))?.name || "").toLowerCase();
  } catch (e) {
    me = "";
  }

  function load() {
    const token = localStorage.getItem("token");
    setError("");
    sendLocation(token)
      .then(() =>
        axios.get(`${API_BASE}/pool/me`, { headers: { Authorization: `Bearer ${token}` } })
      )
      .then(res => setPool(res.data))
      .catch(() => setError("Could not load the pool. Check your connection and try again."));
  }

  useEffect(() => {
    load();
  }, []);

  const workers = pool?.members || [];
  const trend = pool?.trend || [];
  const hasTrend = trend.some(t => Number(t.contribution) > 0 || Number(t.payout) > 0);

  const filtered = workers.filter(w => (w.name || "").toLowerCase().includes(search.toLowerCase()));

  const donut = pool
    ? [
        { name: "Seed funds", value: Number(pool.seed_funds) || 0, color: "#6366f1" },
        { name: "Premiums", value: Number(pool.total_premiums) || 0, color: "#22c55e" },
        { name: "Payouts", value: Number(pool.total_payouts) || 0, color: "#ef4444" }
      ]
    : [];
  const donutTotal = donut.reduce((a, d) => a + d.value, 0);

  const skel = (w, h = 28) => <span className="zx-skel" style={{ width: w, height: h }} />;

  return (

    <section className="scene active">

      <div className="zx-page">

        {/* HERO: night city with riders under the pool shield */}
        <div className="zx-pool-hero zx-rise" style={{ "--i": 0 }}>

          <svg className="zx-skyline" viewBox="0 0 1300 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
            {BUILDINGS.map((b, i) => (
              <g key={i}>
                <rect className="zx-bld" x={b.x} y={b.y} width={b.w} height={b.h} rx="2" />
                {[0, 1, 2].map(j =>
                  (i + j) % 3 === 0 ? null : (
                    <rect
                      key={j}
                      className="zx-win"
                      x={b.x + 8 + (j % 2) * 14}
                      y={b.y + 12 + j * 22}
                      width="6"
                      height="8"
                      style={{ animationDelay: `${((i * 7 + j * 3) % 9) / 3}s` }}
                    />
                  )
                )}
              </g>
            ))}
          </svg>

          <div className="zx-cloud" aria-hidden="true">
            ☁️
            <div className="zx-cloud-rain">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="zx-drop" style={{ left: 4 + i * 5, animationDelay: `${(i * 0.13) % 0.9}s` }} />
              ))}
            </div>
          </div>

          <div className="zx-pool-hero-body">
            <p className="zx-hero-title">Community pool</p>
            <p className="zx-hero-balance">
              {pool ? <CountUp value={pool.balance} prefix="₹" /> : skel(180, 56)}
            </p>
            <p className="zx-hero-zone">
              {pool ? `${pool.zone_label}` : "Loading your zone"}
            </p>
            <span className="zx-hero-pill">
              <span className="zx-live-dot" />
              {pool
                ? `${pool.member_count} ${pool.member_count === 1 ? "rider" : "riders"} protected in this zone`
                : "Checking members"}
            </span>
          </div>

          <div className="zx-shield" aria-hidden="true">🛡</div>

          <div className="zx-road" aria-hidden="true">
            <div className="zx-road-line" />
            {RIDERS.map((r, i) => (
              <span key={i} className="zx-rider" style={{ "--d": r.d, "--delay": r.delay, "--s": r.s }}>🛵</span>
            ))}
          </div>

        </div>

        {error && !pool && (
          <div className="zx-banner zx-banner-danger" style={{ marginTop: 16 }}>
            <span>⚠️</span>
            <span>{error}</span>
            <button className="zx-cta" style={{ marginLeft: "auto", marginTop: 0 }} onClick={load}>Try again</button>
          </div>
        )}

        {/* FLOW DIAGRAM */}
        <div className="zx-card zx-rise" style={{ "--i": 2, margin: "18px 0" }}>
          <div className="zx-card-head">
            <div>
              <h3 className="zx-card-title">How the pool protects you</h3>
              <p className="zx-card-sub">Riders in the same area chip in weekly. Disruptions are paid from the shared fund.</p>
            </div>
          </div>

          <div className="zx-flow">

            <div className="zx-node">
              <div className="zx-node-icon">🛵</div>
              <p className="zx-node-title">Riders contribute</p>
              <p className="zx-node-num">{pool ? `₹${inr(pool.total_premiums)}` : skel(70, 22)}</p>
              <p className="zx-node-sub">{pool ? `from ${pool.member_count} ${pool.member_count === 1 ? "rider" : "riders"} every week` : "\u00a0"}</p>
            </div>

            <div className="zx-link" aria-hidden="true">
              <span className="zx-coin" style={{ "--cd": "0s" }} />
              <span className="zx-coin" style={{ "--cd": "0.8s" }} />
              <span className="zx-coin" style={{ "--cd": "1.6s" }} />
            </div>

            <div className="zx-node zx-node-mid">
              <div className="zx-node-icon">🏦</div>
              <p className="zx-node-title">Shared pool</p>
              <p className="zx-node-num">{pool ? `₹${inr(pool.balance)}` : skel(70, 22)}</p>
              <p className="zx-node-sub">available right now</p>
            </div>

            <div className="zx-link" aria-hidden="true">
              <span className="zx-coin" style={{ "--cd": "0.4s" }} />
              <span className="zx-coin" style={{ "--cd": "1.2s" }} />
              <span className="zx-coin" style={{ "--cd": "2s" }} />
            </div>

            <div className="zx-node">
              <div className="zx-node-icon">🌧</div>
              <p className="zx-node-title">Auto payout</p>
              <p className="zx-node-num">{pool ? `₹${inr(pool.total_payouts)}` : skel(70, 22)}</p>
              <p className="zx-node-sub">paid out for rain, heat and pollution</p>
            </div>

          </div>
        </div>

        {/* STATS */}
        <div className="zx-kpis zx-kpis-4">

          <div className="zx-kpi zx-rise" style={{ "--i": 3 }}>
            <p className="zx-kpi-label">👥 Riders</p>
            <p className="zx-kpi-value">{pool ? <CountUp value={pool.member_count} /> : skel(50)}</p>
            <p className="zx-kpi-sub">active in your zone</p>
          </div>

          <div className="zx-kpi zx-rise" style={{ "--i": 4 }}>
            <p className="zx-kpi-label">📥 Premiums collected</p>
            <p className="zx-kpi-value green">{pool ? <CountUp value={pool.total_premiums} prefix="₹" /> : skel(80)}</p>
            <p className="zx-kpi-sub">{pool ? `plus ₹${inr(pool.seed_funds)} seed funds` : "\u00a0"}</p>
          </div>

          <div className="zx-kpi zx-rise" style={{ "--i": 5 }}>
            <p className="zx-kpi-label">💸 Paid out</p>
            <p className="zx-kpi-value red">{pool ? <CountUp value={pool.total_payouts} prefix="₹" /> : skel(80)}</p>
            <p className="zx-kpi-sub">to riders from this pool</p>
          </div>

          <div className="zx-kpi zx-rise" style={{ "--i": 6 }}>
            <p className="zx-kpi-label">🛡 Your cover</p>
            <p className="zx-kpi-value">{pool ? (pool.plan ? <CountUp value={pool.coverage} prefix="₹" /> : "No plan") : skel(80)}</p>
            <p className="zx-kpi-sub">{pool ? (pool.plan ? `${pool.plan} plan` : "Choose a plan to join") : "\u00a0"}</p>
          </div>

        </div>

        {/* CHARTS */}
        <div className="zx-pool-grid">

          <div className="zx-card zx-rise" style={{ "--i": 7 }}>
            <div className="zx-card-head">
              <div>
                <h3 className="zx-card-title">Contribution vs payout</h3>
                <p className="zx-card-sub">Last 4 weeks</p>
              </div>
            </div>

            {!pool ? (
              <span className="zx-skel" style={{ width: "100%", height: 280 }} />
            ) : !hasTrend ? (
              <div className="zx-empty" style={{ minHeight: 280 }}>
                <span className="zx-empty-icon">📊</span>
                <b>No activity in the last 4 weeks</b>
                <span className="zx-muted">Bars appear when riders pay premiums or claims are paid out.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trend} barGap={6}>
                  <defs>
                    <linearGradient id="zxGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4ade80" />
                      <stop offset="100%" stopColor="#16a34a" />
                    </linearGradient>
                    <linearGradient id="zxRed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" />
                      <stop offset="100%" stopColor="#dc2626" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="period" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={v => `₹${v}`} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v, name) => [`₹${inr(v)}`, name]} />
                  <Legend />
                  <Bar dataKey="contribution" name="Contribution" fill="url(#zxGreen)" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="payout" name="Payout" fill="url(#zxRed)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="zx-card zx-rise" style={{ "--i": 8 }}>
            <div className="zx-card-head">
              <div>
                <h3 className="zx-card-title">Where the money sits</h3>
                <p className="zx-card-sub">Seed funds, premiums and payouts</p>
              </div>
            </div>

            {!pool ? (
              <span className="zx-skel" style={{ width: "100%", height: 210 }} />
            ) : donutTotal === 0 ? (
              <div className="zx-empty" style={{ minHeight: 210 }}>
                <span className="zx-empty-icon">🏦</span>
                <b>The pool is empty</b>
              </div>
            ) : (
              <div className="zx-donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donut.filter(d => d.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={90}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {donut.filter(d => d.value > 0).map(d => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, name) => [`₹${inr(v)}`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="zx-donut-center">
                  <b>₹{inr(pool.balance)}</b>
                  <span>balance</span>
                </div>
              </div>
            )}

            {pool && (
              <div className="zx-donut-legend">
                {donut.map(d => (
                  <div key={d.name}>
                    <span className="zx-dot" style={{ background: d.color }} />
                    {d.name}
                    <b>₹{inr(d.value)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* MEMBERS */}
        <div className="zx-card zx-rise" style={{ "--i": 9 }}>

          <div className="zx-members-head">
            <div>
              <h3 className="zx-card-title">Community members</h3>
              <p className="zx-card-sub">Riders sharing this pool</p>
            </div>
            <input
              className="zx-search"
              placeholder="Search rider"
              aria-label="Search rider"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="zx-member-head">
            <div>Name</div>
            <div>Plan</div>
            <div>Contribution</div>
            <div>Status</div>
          </div>

          {!pool && !error && [0, 1].map(i => (
            <div key={i} style={{ marginBottom: 10 }}>
              <span className="zx-skel" style={{ width: "100%", height: 66, borderRadius: 14 }} />
            </div>
          ))}

          {pool && workers.length === 0 && (
            <div className="zx-empty">
              <span className="zx-empty-icon">🛵</span>
              <b>No riders in this pool yet</b>
              <span className="zx-muted">Riders appear here as soon as they confirm a plan.</span>
            </div>
          )}

          {pool && workers.length > 0 && filtered.length === 0 && (
            <p className="zx-muted">No rider matches "{search}".</p>
          )}

          {filtered.map((w, i) => {
            const isMe = me && (w.name || "").toLowerCase() === me;
            return (
              <div key={`${w.name}-${i}`} className={`zx-member ${isMe ? "me" : ""}`}>

                <div className="zx-member-who">
                  <div className="zx-avatar" style={{ background: avatarColor(w.name) }}>
                    {(w.name || "?").charAt(0).toUpperCase()}
                    <span className="zx-avatar-badge">🛵</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p className="zx-member-name">
                      {w.name}
                      {isMe && <span className="zx-you">You</span>}
                    </p>
                    <p className="zx-muted">{pool?.zone_label}</p>
                  </div>
                </div>

                <div>
                  <span className={`zx-plan zx-plan-${String(w.plan || "").toLowerCase()}`}>🛡 {w.plan}</span>
                </div>

                <div className="zx-contrib">+₹{inr(w.contribution)}/wk</div>

                <div>
                  {w.payout > 0 ? (
                    <span className="zx-status zx-status-paid">₹{inr(w.payout)} paid</span>
                  ) : (
                    <span className="zx-status zx-status-ok">Protected</span>
                  )}
                </div>

              </div>
            );
          })}

        </div>

      </div>

    </section>

  );

}

export default PoolDetails;
