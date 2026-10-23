
import { useContext, useState, useEffect, useMemo, useRef } from "react";
import { AppContext } from "../utils/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = "https://zensurex-backend.onrender.com";

const RISK_COLOR = {
  LOW: "green",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
};

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
      existingScript.addEventListener("load", () => resolve(true), {
        once: true,
      });
      existingScript.addEventListener("error", () => resolve(false), {
        once: true,
      });
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
  const [reason, setReason] = useState("");
  const [rainMm, setRainMm] = useState(0);
  const [forecast, setForecast] = useState(null);
  const [outlookRisk, setOutlookRisk] = useState("");
  const [recommendedPlan, setRecommendedPlan] = useState("");
  const [locationSource, setLocationSource] = useState("saved_city");
  const [dataFallback, setDataFallback] = useState(false);

  // Policy lock
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const [countdown, setCountdown] = useState("");
  const [lockDate, setLockDate] = useState(null);

  // Toast and payment state
  const [toast, setToast] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const paymentInProgress = useRef(false);
  const claimFired = useRef(false);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  // Automatic claim trigger
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

  // Fetch risk: GPS first, saved city as fallback
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

      const severe =
        rm > 7.5 || t > 45 || a > 250 || data.risk === "HIGH";

      if (severe && !data.data_fallback && !claimFired.current) {
        claimFired.current = true;
        autoTriggerClaim(data.reason);
      }
    }

    async function load(params) {
      try {
        const res = await axios.get(`${API_BASE}/risk/`, {
          headers,
          params,
        });
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
        showToast("Failed to load risk data ❌", "error");
      }
    }

    if (!navigator.geolocation) {
      load({});
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        load({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      () => load({}),
      { timeout: 8000 }
    );
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

        if (data?.plan) {
          setPlan(data.plan);
        }

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

  // Plan display prices. The backend determines the final payable amount.
  const plans = useMemo(() => {
    const base = price > 0 ? price : 20;
    const moderate = Math.round(base * 1.25);
    const premium = Math.max(Math.round(base * 1.5), moderate + 5);

    return [
      {
        name: "Basic",
        price: base,
        desc: "Low risk coverage",
        features: ["Rain protection", "Low demand cover", "UPI payout"],
      },
      {
        name: "Moderate",
        price: moderate,
        desc: "Balanced coverage",
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

  // Keep the current plan selected when locked.
  useEffect(() => {
    if (isLocked && plan) {
      const mine = plans.find((p) => p.name === plan);
      if (mine) setSelectedPlan(mine);
      return;
    }

    if (recommendedPlan) {
      const recommended = plans.find((p) => p.name === recommendedPlan);
      if (recommended) setSelectedPlan(recommended);
    }
  }, [recommendedPlan, plans, isLocked, plan]);

  // Create an order and open real Razorpay Checkout.
  async function handleConfirm() {
    if (isLocked || paymentInProgress.current) return;

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

    paymentInProgress.current = true;
    setPaymentLoading(true);

    try {
      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded || !window.Razorpay) {
        throw new Error("Could not load Razorpay Checkout. Please try again.");
      }

      // The backend calculates the final price and creates the order.
      const orderResponse = await axios.post(
        `${API_BASE}/insurance/create-order`,
        {
          plan: selectedPlan.name,
          quoted_price: price,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
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
        description: `${order.plan} Insurance Policy`,
        order_id: order.order_id,

        notes: {
          plan: order.plan,
        },

        theme: {
          color: "#4f46e5",
        },

        modal: {
          ondismiss: () => {
            paymentInProgress.current = false;
            setPaymentLoading(false);
            showToast(
              "Checkout closed. Your policy has not been activated.",
              "error"
            );
          },
        },

        handler: async (response) => {
          try {
            // Never activate a policy from the browser callback alone.
            // The backend verifies the signature and payment status.
            const verifyResponse = await axios.post(
              `${API_BASE}/insurance/verify-payment`,
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );

            const verified = verifyResponse.data;

            setPlan(verified.plan);

            if (verified.locked_until) {
              const lock = new Date(verified.locked_until);
              setLockDate(lock);
              setIsLocked(lock > new Date());
              setLockMessage("Plan locked for 7 days 🔒");
            }

            setCountdown("");
            showToast("✅ Test payment verified. Policy activated!", "success");
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

  const payoutTriggers = [
    {
      key: "rain",
      icon: "🌧️",
      label: "Heavy rain",
      value: rainMm,
      limit: 7.5,
      unit: "mm/h",
      digits: 1,
    },
    {
      key: "heat",
      icon: "🔥",
      label: "Extreme heat",
      value: temp,
      limit: 45,
      unit: "°C",
      digits: 1,
    },
    {
      key: "pollution",
      icon: "🌫️",
      label: "High pollution",
      value: aqi,
      limit: 250,
      unit: "AQI",
      digits: 0,
    },
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
                position: "fixed",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                background:
                  toast.type === "success" ? "#22c55e" : "#ef4444",
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
          </div>
        )}

        {/* PLAN CARDS */}
        <div className="pricing-grid">
          {plans.map((p) => {
            const active = selectedPlan?.name === p.name;
            const isRecommended = !isLocked && recommendedPlan === p.name;
            const isMine = isLocked && plan === p.name;

            return (
              <motion.div
                key={p.name}
                className={`price-card ${active ? "active glow" : ""} ${
                  isRecommended ? "highlight" : ""
                } ${isLocked ? "glow-locked" : ""}`}
                style={isLocked && !isMine ? { opacity: 0.5 } : undefined}
                whileHover={{ scale: isLocked ? 1 : 1.05 }}
                onClick={() => {
                  if (!isLocked && !paymentLoading) setSelectedPlan(p);
                }}
              >
                {isRecommended && <div className="badge">Recommended</div>}

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

                <button
                  className="btn"
                  disabled={active || isLocked || paymentLoading}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!isLocked && !paymentLoading) setSelectedPlan(p);
                  }}
                >
                  {isLocked
                    ? isMine
                      ? "Your plan 🔒"
                      : "Unavailable"
                    : active
                    ? "Selected"
                    : "Select Plan"}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* LIVE PAYOUT TRIGGERS */}
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
          <h2 style={{ margin: "0 0 6px", fontSize: "20px" }}>
            Live Payout Triggers
          </h2>

          <p
            style={{
              color: "#64748b",
              fontSize: "13px",
              margin: "0 0 20px",
            }}
          >
            Current conditions for {city || "your saved city"}. A trigger is
            reached only when the current value exceeds its policy threshold.
          </p>

          {payoutTriggers.map((item) => {
            const ratio = item.limit ? item.value / item.limit : 0;
            const hit = item.value > item.limit;

            return (
              <div key={item.key} style={{ marginBottom: "18px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                    marginBottom: "8px",
                    fontSize: "14px",
                  }}
                >
                  <span>
                    {item.icon} <b>{item.label}</b>
                  </span>

                  <span>
                    <b>{Number(item.value).toFixed(item.digits)}</b> /{" "}
                    {item.limit} {item.unit}
                    <span
                      style={{
                        marginLeft: "9px",
                        fontSize: "11px",
                        fontWeight: 800,
                        color: hit ? "#b91c1c" : "#166534",
                        background: hit ? "#fee2e2" : "#dcfce7",
                        borderRadius: "999px",
                        padding: "3px 8px",
                      }}
                    >
                      {hit ? "TRIGGERED" : "NOT TRIGGERED"}
                    </span>
                  </span>
                </div>

                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "#e5e7eb",
                    borderRadius: "999px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, ratio * 100)}%`,
                      height: "100%",
                      borderRadius: "999px",
                      background: triggerColor(ratio),
                      transition: "width .5s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}

          <p
            style={{
              margin: "8px 0 0",
              fontSize: "13px",
              color: "#64748b",
            }}
          >
            Overall risk:{" "}
            <b style={{ color: RISK_COLOR[risk] || "#64748b" }}>
              {risk || "UNKNOWN"}
            </b>
            {dataFallback ? " · Weather data is estimated, not live." : ""}
          </p>
        </div>

        {/* REAL RAZORPAY TEST CHECKOUT */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={isLocked || !selectedPlan || paymentLoading}
          >
            {isLocked
              ? "Plan Locked 🔒"
              : paymentLoading
              ? "Opening secure checkout..."
              : `Pay ₹${selectedPlan?.price ?? 0}/week with Razorpay`}
          </button>

          {!isLocked && (
            <p
              style={{
                color: "#64748b",
                fontSize: "12px",
                marginTop: "8px",
              }}
            >
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
