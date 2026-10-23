import { useContext, useState, useEffect, useMemo, useRef } from "react";
import { AppContext } from "../utils/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = "https://zensurex-backend.onrender.com";

const RISK_COLOR = { LOW: "green", MEDIUM: "#f59e0b", HIGH: "#ef4444" };

function Policy() {

  const navigate = useNavigate();
  const { plan, setPlan } = useContext(AppContext);

  const [city, setCity] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);

  const [risk, setRisk] = useState("");
  const [temp, setTemp] = useState(0);
  const [aqi, setAqi] = useState(0);
  const [price, setPrice] = useState(0);
  const [reason, setReason] = useState("");
  const [rainMm, setRainMm] = useState(0);
  const [forecast, setForecast] = useState(null);
  const [outlookRisk, setOutlookRisk] = useState("");
  const [recommendedPlan, setRecommendedPlan] = useState("");
  const [locationSource, setLocationSource] = useState("saved_city");
  const [dataFallback, setDataFallback] = useState(false);

  // LOCK SYSTEM
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const [countdown, setCountdown] = useState("");
  const [lockDate, setLockDate] = useState(null);
  const [toast, setToast] = useState(null);

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
      setPrice(data.price || data.ml_price || 20);
      setReason(data.reason || "Normal conditions");
      setForecast(data.forecast || null);
      setOutlookRisk(data.outlook_risk || data.risk || "LOW");
      setRecommendedPlan(data.recommended_plan || "Basic");
      setLocationSource(data.location_source || "saved_city");
      setDataFallback(Boolean(data.data_fallback));

      // Auto claim only on real HIGH conditions NOW (not forecast) and real data
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
      () => load({}),
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

        if (data?.plan && typeof setPlan === "function") {
          setPlan(data.plan);
        }

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
        setIsLocked(false);
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
    if (outlookRisk === "HIGH" && !isLocked) {
      showToast("⚠️ High risk ahead! Consider the Premium plan", "error");
    }
  }, [outlookRisk, isLocked]);

  // Prices always go up: Basic < Moderate < Premium
  const plans = useMemo(() => {
    const base = price > 0 ? price : 20;
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
  }, [price]);

  // Locked: show the user's plan. Not locked: pre-select the recommended plan.
  useEffect(() => {
    if (isLocked && plan) {
      const mine = plans.find(p => p.name === plan);
      if (mine) setSelectedPlan(mine);
      return;
    }
    if (recommendedPlan) {
      const auto = plans.find(p => p.name === recommendedPlan);
      if (auto) setSelectedPlan(auto);
    }
  }, [recommendedPlan, plans, isLocked, plan]);

  // CONFIRM PLAN
  async function handleConfirm() {

    if (isLocked) return;

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
          params: { plan: selectedPlan.name, quoted_price: price },
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

      if (err.response?.status === 400 || err.response?.status === 409) {
        showToast(err.response.data.detail, "error");
      } else {
        showToast("Upgrade failed ❌", "error");
      }
    }
  }

  const reasonLines = reason ? reason.split("|") : [];
  const usingGps = locationSource === "gps";

  const rows = [
    { label: "Now", temp, rain: rainMm, pop: null, level: risk },
    ...(forecast
      ? [
          { label: "Next 3h", temp: forecast.h3.temp, rain: forecast.h3.rain_mm, pop: forecast.h3.pop, level: forecast.h3.risk },
          { label: "Next 6h", temp: forecast.h6.temp, rain: forecast.h6.rain_mm, pop: forecast.h6.pop, level: forecast.h6.risk }
        ]
      : [])
  ];

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
            🔒 {plan ? `${plan} plan active. ` : ""}{lockMessage}
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

          <p>🌫 AQI {aqi}</p>

          {/* NOW + FORECAST */}
          <div style={{ display: "inline-block", textAlign: "left" }}>
            {rows.map(r => (
              <p key={r.label} style={{ margin: "4px 0" }}>
                <b>{r.label}:</b> 🌡 {Number(r.temp).toFixed(1)}°C • 🌧 {Number(r.rain).toFixed(1)} mm/h
                {r.pop !== null ? ` (${r.pop}% chance)` : ""} •{" "}
                <span style={{ color: RISK_COLOR[r.level] || "gray", fontWeight: "bold" }}>
                  {r.level}
                </span>
              </p>
            ))}
          </div>

          {!forecast && risk && (
            <p style={{ color: "#f59e0b" }}>
              ⚠ Forecast unavailable, plan is based on current conditions only.
            </p>
          )}

          {outlookRisk && (
            <p style={{ color: RISK_COLOR[outlookRisk] || "gray", fontWeight: "bold", marginTop: "8px" }}>
              🔮 Outlook (worst of next 6h): {outlookRisk}
            </p>
          )}

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
        </div>

        {/* PLANS */}
        <div className="pricing-grid">
          {plans.map(p => {
            const active = selectedPlan?.name === p.name;
            const isRecommended = !isLocked && recommendedPlan === p.name;
            const isMine = isLocked && plan === p.name;

            return (
              <motion.div
                key={p.name}
                className={`price-card ${active ? "active glow" : ""} ${isRecommended ? "highlight" : ""} ${isLocked ? "glow-locked" : ""}`}
                style={isLocked && !isMine ? { opacity: 0.5 } : undefined}
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
                  {isLocked
                    ? (isMine ? "Your plan 🔒" : "Unavailable")
                    : active ? "Selected" : "Select Plan"}
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
