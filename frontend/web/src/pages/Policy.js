import { useContext, useState, useEffect, useMemo, useRef } from "react";
import { AppContext } from "../utils/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = "https://zensurex-backend.onrender.com";

// Plan order, used to allow upgrades only
const PLAN_RANK = { Basic: 1, Moderate: 2, Premium: 3 };

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 120, damping: 16 },
  },
};

const LEVEL_STYLES = {
  LOW: { label: "Low", color: "#166534", bg: "#dcfce7" },
  MEDIUM: { label: "Moderate", color: "#92400e", bg: "#fef3c7" },
  HIGH: { label: "High", color: "#b91c1c", bg: "#fee2e2" },
};

function capitalize(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existingScript = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true), { once: true });
      existingScript.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function Policy() {
  const navigate = useNavigate();
  const { plan, setPlan } = useContext(AppContext);

  const [city, setCity] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);

  const [risk, setRisk] = useState("");
  const [temp, setTemp] = useState(0);
  const [aqi, setAqi] = useState(0);
  const [price, setPrice] = useState(0);
  const [rainMm, setRainMm] = useState(0);
  const [outlookRisk, setOutlookRisk] = useState("");
  const [recommendedPlan, setRecommendedPlan] = useState("");
  const [dataFallback, setDataFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  const [breakdown, setBreakdown] = useState([]);
  const [band, setBand] = useState([20, 52]);
  const [upliftPct, setUpliftPct] = useState(0);

  // Policy lock
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const [countdown, setCountdown] = useState("");
  const [lockDate, setLockDate] = useState(null);

  const [toast, setToast] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const paymentInProgress = useRef(false);
  const claimFired = useRef(false);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function autoTriggerClaim(reasonText) {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${API_BASE}/claims/auto`,
        { reason: reasonText || "Severe weather conditions" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast(`💰 Auto Claim Approved ₹${res.data.amount}`, "success");
    } catch (err) {
      console.error("Auto claim failed", err);
    }
  }

  // Fetch risk: show saved city instantly, refine with GPS in the background
  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      showToast("Please login again ⚠️", "error");
      navigate("/login");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    function applyData(data, fromCache = false) {
      const t = data.weather?.temp ?? 0;
      const rm = data.weather?.rain_mm ?? 0;
      const a = data.aqi ?? 0;

      setLoading(false);
      if (!fromCache) {
        try {
          sessionStorage.setItem("riskData", JSON.stringify(data));
        } catch {}
      }

      setCity(data.pricing_city || data.city || "Hyderabad");
      setRisk(data.risk || "LOW");
      setTemp(t);
      setAqi(a);
      setRainMm(rm);
      setPrice(data.price || data.ml_price || 20);
      setOutlookRisk(data.outlook_risk || data.risk || "LOW");
      setRecommendedPlan(data.recommended_plan || "Basic");
      setDataFallback(Boolean(data.data_fallback));
      setBreakdown(data.breakdown || []);
      setBand(data.band || [20, 52]);
      setUpliftPct(data.price_uplift_pct || 0);

      const severe = rm > 7.5 || t > 45 || a > 250;

      if (severe && !data.data_fallback && !fromCache && !claimFired.current) {
        claimFired.current = true;
        autoTriggerClaim(data.reason);
      }
    }

    let gpsApplied = false;

    async function load(params, isGps = false) {
      try {
        const res = await axios.get(`${API_BASE}/risk/`, { headers, params });

        if (!isGps && gpsApplied) return;
        if (isGps) gpsApplied = true;

        applyData(res.data);
      } catch (err) {
        if (err.response?.status === 401) {
          showToast("Session expired ⚠️", "error");
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        if (isGps) return;

        setLoading(false);
        console.error(err);
        showToast("Failed to load risk data ❌", "error");
      }
    }

    try {
      const cached = sessionStorage.getItem("riskData");
      if (cached) applyData(JSON.parse(cached), true);
    } catch {}

    load({});

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          load({ lat: pos.coords.latitude, lon: pos.coords.longitude }, true),
        () => {},
        { timeout: 5000, maximumAge: 10 * 60 * 1000 }
      );
    }
  }, [navigate]);

  // Fetch current policy and lock
  useEffect(() => {
    async function fetchPolicy() {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const res = await axios.get(`${API_BASE}/insurance/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = res.data;

        if (data?.plan) setPlan(data.plan);

        if (data?.locked_until) {
          const lock = new Date(data.locked_until);

          if (lock > new Date()) {
            setIsLocked(true);
            setLockDate(lock);

            const days = Math.ceil(
              (lock.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            setLockMessage(`Plan locked 🔒 (${days} days remaining)`);
          } else {
            setIsLocked(false);
          }
        }
      } catch (err) {
        console.log("Could not fetch existing policy", err);
      }
    }

    fetchPolicy();
  }, [setPlan]);

  // Lock countdown
  useEffect(() => {
    if (!isLocked || !lockDate) return;

    const interval = setInterval(() => {
      const diff = lockDate.getTime() - Date.now();

      if (diff <= 0) {
        setCountdown("Unlocked ✅");
        setIsLocked(false);
        setLockMessage("");
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

  const plans = useMemo(() => {
    const base = price > 0 ? price : 20;
    const moderate = Math.round(base * 1.25);
    const premium = Math.max(Math.round(base * 1.5), moderate + 5);

    return [
      {
        name: "Basic",
        price: base,
        desc: "Low risk coverage",
        covers: ["rain"],
        features: ["Rain protection", "Low demand cover", "UPI payout"],
      },
      {
        name: "Moderate",
        price: moderate,
        desc: "Balanced coverage",
        covers: ["rain", "pollution"],
        features: [
          "Rain protection",
          "Pollution cover",
          "Demand drop cover",
          "UPI payout",
        ],
      },
      {
        name: "Premium",
        price: premium,
        desc: "Full AI protection",
        covers: ["rain", "heat", "pollution"],
        features: [
          "Rain + heat cover",
          "Accident protection",
          "Demand drop cover",
          "Priority payout",
          "Peak bonus",
        ],
      },
    ];
  }, [price]);

  // ---- Upgrade helpers ----
  // While locked, only plans ranked higher than the current plan are selectable.
  const canUpgradeTo = (p) =>
    isLocked && plan && PLAN_RANK[p.name] > PLAN_RANK[plan];

  const isUpgrade = Boolean(
    isLocked && selectedPlan && canUpgradeTo(selectedPlan)
  );

  const currentPlanPrice = plans.find((p) => p.name === plan)?.price ?? 0;
  const upgradeCost = isUpgrade
    ? Math.max(selectedPlan.price - currentPlanPrice, 1)
    : 0;

  // Keep the current plan selected when locked, unless an upgrade was chosen.
  useEffect(() => {
    if (isLocked && plan) {
      setSelectedPlan((prev) => {
        if (prev && PLAN_RANK[prev.name] > PLAN_RANK[plan]) {
          return plans.find((p) => p.name === prev.name) || prev;
        }
        return plans.find((p) => p.name === plan) || null;
      });
      return;
    }

    if (recommendedPlan) {
      const recommended = plans.find((p) => p.name === recommendedPlan);
      if (recommended) setSelectedPlan(recommended);
    }
  }, [recommendedPlan, plans, isLocked, plan]);

  async function handleConfirm() {
    if ((isLocked && !isUpgrade) || paymentInProgress.current) return;

    if (!selectedPlan) {
      showToast("Please select a plan ⚠️", "error");
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
      showToast("Please login again ⚠️", "error");
      navigate("/login");
      return;
    }

    const upgradeFlow = isUpgrade;

    paymentInProgress.current = true;
    setPaymentLoading(true);

    try {
      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded || !window.Razorpay) {
        throw new Error("Could not load Razorpay Checkout. Please try again.");
      }

      // The backend calculates the final price (or upgrade difference).
      const orderResponse = await axios.post(
        `${API_BASE}/insurance/create-order`,
        {
          plan: selectedPlan.name,
          quoted_price: price,
          upgrade: upgradeFlow,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const order = orderResponse.data;

      if (!order.order_id || !order.key_id || !order.amount) {
        throw new Error("The server returned an invalid payment order.");
      }

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "ZensureX",
        description: upgradeFlow
          ? `Upgrade to ${order.plan}`
          : `${order.plan} Insurance Policy`,
        order_id: order.order_id,
        notes: { plan: order.plan },
        theme: { color: "#4f46e5" },

        modal: {
          ondismiss: () => {
            paymentInProgress.current = false;
            setPaymentLoading(false);
            showToast(
              upgradeFlow
                ? "Checkout closed. Your plan has not been upgraded."
                : "Checkout closed. Your policy has not been activated.",
              "error"
            );
          },
        },

        handler: async (response) => {
          try {
            // Never activate or upgrade a policy from the browser callback alone.
            const verifyResponse = await axios.post(
              `${API_BASE}/insurance/verify-payment`,
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );

            const verified = verifyResponse.data;

            setPlan(verified.plan);

            if (verified.locked_until) {
              const lock = new Date(verified.locked_until);
              setLockDate(lock);
              setIsLocked(lock > new Date());
              setLockMessage("Plan locked 🔒");
            }

            setCountdown("");
            showToast(
              upgradeFlow
                ? "✅ Plan upgraded!"
                : "✅ Test payment verified. Policy activated!",
              "success"
            );
          } catch (err) {
            console.error("Payment verification failed", err);
            showToast(
              err.response?.data?.detail ||
                "Payment verification failed. Check your policy status before retrying.",
              "error"
            );
          } finally {
            paymentInProgress.current = false;
            setPaymentLoading(false);
          }
        },
      };

      const checkout = new window.Razorpay(options);

      checkout.on("payment.failed", (response) => {
        console.error("Razorpay payment failed", response.error);
        paymentInProgress.current = false;
        setPaymentLoading(false);
        showToast(
          response.error?.description || "Payment failed. Please try again.",
          "error"
        );
      });

      checkout.open();
    } catch (err) {
      console.error("Checkout initialization failed", err);

      paymentInProgress.current = false;
      setPaymentLoading(false);

      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        navigate("/login");
        return;
      }

      showToast(
        err.response?.data?.detail ||
          err.message ||
          "Could not start checkout. Please try again.",
        "error"
      );
    }
  }

  const coverageItems = [
    { key: "rain", icon: "🌧️", label: "Rain" },
    { key: "heat", icon: "🔥", label: "Heat" },
    { key: "pollution", icon: "🌫️", label: "Pollution" },
  ];

  const cityName = capitalize(city) || "your city";
  const basePrice = plans[0]?.price ?? 0;
  const riskStyle = LEVEL_STYLES[risk] || LEVEL_STYLES.LOW;
  const markerLeft = Math.min(100, Math.max(0, ((basePrice - 20) / 32) * 100));

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
                position: "fixed",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                background: toast.type === "success" ? "#22c55e" : "#ef4444",
                color: "white",
                padding: "12px 20px",
                borderRadius: "10px",
                zIndex: 9999,
                fontWeight: "bold",
                maxWidth: "90vw",
              }}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>

        <h1 className="page-title" style={{ textAlign: "center" }}>
          Choose Protection Plan
        </h1>

        {!loading && (
          <p
            style={{
              textAlign: "center",
              color: "#64748b",
              fontSize: 13,
              margin: "-6px 0 18px",
            }}
          >
            Weekly prices for <b>{cityName}</b>
          </p>
        )}

        {isLocked && (
          <div
            style={{
              textAlign: "center",
              marginBottom: "20px",
              padding: "12px",
              background: "white",
              borderRadius: "10px",
              fontWeight: "bold",
            }}
          >
            🔒 {plan ? `${plan} plan active. ` : ""}
            {lockMessage}
            <br />
            ⏳ Unlocks in: {countdown || "Calculating..."}
            {plan !== "Premium" && (
              <div style={{ fontSize: 12, fontWeight: 500, color: "#4f46e5", marginTop: 6 }}>
                You can still upgrade to a higher plan and pay only the difference.
              </div>
            )}
          </div>
        )}

        {/* PLAN CARDS */}
        <motion.div
          className="pricing-grid"
          variants={gridVariants}
          initial="hidden"
          animate="show"
        >
          {plans.map((p) => {
            const active = selectedPlan?.name === p.name;
            const isRecommended = !isLocked && recommendedPlan === p.name;
            const isMine = isLocked && plan === p.name;
            const upgradable = canUpgradeTo(p);
            const disabledCard = isLocked && !upgradable;

            return (
              <motion.div
                key={p.name}
                variants={cardVariants}
                style={{ height: "100%" }}
              >
                <motion.div
                  className={`price-card ${active ? "active glow" : ""} ${
                    isRecommended ? "highlight" : ""
                  } ${isLocked ? "glow-locked" : ""}`}
                  style={{
                    position: "relative",
                    height: "100%",
                    ...(disabledCard && !isMine ? { opacity: 0.5 } : {}),
                  }}
                  animate={
                    isRecommended
                      ? {
                          y: [0, -8, 0],
                          boxShadow: [
                            "0 0 0 2px rgba(79,70,229,.9), 0 10px 30px rgba(79,70,229,.20)",
                            "0 0 0 3px rgba(129,140,248,1), 0 18px 55px rgba(79,70,229,.50)",
                            "0 0 0 2px rgba(79,70,229,.9), 0 10px 30px rgba(79,70,229,.20)",
                          ],
                        }
                      : { y: 0 }
                  }
                  transition={
                    isRecommended
                      ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0.3 }
                  }
                  whileHover={
                    disabledCard ? {} : { scale: isRecommended ? 1.04 : 1.03 }
                  }
                  whileTap={disabledCard ? {} : { scale: 0.98 }}
                  onClick={() => {
                    if (!disabledCard && !paymentLoading) setSelectedPlan(p);
                  }}
                >
                  {isRecommended && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        overflow: "hidden",
                        borderRadius: "inherit",
                        pointerEvents: "none",
                      }}
                    >
                      <motion.div
                        initial={{ x: "-130%" }}
                        animate={{ x: "380%" }}
                        transition={{
                          duration: 1.6,
                          repeat: Infinity,
                          repeatDelay: 2.2,
                          ease: "easeInOut",
                        }}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "35%",
                          height: "100%",
                          background:
                            "linear-gradient(105deg, transparent, rgba(255,255,255,.65), transparent)",
                        }}
                      />
                    </div>
                  )}

                  {isRecommended && (
                    <motion.div
                      className="badge"
                      animate={{ y: [0, -4, 0], scale: [1, 1.06, 1] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.8,
                        ease: "easeInOut",
                      }}
                    >
                      ⭐ Recommended for you
                    </motion.div>
                  )}

                  <h2>{p.name}</h2>

                  <h1>
                    ₹{p.price}
                    <span>/week</span>
                  </h1>

                  <p className="muted">{p.desc}</p>

                  <ul>
                    {p.features.map((feature) => (
                      <li key={feature}>✔ {feature}</li>
                    ))}
                  </ul>

                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      justifyContent: "center",
                      flexWrap: "wrap",
                      margin: "10px 0",
                    }}
                  >
                    {coverageItems.map((t) => {
                      const covered = p.covers.includes(t.key);
                      return (
                        <span
                          key={t.key}
                          title={t.label}
                          style={{
                            opacity: covered ? 1 : 0.25,
                            filter: covered ? "none" : "grayscale(1)",
                            fontSize: 12,
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: "#f1f5f9",
                          }}
                        >
                          {t.icon} {covered ? t.label : "—"}
                        </span>
                      );
                    })}
                  </div>

                  <button
                    className="btn"
                    disabled={active || disabledCard || paymentLoading}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!disabledCard && !paymentLoading) setSelectedPlan(p);
                    }}
                  >
                    {isMine
                      ? "Your plan 🔒"
                      : disabledCard
                      ? "Unavailable"
                      : active
                      ? upgradable
                        ? "Upgrade selected"
                        : "Selected"
                      : upgradable
                      ? "Upgrade"
                      : "Select Plan"}
                  </button>
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* WHY THIS PRICE? */}
        <div
          style={{
            maxWidth: "900px",
            margin: "28px auto 0",
            padding: "22px",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "18px",
            boxShadow: "0 8px 28px rgba(15,23,42,.05)",
          }}
        >
          <h2 style={{ margin: "0 0 6px", fontSize: "19px" }}>
            💡 Why is your price ₹{loading ? "…" : basePrice}/week?
          </h2>

          <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px" }}>
            Based on today's weather in your saved city (<b>{cityName}</b>) and
            the forecast for the next 6 hours.
          </p>

          {loading ? (
            <div
              style={{
                height: 60,
                borderRadius: 10,
                background: "#e5e7eb",
                animation: "skeletonPulse 1.2s ease-in-out infinite",
              }}
            />
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 12,
                    fontWeight: 800,
                    color: riskStyle.color,
                    background: riskStyle.bg,
                    borderRadius: 999,
                    padding: "4px 12px",
                    marginBottom: 10,
                  }}
                >
                  {riskStyle.label} risk today
                </span>

                <p style={{ margin: "0 0 4px", fontSize: 12, color: "#64748b" }}>
                  Now: rain {Number(rainMm).toFixed(1)} mm/h ·{" "}
                  {Number(temp).toFixed(1)}°C · AQI {Math.round(aqi)}
                </p>

                {breakdown.length === 0 ? (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#475569" }}>
                    ✅ Calm weather. Nothing is adding to your price.
                  </p>
                ) : (
                  <ul
                    style={{
                      margin: "6px 0 0",
                      paddingLeft: 18,
                      fontSize: 13,
                      color: "#475569",
                      lineHeight: 1.7,
                    }}
                  >
                    {breakdown.map((f) => (
                      <li key={f.key}>
                        {f.label} <b>(+{f.points})</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                  {riskStyle.label} risk prices range from ₹{band[0]} to ₹{band[1]}
                </div>
                <div
                  style={{
                    position: "relative",
                    height: 10,
                    borderRadius: 999,
                    background:
                      "linear-gradient(90deg,#22c55e 0%,#f59e0b 55%,#ef4444 100%)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -4,
                      left: `${markerLeft}%`,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      border: "3px solid #4f46e5",
                      transform: "translateX(-50%)",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "#94a3b8",
                    marginTop: 4,
                  }}
                >
                  <span>₹20</span>
                  <span>₹52</span>
                </div>
              </div>

              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  fontSize: 13,
                  marginBottom: 16,
                  background: upliftPct ? "#fef3c7" : "#f0fdf4",
                  color: upliftPct ? "#92400e" : "#166534",
                }}
              >
                {upliftPct
                  ? `⚠️ Weather may get worse in the next 6 hours, so +${upliftPct}% is included in your price.`
                  : "✅ No worse weather expected in the next 6 hours, so no extra charge."}
              </div>

              <p style={{ margin: "0 0 6px", fontSize: 13, color: "#334155" }}>
                <b>Plans:</b> Moderate costs about 1.25× Basic and Premium
                about 1.5×. Cover amounts are ₹5,000, ₹10,000 and ₹20,000.
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "#334155" }}>
                <b>Lock:</b> After you pay, your plan is locked for 7 days. You
                can upgrade to a higher plan anytime and pay only the
                difference.
              </p>
            </>
          )}

          <p style={{ margin: "14px 0 0", fontSize: 12, color: "#94a3b8" }}>
            {dataFallback ? "Weather data is estimated right now, not live. " : ""}
            The final amount is confirmed by the server at checkout.
          </p>
        </div>

        {/* RAZORPAY TEST CHECKOUT */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={
              (isLocked && !isUpgrade) ||
              !selectedPlan ||
              paymentLoading ||
              loading
            }
          >
            {isLocked && !isUpgrade
              ? "Plan Locked 🔒 (select a higher plan to upgrade)"
              : paymentLoading
              ? "Opening secure checkout..."
              : loading
              ? "Loading your quote..."
              : isUpgrade
              ? `Upgrade to ${selectedPlan.name} (pay ₹${upgradeCost})`
              : `Pay ₹${selectedPlan?.price ?? 0}/week with Razorpay`}
          </button>

          {(!isLocked || isUpgrade) && (
            <p style={{ color: "#64748b", fontSize: "12px", marginTop: "8px" }}>
              Razorpay Test Mode only. Test payments do not collect real money.
              The final amount is confirmed by the server.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default Policy;
