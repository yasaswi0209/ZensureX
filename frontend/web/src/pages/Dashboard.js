import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";

import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";

import "leaflet/dist/leaflet.css";

const API_BASE = "https://zensurex-backend.onrender.com";

const chartData = [
  { period: "Week 1", risk: 18 },
  { period: "Week 2", risk: 32 },
  { period: "Week 3", risk: 25 },
  { period: "Week 4", risk: 40 }
];

const RISK_COLOR = { LOW: "green", MEDIUM: "orange", HIGH: "red" };

function Dashboard() {

  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [pool, setPool] = useState(null);
  const [position, setPosition] = useState([17.385, 78.4867]);

  // true once the browser gave us a real GPS position
  const gpsUsed = useRef(false);

  const city = localStorage.getItem("city");

  const userData = JSON.parse(localStorage.getItem("user"));
  const userName = userData?.name;

  // Values from the backend
  const temp = data?.weather?.temp ?? 0;
  const humidity = data?.weather?.humidity;
  const rainMm = data?.weather?.rain_mm ?? 0;
  const aqi = data?.aqi ?? 0;
  const usingGps = data?.location_source === "gps";
  const shownCity = data?.city || city || "Your area";

  const inr = n => Number(n || 0).toLocaleString("en-IN");

  // Next payout: real state, not a fixed number
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

  const forecast = data?.forecast || null;
  const next6 = forecast?.h6?.risk || "";

  async function getCityCoordinates(cityName) {
    try {
      const res = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`
      );

      if (res.data.length > 0) {
        return [
          parseFloat(res.data[0].lat),
          parseFloat(res.data[0].lon)
        ];
      }
    } catch (err) {
      console.error("Location error:", err);
    }

    return [20.5937, 78.9629]; // fallback
  }

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
        const { latitude, longitude } = pos.coords;
        gpsUsed.current = true;
        setPosition([latitude, longitude]);
        load({ lat: latitude, lon: longitude });
      },
      () => byCity(),
      { timeout: 8000 }
    );
  }, [city, navigate]);

  // POOL, PLAN, COVERAGE: real values from the backend (reload after risk so the GPS zone is saved)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !data) return;
    axios
      .get(`${API_BASE}/pool/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setPool(res.data))
      .catch(err => console.error("Pool load failed", err));
  }, [data]);

  // MAP: use the saved city only when GPS was not used
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

  const circleColor = RISK_COLOR[data?.risk] || "green";

  const forecastRows = forecast
    ? [
        { label: "Next 3h", slot: forecast.h3 },
        { label: "Next 6h", slot: forecast.h6 }
      ]
    : [];

  return (

    <section className="scene active">

      <div className="scene-layout">

        {/* HEADER */}

        <div className="dashboard-header">

          <div>

            <h2 className="welcome-title">
              Welcome back, {userName} 👋
            </h2>

            <p className="muted">
              📍 {usingGps ? "Live location" : shownCity}
              {usingGps && data?.city ? ` (profile city: ${data.city})` : ""}
              {" "}• Coverage & earnings overview
            </p>

            {data && (
              <p className="muted">
                🌡 {Number(temp).toFixed(1)}°C
                {humidity !== undefined ? ` • 💧 ${humidity}%` : ""}
                {" "}• 🌧 {Number(rainMm).toFixed(1)} mm/h • 🌫 AQI {aqi}
              </p>
            )}

          </div>

        </div>

        {/* LIVE STATUS */}

        <div className="status-grid">

          <motion.div className="status-card glass">
            <div className="status-icon risk">⚠</div>
            <div>
              <p className="status-label">Risk Level</p>
              <p className={`status-value ${data?.risk?.toLowerCase()}`}>
                {data?.risk || "Loading"}
              </p>
            </div>
          </motion.div>

          <motion.div className="status-card glass">
            <div className="status-icon location">📍</div>
            <div>
              <p className="status-label">Location</p>
              <p className="status-value">
                {data ? (usingGps ? "Live GPS" : "Saved city") : "Loading"}
              </p>
            </div>
          </motion.div>

          <motion.div className="status-card glass">
            <div className="status-icon protection">🛡</div>
            <div>
              <p className="status-label">Next 6h Risk (forecast)</p>
              <p className={`status-value ${next6.toLowerCase()}`}>
                {data ? (next6 || "Unavailable") : "Loading"}
              </p>
            </div>
          </motion.div>

          <motion.div className="status-card glass">
            <div className="status-icon payout">💰</div>
            <div>
              <p className="status-label">Auto Payout</p>
              <p className="status-value">Enabled</p>
            </div>
          </motion.div>

        </div>

        <div className="dashboard-grid">

          {/* LEFT */}

          <div className="left-panel">

            {/* MAP */}

            <motion.div className="dashboard-panel">

              <h3 className="dp-title">Your Location</h3>

              <MapContainer
                center={position}
                key={position.toString()}
                zoom={13}
                className="map-rect"
              >

                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                <Marker position={position}>
                  <Popup>You are here</Popup>
                </Marker>

                {data?.risk && (
                  <Circle
                    center={position}
                    radius={800}
                    pathOptions={{
                      color: circleColor,
                      fillColor: circleColor,
                      fillOpacity: 0.4
                    }}
                  />
                )}

              </MapContainer>

            </motion.div>

            {/* GRAPH */}

            <motion.div className="dashboard-panel">

              <h3 className="dp-title">Income Disruption Trend</h3>

              <ResponsiveContainer width="100%" height={260}>

                <BarChart data={chartData}>

                  <defs>
                    <linearGradient id="riskColor">
                      <stop offset="5%" stopColor="#ff4d4f" />
                      <stop offset="95%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke="#f1f5f9" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />

                  <Bar
                    dataKey="risk"
                    fill="url(#riskColor)"
                    radius={[8, 8, 0, 0]}
                  />

                </BarChart>

              </ResponsiveContainer>

            </motion.div>

          </div>

          {/* RIGHT */}

          <div className="right-panel">

            {/* STATS */}

            <div className="dash-stats-grid">

              <motion.div className="dash-stat-card glass risk-card">

                <motion.button
                  className="upgrade-btn"
                  onClick={() => navigate("/policy")}
                  whileHover={{ scale: 1.05 }}
                >
                  🚀 Choose Plan
                </motion.button>

                <p className="dsc-label">⚠ Risk Level</p>

                <h3 className={`card-value ${data?.risk?.toLowerCase()}`}>
                  {data?.risk || "Loading..."}
                </h3>

              </motion.div>

              <motion.div
                className="dash-stat-card glass pool-card clickable"
                onClick={() => navigate("/pool")}
              >
                <p className="dsc-label">👥 Community Pool</p>
                <h3 className="card-value">{pool ? `₹${inr(pool.balance)}` : "Loading"}</h3>
                {pool ? <p className="muted">{pool.member_count} members • {pool.zone_label}</p> : null}
              </motion.div>

              <motion.div className="dash-stat-card glass plan-card">
                <p className="dsc-label">📋 Active Plan</p>
                <h3 className="card-value">{pool ? (pool.plan || "No Plan") : "Loading"}</h3>
              </motion.div>

              <motion.div className="dash-stat-card glass premium-card">
                <p className="dsc-label">💰 Weekly Premium</p>
                <h3 className="card-value">{pool ? `₹${inr(pool.premium)}` : "Loading"}</h3>
                {data?.price ? (
                  <p className="muted">Price today: ₹{data.price}</p>
                ) : null}
              </motion.div>

              <motion.div className="dash-stat-card glass">
                <p className="dsc-label">📊 Coverage Amount</p>
                <h3 className="card-value">{pool ? `₹${inr(pool.coverage)}` : "Loading"}</h3>
              </motion.div>

              <motion.div className="dash-stat-card glass">
                <p className="dsc-label">⏱ Next Payout</p>
                <h3 className="card-value">{nextPayout}</h3>
                {nextPayoutNote ? <p className="muted">{nextPayoutNote}</p> : null}
              </motion.div>

            </div>

            {/* FORECAST */}

            <motion.div className="dashboard-panel">

              <h3 className="dp-title">Next 3h / 6h Weather</h3>

              {!data ? (
                <p>Loading...</p>
              ) : forecast ? (
                <>
                  {forecastRows.map(r => (
                    <div key={r.label} style={{ marginBottom: "10px" }}>
                      <p style={{ margin: 0 }}>
                        <b>{r.label}</b>{" "}
                        <span style={{ color: RISK_COLOR[r.slot.risk], fontWeight: "bold" }}>
                          {r.slot.risk}
                        </span>
                      </p>
                      <p className="muted" style={{ margin: 0 }}>
                        🌡 {Number(r.slot.temp).toFixed(1)}°C
                        {" "}• 🌧 {Number(r.slot.rain_mm).toFixed(1)} mm/h
                        {" "}• ☔ {r.slot.pop}% chance
                      </p>
                    </div>
                  ))}

                  <p>
                    <b>Outlook:</b>{" "}
                    <span style={{ color: RISK_COLOR[data.outlook_risk], fontWeight: "bold" }}>
                      {data.outlook_risk}
                    </span>
                  </p>

                  <p className="muted">
                    Check the Policy page to pick a plan for this outlook.
                  </p>
                </>
              ) : (
                <p className="muted">Forecast unavailable right now.</p>
              )}

              {data?.data_fallback && (
                <p className="muted">
                  ⚠ Live weather unavailable, showing estimated values.
                </p>
              )}

            </motion.div>

            {/* PROTECTION SUMMARY */}

            <motion.div className="dashboard-panel">

              <h3 className="dp-title">Protection Summary</h3>

              <p className="muted">
                Your income is protected from disruption risks.
              </p>

              <div className="mini-features">
                <div className="mini-feature">🌧 Rain protection</div>
                <div className="mini-feature">🔥 Heat risk cover</div>
                <div className="mini-feature">📉 Demand safety</div>
              </div>

            </motion.div>

          </div>

        </div>

      </div>

    </section>

  );

}

export default Dashboard;
