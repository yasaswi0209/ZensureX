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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("qr");

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

  const usingGps = locationSource === "gps";

  const payoutTriggers = [
    { key: "rain", icon: "🌧️", label: "Heavy rain", value: rainMm, limit: 7.5, unit: "mm/h", digits: 1 },
    { key: "heat", icon: "🔥", label: "Extreme heat", value: temp, limit: 45, unit: "°C", digits: 1 },
    { key: "pollution", icon: "🌫️", label: "High pollution", value: aqi, limit: 250, unit: "AQI", digits: 0 }
  ];

  function triggerColor(ratio) {
    if (ratio >= 1) return "#ef4444";
    if (ratio >= 0.5) return "#f59e0b";
    return "#22c55e";
  }

  return (
    <section className="scene active">
      <div className="policy-container">
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ y: -80, opacity: 0 }}
              animate={{ y: 20, opacity: 1 }}
              exit={{ y: -80, opacity: 0 }}
              style={{
                position: "fixed", top: 0, left: "50%",
                transform: "translateX(-50%)",
                background: toast.type === "success" ? "#22c55e" : "#ef4444",
                color: "white", padding: "12px 20px", borderRadius: "10px",
                zIndex: 9999, fontWeight: "bold"
              }}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>

        <h1 className="page-title" style={{ textAlign: "center" }}>
          Choose Protection Plan
        </h1>

        {isLocked && (
          <div style={{
            textAlign: "center", marginBottom: "20px", padding: "12px",
            background: "white", borderRadius: "10px", fontWeight: "bold"
          }}>
            🔒 {plan ? `${plan} plan active. ` : ""}{lockMessage}
            <br />
            ⏳ Unlocks in: {countdown}
          </div>
        )}

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

        {/* LIVE PAYOUT TRIGGERS */}
        <div style={{
          maxWidth: "900px", margin: "28px auto 0", padding: "22px",
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: "18px",
          boxShadow: "0 8px 28px rgba(15,23,42,.05)"
        }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "20px" }}>Live Payout Triggers</h2>
          <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 20px" }}>
            Current conditions for {city || "your saved city"}. A trigger is reached only when the current value exceeds its policy threshold.
          </p>
          {payoutTriggers.map(item => {
            const ratio = item.limit ? item.value / item.limit : 0;
            const hit = item.value > item.limit;
            return (
              <div key={item.key} style={{ marginBottom: "18px" }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  gap: "12px", flexWrap: "wrap", marginBottom: "8px", fontSize: "14px"
                }}>
                  <span>{item.icon} <b>{item.label}</b></span>
                  <span>
                    <b>{Number(item.value).toFixed(item.digits)}</b> / {item.limit} {item.unit}
                    <span style={{
                      marginLeft: "9px", fontSize: "11px", fontWeight: 800,
                      color: hit ? "#b91c1c" : "#166534",
                      background: hit ? "#fee2e2" : "#dcfce7",
                      borderRadius: "999px", padding: "3px 8px"
                    }}>{hit ? "TRIGGERED" : "NOT TRIGGERED"}</span>
                  </span>
                </div>
                <div style={{
                  width: "100%", height: "8px", background: "#e5e7eb",
                  borderRadius: "999px", overflow: "hidden"
                }}>
                  <div style={{
                    width: `${Math.min(100, ratio * 100)}%`, height: "100%",
                    borderRadius: "999px", background: triggerColor(ratio),
                    transition: "width .5s ease"
                  }} />
                </div>
              </div>
            );
          })}
          <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#64748b" }}>
            Overall risk: <b style={{ color: RISK_COLOR[risk] || "#64748b" }}>{risk || "UNKNOWN"}</b>
            {dataFallback ? " · Weather data is estimated, not live." : ""}
          </p>
        </div>

        {/* DEMO PAYMENT */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button className="btn-primary" onClick={() => setPaymentOpen(true)}
            disabled={isLocked || !selectedPlan}>
            {isLocked ? "Plan Locked 🔒" : `Pay ₹${selectedPlan?.price ?? 0} with Razorpay Demo`}
          </button>
          {!isLocked && <p style={{ color: "#64748b", fontSize: "12px", marginTop: "8px" }}>
            Demo checkout only — this QR is not a real payment request.
          </p>}
        </div>

        {paymentOpen && selectedPlan && (
          <div role="dialog" aria-modal="true" aria-label="Razorpay demo checkout"
            style={{
              position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,.65)",
              display: "grid", placeItems: "center", padding: "18px"
            }}>
            <div style={{
              position: "relative", width: "100%", maxWidth: "420px", background: "#fff",
              borderRadius: "20px", padding: "26px", textAlign: "center",
              boxShadow: "0 20px 70px rgba(0,0,0,.25)"
            }}>
              <button onClick={() => setPaymentOpen(false)} aria-label="Close payment dialog"
                style={{
                  position: "absolute", top: "12px", right: "14px", border: 0,
                  background: "transparent", fontSize: "24px", cursor: "pointer", color: "#64748b"
                }}>×</button>
              <h2 style={{ margin: "0 0 6px" }}>Razorpay Demo Checkout</h2>
              <p style={{ color: "#64748b", margin: "0 0 18px" }}>
                {selectedPlan.name} protection · billed weekly
              </p>
              <div style={{ fontSize: "34px", fontWeight: 800, marginBottom: "18px" }}>
                ₹{selectedPlan.price}<span style={{ fontSize: "13px", color: "#64748b" }}>/week</span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "18px" }}>
                <button onClick={() => setPaymentMethod("qr")} style={{
                  padding: "9px 14px", borderRadius: "9px", cursor: "pointer",
                  border: `1px solid ${paymentMethod === "qr" ? "#4f46e5" : "#d1d5db"}`,
                  background: paymentMethod === "qr" ? "#eef2ff" : "#fff"
                }}>Scan demo QR</button>
                <button onClick={() => setPaymentMethod("checkout")} style={{
                  padding: "9px 14px", borderRadius: "9px", cursor: "pointer",
                  border: `1px solid ${paymentMethod === "checkout" ? "#4f46e5" : "#d1d5db"}`,
                  background: paymentMethod === "checkout" ? "#eef2ff" : "#fff"
                }}>Test checkout</button>
              </div>
              {paymentMethod === "qr" ? (
                <>
                  <img alt="Demo-only QR code, not a payable Razorpay QR" width="190" height="190"
                    style={{ display: "block", margin: "0 auto 12px", imageRendering: "pixelated" }}
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(
                      `ZENSUREX DEMO ONLY | ${selectedPlan.name} | INR ${selectedPlan.price} per week | NOT A REAL PAYMENT`
                    )}`} />
                  <p style={{ color: "#b45309", fontSize: "12px", lineHeight: 1.5 }}>
                    This QR only identifies the demo plan. It cannot collect money and is not a Razorpay-issued UPI QR.
                  </p>
                </>
              ) : (
                <div style={{
                  padding: "16px", borderRadius: "12px", background: "#f8fafc",
                  color: "#475569", fontSize: "13px", lineHeight: 1.6, marginBottom: "14px"
                }}>
                  Real Razorpay test checkout requires a backend-created order and server-side payment verification.
                  Those endpoints are not configured by this frontend demo.
                </div>
              )}
              <button className="btn" style={{ width: "100%", marginTop: "8px" }}
                onClick={() => {
                  setPaymentOpen(false);
                  showToast("Demo checkout closed. No payment was taken.", "error");
                }}>Close demo checkout</button>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}

export default Policy;
