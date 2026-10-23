import { useContext, useState, useEffect, useMemo, useRef } from "react";
import { AppContext } from "../utils/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = "https://zensurex-backend.onrender.com";

const RISK_COLOR = { LOW: "green", MEDIUM: "#f59e0b", HIGH: "#ef4444" };

// Same thresholds as the backend (rain in mm/h)
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

function Policy() {

  const navigate = useNavigate();
  const { plan, setPlan } = useContext(AppContext);

  const [city, setCity] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);

  const [risk, setRisk] = useState("");
  const [temp, setTemp] = useState(0);
  const [aqi, setAqi] = useState(0);
  const [mlPrice, setMlPrice] = useState(0);
  const [reason, setReason] = useState("");
  const [rainMm, setRainMm] = useState(0);
  const [futureRisk, setFutureRisk] = useState("");
  const [locationSource, setLocationSource] = useState("saved_city");
  const [dataFallback, setDataFallback] = useState(false);

  // LOCK SYSTEM
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const [countdown, setCountdown] = useState("");
  const [lockDate, setLockDate] = useState(null);
  const [toast, setToast] = useState(null);

  // makes sure the auto claim is sent at most once per page load
  const claimFired = useRef(false);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // AUTO CLAIM
  async function autoTriggerClaim(reasonText) {
    try {
      const token = localStorage.getItem("token");

      const res = await axios.post(
        `${API_BASE}/claims/auto`,
        { reason: reasonText },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showToast(`💰 Auto Claim Approved ₹${res.data.amount}`, "success");

    } catch (err) {
      console.error("Auto claim failed", err);
    }
  }

  // FETCH RISK: GPS first, saved city as fallback
  useEffect(() => {

    const token = localStorage.getItem("token");

    if (!token) {
      showToast("Please login again ⚠️", "error");
      navigate("/login");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    function applyData(data) {
      const t = data.weather?.temp ?? 0;
      const rm = data.weather?.rain_mm ?? 0;
      const a = data.aqi ?? 0;

      setCity(data.city || "Hyderabad");
      setRisk(data.risk || "LOW");
      setTemp(t);
      setAqi(a);
      setRainMm(rm);
      setMlPrice(data.ml_price || 20);
      setReason(data.reason || "Normal conditions");
      setLocationSource(data.location_source || "saved_city");
      setDataFallback(Boolean(data.data_fallback));

      // Estimate from current conditions (not a true forecast)
      setFutureRisk(liveLevel(t, rm, a));

      // Auto claim only on real HIGH conditions and real (non-fallback) data
      const severe = rm > 7.5 || t > 45 || a > 250 || data.risk === "HIGH";
      if (severe && !data.data_fallback && !claimFired.current) {
        claimFired.current = true;
        autoTriggerClaim(data.reason);
      }
    }

    async function load(params) {
      try {
        const res = await axios.get(`${API_BASE}/risk/`, { headers, params });
        applyData(res.data);
      } catch (err) {
        if (err.response?.status === 401) {
          showToast("Session expired ⚠️", "error");
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        // GPS request failed: retry once with the saved city
        if (params && params.lat !== undefined) {
          load({});
          return;
        }
        console.error(err);
        showToast("Failed to load data ❌", "error");
      }
    }

    if (!navigator.geolocation) {
      load({});
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => load({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => load({}),            // permission denied or timed out
      { timeout: 8000 }
    );

  }, [navigate]);

  // EXISTING POLICY / LOCK
  useEffect(() => {

    async function fetchPolicy() {
      try {
        const token = localStorage.getItem("token");

        const res = await axios.get(`${API_BASE}/insurance/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = res.data;

        if (data?.locked_until) {
          const lock = new Date(data.locked_until);
          const now = new Date();

          if (lock > now) {
            setIsLocked(true);
            setLockDate(lock);

            const diff = Math.ceil((lock - now) / (1000 * 60 * 60 * 24));
            setLockMessage(`Plan locked 🔒 (${diff} days remaining)`);
          }
        }

      } catch (err) {
        console.log("No existing policy");
      }
    }

    fetchPolicy();

  }, []);

  // LOCK COUNTDOWN
  useEffect(() => {

    if (!isLocked || !lockDate) return;

    const interval = setInterval(() => {

      const now = new Date();
      const diff = lockDate - now;

      if (diff <= 0) {
        setCountdown("Unlocked ✅");
        clearInterval(interval);
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);

      setCountdown(`${d}d ${h}h ${m}m ${s}s`);

    }, 1000);

    return () => clearInterval(interval);

  }, [isLocked, lockDate]);

  useEffect(() => {
    if (risk === "HIGH") {
      showToast("⚠️ High Risk! Choose Premium Plan", "error");
    }
  }, [risk]);

  function getRecommendedPlan() {
    if (risk === "HIGH") return "Premium";
    if (risk === "MEDIUM") return "Moderate";
    return "Basic";
  }

  const recommendedPlan = getRecommendedPlan();

  // Prices always go up: Basic < Moderate < Premium
  const plans = useMemo(() => {
    const base = mlPrice > 0 ? mlPrice : 20;
    const moderate = Math.round(base * 1.25);
    const premium = Math.max(Math.round(base * 1.5), moderate + 5);

    return [
      {
        name: "Basic",
        price: base,
        desc: "Low risk coverage",
        features: ["Rain protection", "Low demand cover", "UPI payout"]
      },
      {
        name: "Moderate",
        price: moderate,
        desc: "Balanced coverage",
        features: ["Rain protection", "Pollution cover", "Demand drop cover", "UPI payout"]
      },
      {
        name: "Premium",
        price: premium,
        desc: "Full AI protection",
        features: ["Rain + heat cover", "Accident protection", "Demand drop cover", "Priority payout", "Peak bonus"]
      }
    ];
  }, [mlPrice]);

  useEffect(() => {
    if (recommendedPlan) {
      const autoPlan = plans.find(p => p.name === recommendedPlan);
      setSelectedPlan(autoPlan);
    }
  }, [recommendedPlan, plans]);

  // CONFIRM PLAN
  async function handleConfirm() {

    if (!selectedPlan) {
      showToast("Please select a plan ⚠️", "error");
      return;
    }

    try {
      const token = localStorage.getItem("token");

      const res = await axios.post(
        `${API_BASE}/insurance/upgrade`,
        null,
        {
          params: { plan: selectedPlan.name },
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setPlan(res.data.plan);

      setIsLocked(true);

      const lock = new Date();
      lock.setDate(lock.getDate() + 7);
      setLockDate(lock);

      setLockMessage("Plan locked for 7 days 🔒");

      showToast("✅ Plan Activated!", "success");

    } catch (err) {
      console.error(err);

      if (err.response?.status === 400) {
        showToast(err.response.data.detail, "error");
      } else {
        showToast("Upgrade failed ❌", "error");
      }
    }
  }

  const reasonLines = reason ? reason.split("|") : [];
  const usingGps = locationSource === "gps";

  return (
    <section className="scene active">
      <div className="policy-container">

        {/* TOAST */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ y: -80, opacity: 0 }}
              animate={{ y: 20, opacity: 1 }}
              exit={{ y: -80, opacity: 0 }}
              style={{
                position: "fixed",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                background: toast.type === "success" ? "#22c55e" : "#ef4444",
                color: "white",
                padding: "12px 20px",
                borderRadius: "10px",
                zIndex: 9999,
                fontWeight: "bold"
              }}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>

        <h1 className="page-title" style={{ textAlign: "center" }}>
          Choose Protection Plan
        </h1>

        {/* LOCK MESSAGE */}
        {isLocked && (
          <div style={{
            textAlign: "center",
            marginBottom: "20px",
            padding: "12px",
            background: "white",
            borderRadius: "10px",
            fontWeight: "bold"
          }}>
            🔒 {lockMessage}
            <br />
            ⏳ Unlocks in: {countdown}
          </div>
        )}

        {/* INFO */}
        <div style={{ textAlign: "center", marginBottom: "15px" }}>
          <p style={{ color: "green" }}>🤖 AI Pricing Active</p>

          <p>
            📍 {usingGps ? "Live location" : city}
            {usingGps && city ? ` (profile city: ${city})` : ""}
          </p>

          <p>
            🌡 {Number(temp).toFixed(1)}°C | 🌧 {Number(rainMm).toFixed(1)} mm/h | 🌫 AQI {aqi}
          </p>

          <p style={{ color: RISK_COLOR[risk] || "gray", fontWeight: "bold" }}>
            ⚠️ Risk Level: {risk}
          </p>

          <p style={{ color: RISK_COLOR[futureRisk] || "gray", fontWeight: "bold" }}>
            🔮 Next 6h Risk (estimate): {futureRisk}
          </p>

          {dataFallback && (
            <p style={{ color: "#f59e0b" }}>
              ⚠ Live weather unavailable, showing estimated values.
            </p>
          )}
        </div>

        {/* INSIGHT */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <p style={{ color: "gray", fontWeight: "bold" }}>🤖 AI Insight</p>
          {reasonLines.map((r, i) => (
            <p key={i} style={{ color: "gray" }}>• {r.trim()}</p>
          ))}
          {risk && liveLevel(temp, rainMm, aqi) === "LOW" && risk !== "LOW" && (
            <p style={{ color: "gray" }}>
              • Current conditions are normal. The {risk} level comes from this
              area's historical risk pattern.
            </p>
          )}
        </div>

        {/* PLANS */}
        <div className="pricing-grid">
          {plans.map(p => {
            const active = selectedPlan?.name === p.name;
            const isRecommended = recommendedPlan === p.name;

            return (
              <motion.div
                key={p.name}
                className={`price-card ${active ? "active glow" : ""} ${isRecommended ? "highlight" : ""} ${isLocked ? "glow-locked" : ""}`}
                whileHover={{ scale: isLocked ? 1 : 1.05 }}
                onClick={() => {
                  if (!isLocked) {
                    setSelectedPlan(p);
                  }
                }}
              >
                {isRecommended && <div className="badge">Recommended</div>}

                <h2>{p.name}</h2>
                <h1>₹{p.price}<span>/week</span></h1>

                <p className="muted">{p.desc}</p>

                <ul>
                  {p.features.map(f => <li key={f}>✔ {f}</li>)}
                </ul>

                <button className="btn" disabled={active || isLocked}>
                  {isLocked ? "Locked 🔒" : active ? "Selected" : "Select Plan"}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* CONFIRM */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={isLocked}
          >
            {isLocked ? "Plan Locked 🔒" : "Confirm Plan 🚀"}
          </button>
        </div>

      </div>
    </section>
  );
}

export default Policy;
