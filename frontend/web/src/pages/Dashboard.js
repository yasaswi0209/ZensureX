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
  import { useContext, useEffect, useState } from "react";
  import { AppContext } from "../utils/AppContext";
  import axios from "axios";
  import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
  
  import "leaflet/dist/leaflet.css";


  const chartData = [
    { period: "Week 1", risk: 18 },
    { period: "Week 2", risk: 32 },
    { period: "Week 3", risk: 25 },
    { period: "Week 4", risk: 40 }
  ];


  function Dashboard() {

    const { plan, setPlan, premium, setPremium } = useContext(AppContext);

    const navigate = useNavigate();
const [message, setMessage] = useState("");
    const [data, setData] = useState(null);

    const [position, setPosition] = useState([17.385, 78.4867]);

    const city = localStorage.getItem("city");

    const userData = JSON.parse(localStorage.getItem("user"));
    const userName = userData?.name;



    function getRecommendationDetails(risk){

      if(risk === "LOW"){
        return {
          plan: "Basic",
          reason: "Low disruption probability detected.",
          confidence: 82
        };
      }

      if(risk === "MEDIUM"){
        return {
          plan: "Moderate",
          reason: "Moderate environmental risk detected.",
          confidence: 88
        };
      }

      if(risk === "HIGH"){
        return {
          plan: "Premium",
          reason: "High disruption probability detected.",
          confidence: 95
        };
      }

      return null;
    }
    function getRiskColor(risk) {
  if (risk === "LOW") return "green";
  if (risk === "MEDIUM") return "orange";
  if (risk === "HIGH") return "red";
  return "gray";
}


    const recommendation = getRecommendationDetails(data?.risk);

async function getCityCoordinates(city) {
  try {
    const res = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${city}`
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

   useEffect(() => {

  async function fetchData() {

    try {

      // ✅ ALWAYS DECLARE FIRST
      const token = localStorage.getItem("token");

      const res = await axios.get(
        `https://zensurex-backend.onrender.com/risk?city=${city}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setData(res.data);

    } catch (err) {
      console.error(err);
    }

  }

  fetchData();

}, [city]);


// ✅ EXISTING (risk API)
useEffect(() => {

  async function fetchData() {

    try {
      const token = localStorage.getItem("token");

      const res = await axios.get(
        `https://zensurex-backend.onrender.com/risk?city=${city}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setData(res.data);

    } catch (err) {
      console.error(err);
    }

  }

  fetchData();

}, [city]);


// 🔥 ADD THIS BELOW 👇 (NEW)
useEffect(() => {

  async function updateLocation() {
    if (city) {
      const coords = await getCityCoordinates(city);
      console.log("Coords:", coords);
      setPosition(coords);
    }
  }

  updateLocation();

}, [city]);


async function upgradePlan(selectedPlan){

  try{

    const token = localStorage.getItem("token");

    const res = await axios.post(
      "https://zensurex-backend.onrender.com/insurance/upgrade",
      null,
      {
        params:{ plan: selectedPlan },
        headers:{
          Authorization:`Bearer ${token}`
        }
      }
    );

    setPlan(res.data.plan);
    setPremium(res.data.premium);

    setMessage("Plan upgraded 🚀");

  }catch(err){
    console.error(err);
  }
}


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
  📍 {city} • Coverage & earnings overview
  </p>

  </div>

  </div>



  {/* LIVE STATUS */}

  <div className="status-grid">

  <motion.div className="status-card glass">

  <div className="status-icon risk">
  ⚠
  </div>

  <div>
  <p className="status-label">Risk Level</p>

  <p className={`status-value ${data?.risk?.toLowerCase()}`}>
  {data?.risk || "Loading"}
  </p>
  </div>

  </motion.div>



  <motion.div className="status-card glass">

  <div className="status-icon location">
  📍
  </div>

  <div>
  <p className="status-label">Location</p>
  <p className="status-value">Active</p>
  </div>

  </motion.div>



  <motion.div className="status-card glass">

  <div className="status-icon protection">
  🛡
  </div>

  <div>
  <p className="status-label">Protection</p>
  <p className="status-value">Running</p>
  </div>

  </motion.div>



  <motion.div className="status-card glass">

  <div className="status-icon payout">
  💰
  </div>

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

  <h3 className="dp-title">

  Your Location

  </h3>

  <MapContainer center={position} key={position.toString()}  zoom={13} className="map-rect">

  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

  {/* 📍 USER LOCATION */}
  <Marker position={position}>
    <Popup>You are here</Popup>
  </Marker>

  {/* 🔥 AI RISK ZONE */}
  {data?.risk && (
    <Circle
      center={position}
      radius={800}
      pathOptions={{
        color:
          data.risk === "HIGH"
            ? "red"
            : data.risk === "MEDIUM"
            ? "orange"
            : "green",
        fillColor:
          data.risk === "HIGH"
            ? "red"
            : data.risk === "MEDIUM"
            ? "orange"
            : "green",
        fillOpacity: 0.4
      }}
    />
  )}

</MapContainer>

  </motion.div>



  {/* GRAPH */}

  <motion.div className="dashboard-panel">

  <h3 className="dp-title">

  Income Disruption Trend

  </h3>

  <ResponsiveContainer width="100%" height={260}>

  <BarChart data={chartData}>

  <defs>

  <linearGradient id="riskColor">

  <stop offset="5%" stopColor="#ff4d4f"/>

  <stop offset="95%" stopColor="#ef4444"/>

  </linearGradient>

  </defs>

  <CartesianGrid stroke="#f1f5f9"/>

  <XAxis dataKey="period"/>

  <YAxis/>

  <Tooltip/>

  <Bar

  dataKey="risk"

  fill="url(#riskColor)"

  radius={[8,8,0,0]}

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

  <p className="dsc-label">

  ⚠ Risk Level

  </p>

  <h3 className={`card-value ${data?.risk?.toLowerCase()}`}>

  {data?.risk || "Loading..."}

  </h3>

  </motion.div>



  <motion.div

  className="dash-stat-card glass pool-card clickable"

  onClick={()=>navigate("/pool")}

  >

  <p className="dsc-label">

  👥 Community Pool

  </p>

  <h3 className="card-value">

  ₹1,50,000

  </h3>

  </motion.div>



  <motion.div className="dash-stat-card glass plan-card">

  <p className="dsc-label">

  📋 Active Plan

  </p>

  <h3 className="card-value">

  {plan || "No Plan"}

  </h3>

  </motion.div>



  <motion.div className="dash-stat-card glass premium-card">

  <p className="dsc-label">

  💰 Weekly Premium

  </p>

  <h3 className="card-value">

  ₹{premium || 0}

  </h3>

  </motion.div>



  <motion.div className="dash-stat-card glass">

  <p className="dsc-label">

  📊 Coverage Amount

  </p>

  <h3 className="card-value">

  ₹7,500

  </h3>

  </motion.div>



  <motion.div className="dash-stat-card glass">

  <p className="dsc-label">

  ⏱ Next Payout

  </p>

  <h3 className="card-value">

  5 min

  </h3>

  </motion.div>


  </div>




  {/* AI */}

  <motion.div className="dashboard-panel">

  <h3 className="dp-title">

  AI Recommendation

  </h3>

  {recommendation ? (

  <>

  <p>

  <b>Plan:</b> 
<span 
  style={{cursor:"pointer", color:"#6366f1"}}
  onClick={()=>upgradePlan(recommendation.plan)}
>
  {recommendation.plan} (Click to upgrade 🚀)
</span>

  </p>

  <p>

  <b>Reason:</b> {recommendation.reason}

  </p>

  <p>

  <b>Confidence:</b> {recommendation.confidence}%

  </p>

  </>

  ) : (

  <p>

  Analyzing...

  </p>

  )}

  </motion.div>



  {/* PROTECTION SUMMARY */}

  <motion.div className="dashboard-panel">

  <h3 className="dp-title">

  Protection Summary

  </h3>

  <p className="muted">

  Your income is protected from disruption risks.

  </p>

  <div className="mini-features">

  <div className="mini-feature">

  🌧 Rain protection

  </div>

  <div className="mini-feature">

  🔥 Heat risk cover

  </div>

  <div className="mini-feature">

  📉 Demand safety

  </div>

  </div>

  </motion.div>



  </div>

  </div>

  </div>

  </section>

    );

  }

  export default Dashboard;