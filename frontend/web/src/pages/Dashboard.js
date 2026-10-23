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
import { useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../utils/AppContext";
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

// Same thresholds as the backend and Policy page (rain in mm/h)
function liveLevel(temp, rainMm, aqi) {
  let level = "LOW";
  if (rainMm > 2.5 || temp > 35 || aqi > 150) level = "MEDIUM";
  if (
    rainMm > 7.5 ||
    temp > 40 ||
    aqi > 200 ||
    (rainMm > 2.5 && (temp > 35 || aqi > 150))
  ) {
    level = "HIGH";
  }
  return level;
}

// Same price formula as the Policy page
function getPlanPrices(mlPrice) {
  const base = mlPrice > 0 ? mlPrice : 20;
  const moderate = Math.round(base * 1.25);
  const premium = Math.max(Math.round(base * 1.5), moderate + 5);
  return { Basic: base, Moderate: moderate, Premium: premium };
}

function getRecommendationDetails(risk) {
  if (risk === "LOW") {
    return { plan: "Basic", reason: "Low disruption probability detected.", confidence: 82 };
  }
  if (risk === "MEDIUM") {
    return { plan: "Moderate", reason: "Moderate environmental risk detected.", confidence: 88 };
  }
  if (risk === "HIGH") {
    return { plan: "Premium", reason: "High disruption probability detected.", confidence: 95 };
  }
  return null;
}

function Dashboard() {

  const { plan, setPlan, premium, setPremium } = useContext(AppContext);

  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [data, setData] = useState(null);
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

  const recommendation = getRecommendationDetails(data?.risk);
  const prices = getPlanPrices(data?.ml_price);

  // Estimate from current conditions (not a true forecast)
  const futureRisk = data ? liveLevel(temp, rainMm, aqi) : "";

  const reasonLines = data?.reason ? data.reason.split("|") : [];
  const mlOnly =
    data?.risk && data.risk !== "LOW" && liveLevel(temp, rainMm, aqi) === "LOW";

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
        // GPS request failed: retry once with the saved city
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
      () => byCity(), // permission denied or timed out
      { timeout: 8000 }
    );
  }, [city, navigate]);

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

  async function upgradePlan(selectedPlan) {

    if (!selectedPlan) return;

    try {

      const token = localStorage.getItem("token");

      const res = await axios.post(
        `${API_BASE}/insurance/upgrade`,
        null,
        {
          params: { plan: selectedPlan },
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setPlan(res.data.plan);
      setPremium(res.data.premium);

      setMessage("Plan upgraded 🚀");

    } catch (err) {
      console.error(err);

      if (err.response?.status === 400) {
        setMessage(err.response.data.detail);
      }
    }
  }

  const circleColor = RISK_COLOR[data?.risk] || "green";

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

            {message && <p className="muted">{message}</p>}

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
              <p className="status-label">Next 6h Risk (estimate)</p>
              <p className={`status-value ${futureRisk.toLowerCase()}`}>
                {futureRisk || "Loading"}
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
                  onClick={() => upgradePlan(recommendation?.plan)}
                  whileHover={{ scale: 1.05 }}
                >
                  🚀 Upgrade Plan
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
                <h3 className="card-value">₹1,50,000</h3>
              </motion.div>

              <motion.div className="dash-stat-card glass plan-card">
                <p className="dsc-label">📋 Active Plan</p>
                <h3 className="card-value">{plan || "No Plan"}</h3>
              </motion.div>

              <motion.div className="dash-stat-card glass premium-card">
                <p className="dsc-label">💰 Weekly Premium</p>
                <h3 className="card-value">₹{premium || 0}</h3>
                {data?.ml_price ? (
                  <p className="muted">AI price today: ₹{data.ml_price}</p>
                ) : null}
              </motion.div>

              <motion.div className="dash-stat-card glass">
                <p className="dsc-label">📊 Coverage Amount</p>
                <h3 className="card-value">₹7,500</h3>
              </motion.div>

              <motion.div className="dash-stat-card glass">
                <p className="dsc-label">⏱ Next Payout</p>
                <h3 className="card-value">5 min</h3>
              </motion.div>

            </div>

            {/* AI */}

            <motion.div className="dashboard-panel">

              <h3 className="dp-title">AI Recommendation</h3>

              {recommendation ? (

                <>

                  <p>
                    <b>Plan:</b>{" "}
                    <span
                      style={{ cursor: "pointer", color: "#6366f1" }}
                      onClick={() => upgradePlan(recommendation.plan)}
                    >
                      {recommendation.plan} • ₹{prices[recommendation.plan]}/week
                      {" "}(Click to upgrade 🚀)
                    </span>
                  </p>

                  <p><b>Reason:</b></p>

                  {reasonLines.length > 0 ? (
                    <ul style={{ margin: "4px 0 8px 18px" }}>
                      {reasonLines.map((line, i) => (
                        <li key={i}>{line.trim()}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{recommendation.reason}</p>
                  )}

                  {mlOnly && (
                    <p className="muted">
                      Current conditions are normal. The {data.risk} level comes
                      from this area's historical risk pattern.
                    </p>
                  )}

                  {data?.data_fallback && (
                    <p className="muted">
                      ⚠ Live weather unavailable, showing estimated values.
                    </p>
                  )}

                  <p>
                    <b>Confidence:</b> {recommendation.confidence}%
                  </p>

                </>

              ) : (

                <p>Analyzing...</p>

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
