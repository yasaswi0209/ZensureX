import { useContext, useState, useEffect, useMemo } from "react";
import { AppContext } from "../utils/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";

function Policy(){

  const navigate = useNavigate();
  const { plan, setPlan } = useContext(AppContext);
  
  const [city, setCity] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);

  const [risk, setRisk] = useState("");
  const [temp, setTemp] = useState(0);
  const [aqi, setAqi] = useState(0);
  const [mlPrice, setMlPrice] = useState(0);
  const [reason, setReason] = useState("");
  const [rain, setRain] = useState(0);
  const [futureRisk, setFutureRisk] = useState("");

  // 🔥 NEW STATES (LOCK SYSTEM)
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const [countdown, setCountdown] = useState("");
  const [lockDate, setLockDate] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, type="success"){
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }
  
  // 🔥 AUTO CLAIM
  async function autoTriggerClaim(reasonText){
    try{
      const token = localStorage.getItem("token");

      const res = await axios.post(
        "https://zensurex-backend.onrender.com/claims/auto",
        { reason: reasonText },
        {
          headers:{
            Authorization: `Bearer ${token}`
          }
        }
      );

      showToast(`💰 Auto Claim Approved ₹${res.data.amount}`, "success");

    }catch(err){
      console.error("Auto claim failed", err);
    }
  }

  // 🔥 FETCH DATA
  useEffect(() => {
    async function fetchData(){
      try{
        const token = localStorage.getItem("token");

        if(!token){
          showToast("Please login again ⚠️", "error");
          navigate("/login");
          return;
        }

        const res = await axios.get(
          "https://zensurex-backend.onrender.com/risk/",
          {
            headers:{
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = res.data;

        setCity(data.city || "Hyderabad");
        setRisk(data.risk || "LOW");
        setTemp(data.weather?.temp || 0);
        setAqi(data.aqi || 0);
        setRain(data.weather?.rain || 0);
        setMlPrice(data.ml_price || 20);
        setReason(data.reason || "Normal conditions");

        let nextRisk = "LOW";

        if(data.weather?.temp > 45 || data.weather?.rain === 1 || data.aqi > 300){
          nextRisk = "HIGH";
        } else if(data.weather?.temp > 40 || data.aqi > 150){
          nextRisk = "MEDIUM";
        }

        setFutureRisk(nextRisk);

        if (
          data.weather?.rain === 1 ||
          data.weather?.temp > 45 ||
          data.aqi > 250 ||
          nextRisk === "HIGH"
        ) {
          autoTriggerClaim(data.reason);
        }

      }catch(err){
        console.error(err);

        if(err.response?.status === 401){
          showToast("Session expired ⚠️", "error");
          localStorage.removeItem("token");
          navigate("/login");
        } else {
          showToast("Failed to load data ❌", "error");
        }
      }
    }

    fetchData();
  }, [navigate]);
 useEffect(() => {

  async function fetchPolicy(){
    try{
      const token = localStorage.getItem("token");

      const res = await axios.get(
        "https://zensurex-backend.onrender.com/insurance/me",
        {
          headers:{
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = res.data;

      console.log("LOCK DATA:", data);

      if(data?.locked_until){
  const lock = new Date(data.locked_until);
  const now = new Date();

  if(lock > now){
    setIsLocked(true);
    setLockDate(lock);

    const diff = Math.ceil((lock - now) / (1000 * 60 * 60 * 24));
    setLockMessage(`Plan locked 🔒 (${diff} days remaining)`);
  }
}

    }catch(err){
      console.log("No existing policy");
    }
  }

  fetchPolicy();

}, []);

useEffect(() => {

  if(!isLocked || !lockDate) return;

  const interval = setInterval(() => {

    const now = new Date();
    const diff = lockDate - now;

    if(diff <= 0){
      setCountdown("Unlocked ✅");
      clearInterval(interval);
      return;
    }

    const d = Math.floor(diff / (1000*60*60*24));
    const h = Math.floor((diff / (1000*60*60)) % 24);
    const m = Math.floor((diff / (1000*60)) % 60);
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

  function getRecommendedPlan(){
    if(risk === "HIGH") return "Premium";
    if(risk === "MEDIUM") return "Moderate";
    return "Basic";
  }

  const recommendedPlan = getRecommendedPlan();

  const plans = useMemo(() => {
    const base = mlPrice > 0 ? mlPrice : 20;

    return [
      {
        name:"Basic",
        price: base,
        desc:"Low risk coverage",
        features:["Rain protection","Low demand cover","UPI payout"]
      },
      {
        name:"Moderate",
        price: Math.min(52, Math.round(base * 1.4)),
        desc:"Balanced coverage",
        features:["Rain protection","Pollution cover","Demand drop cover","UPI payout"]
      },
      {
        name:"Premium",
        price: Math.min(52, Math.round(base * 1.8)),
        desc:"Full AI protection",
        features:["Rain + heat cover","Accident protection","Demand drop cover","Priority payout","Peak bonus"]
      }
    ];
  }, [mlPrice]);

  useEffect(()=>{
    if(recommendedPlan){
      const autoPlan = plans.find(p => p.name === recommendedPlan);
      setSelectedPlan(autoPlan);
    }
  }, [recommendedPlan, plans]);

  // 🔥 CONFIRM PLAN
  async function handleConfirm(){

  if(!selectedPlan){
    showToast("Please select a plan ⚠️", "error");
    return;
  }

  try{
    const token = localStorage.getItem("token");

    const res = await axios.post(
      "https://zensurex-backend.onrender.com/insurance/upgrade",
      null,
      {
        params: {
          plan: selectedPlan.name
        },
        headers:{
          Authorization: `Bearer ${token}`
        }
      }
    );

    // ✅ SUCCESS
    setPlan(res.data.plan);

    // 🔒 LOCK UI IMMEDIATELY
    setIsLocked(true);

    // ⏳ SET LOCK DATE (7 DAYS FROM NOW)
    const lock = new Date();
    lock.setDate(lock.getDate() + 7);
    setLockDate(lock);

    setLockMessage("Plan locked for 7 days 🔒");

    showToast("✅ Plan Activated!", "success");

  }catch(err){
    console.error(err);

    if(err.response?.status === 400){
      showToast(err.response.data.detail, "error");
    } else {
      showToast("Upgrade failed ❌", "error");
    }
  }
}

  return(
    <section className="scene active">
      <div className="policy-container">

        {/* 🔔 TOAST */}
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

        {/* 🔒 LOCK MESSAGE */}
        {isLocked && (
          <div style={{
  textAlign: "center",
  marginBottom: "20px",
  padding: "12px",
  background: "white",   // ✅ FIX HERE
  

  borderRadius: "10px",
  fontWeight: "bold"
}}>
            🔒 {lockMessage}
<br />
⏳ Unlocks in: {countdown}
          </div>
        )}

        {/* 📊 INFO */}
        <div style={{textAlign:"center", marginBottom:"15px"}}>
          <p style={{color:"green"}}>🤖 AI Pricing Active</p>
          <p>📍 {city} | 🌡 {temp?.toFixed(2)}°C | 🌫 AQI {aqi}</p>
          <p style={{color:"green", fontWeight:"bold"}}>
            ⚠️ Risk Level: {risk}
          </p>
          <p style={{color:"green", fontWeight:"bold"}}>
            🔮 Next 6h Risk: {futureRisk}
          </p>
        </div>

        {/* 🤖 INSIGHT */}
        <div style={{textAlign:"center", marginBottom:"20px"}}>
          <p style={{color:"gray", fontWeight:"bold"}}>🤖 AI Insight</p>
          {reason.split("|").map((r, i) => (
            <p key={i} style={{color:"gray"}}>• {r.trim()}</p>
          ))}
        </div>

        {/* 💳 PLANS */}
        <div className="pricing-grid">
          {plans.map(p => {
            const active = selectedPlan?.name === p.name;
            const isRecommended = recommendedPlan === p.name;

            return(
              <motion.div
                key={p.name}
                className={`price-card ${active ? "active glow" : ""} ${isRecommended ? "highlight" : ""} ${isLocked ? "glow-locked" : ""}`}
                whileHover={{scale: isLocked ? 1 : 1.05}}
                onClick={() => {
                  if(!isLocked){
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
            )
          })}
        </div>

        {/* 🚀 CONFIRM */}
        <div style={{textAlign:"center", marginTop:"20px"}}>
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