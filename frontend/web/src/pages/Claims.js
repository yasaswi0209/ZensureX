import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import axios from "axios";

function Claims(){

const [payment, setPayment] = useState("");
const [selected,setSelected] = useState("");
const [open,setOpen] = useState(false);
const [status,setStatus] = useState("");
const [payout,setPayout] = useState(null);
const [reason,setReason] = useState("");
const [confidence,setConfidence] = useState(null);
const [risk,setRisk] = useState(null);
const [paymentDetails, setPaymentDetails] = useState(null);
const [userPayment, setUserPayment] = useState(null);
const [fraudReason, setFraudReason] = useState("");
const [recentClaims, setRecentClaims] = useState([]);
const [alertMsg, setAlertMsg] = useState("");

// ✅ ADD THIS FUNCTION HERE
function downloadReceipt(){

const content = `
Claim Receipt
-------------------------
Amount: ₹${payout}
Reason: ${reason}
UPI: ${userPayment?.upi}
Time: ${paymentDetails?.time}
Transaction ID: ${paymentDetails?.id}
`;

const blob = new Blob([content], { type: "text/plain" });
const url = window.URL.createObjectURL(blob);

const a = document.createElement("a");
a.href = url;
a.download = "claim_receipt.txt";
a.click();
}
const dropdownRef = useRef();

const options = [
{ value:"rain", label:"🌧 Heavy Rain" },
{ value:"pollution", label:"🌫 High Pollution" },
{ value:"heat", label:"🔥 Extreme Heat" },
{ value:"curfew", label:"🚫 Curfew" }
];


// 🔥 CLOSE DROPDOWN
useEffect(()=>{
function close(e){
if(dropdownRef.current && !dropdownRef.current.contains(e.target)){
setOpen(false);
}
}
document.addEventListener("mousedown",close);
return ()=>document.removeEventListener("mousedown",close);
},[]);


// 🔥 AUTO SELECT RAIN
useEffect(()=>{
setTimeout(()=>{ setSelected("rain"); },700);
},[]);


// 🔥 FETCH USER PAYMENT
useEffect(() => {
const user = JSON.parse(localStorage.getItem("user"));

if(user?.id){
axios.get(`https://zensurex-backend.onrender.com/settings/${user.id}`)
.then(res => setUserPayment(res.data))
.catch(err => console.error(err));
}
}, []);


// 🔥 FETCH RECENT CLAIMS (FIXED)
useEffect(() => {
axios.get("https://zensurex-backend.onrender.com/claims/recent")
.then(res => setRecentClaims(res.data))
.catch(err => console.error(err));
}, []);


// 🔥 AUTO CLAIM TRIGGER
useEffect(() => {
if(selected){
autoTriggerClaim();
}
}, [selected]);


async function autoTriggerClaim(){
try{

const user = JSON.parse(localStorage.getItem("user"));

const city = localStorage.getItem("city") || "Hyderabad";

// 🌦️ GET LIVE WEATHER
const weatherRes = await axios.get(
  `https://zensurex-backend.onrender.com/claims/weather/${city}`
);

// 🚀 AUTO CLAIM
const res = await axios.post("https://zensurex-backend.onrender.com/claims/auto", {
  user_id: user?.id,
  city: city,
  trigger: selected
});

const data = res.data;

setReason(data.reason || data.message);
setPayout(data.amount || 0);
setPayment(data.payment_status);
setPaymentDetails(data.payment);
setFraudReason(data.fraud_reason || "Valid claim");
setConfidence(95);

if(data.status === "approved"){

setAlertMsg("💸 ₹" + data.amount + " sent to your UPI");

setStatus("approved");

if(data.risk_score < 0.4){
setRisk("low");
} else if(data.risk_score < 0.7){
setRisk("medium");
} else {
setRisk("high");
}

}

}catch(err){
console.error(err);
setStatus("rejected");
setReason("Server error");
}
}


// 🔘 MANUAL BUTTON
async function handleApply(){

if(!selected){
setStatus("rejected");
setReason("Select disruption");
return;
}

// 🔥 show loading animation
setStatus("verifying");

// 🔥 trigger claim (same as auto but manual)
await autoTriggerClaim();

}


return(

<section className="scene active">

<div className="scene-layout scene-2-layout">

{/* LEFT */}
<div className="claims-left">

<motion.div className="dashboard-panel">

<h3 className="dp-title">AI Claim Engine</h3>

<div className="workflow-box">
<WorkflowStep label="Submit" active/>
<WorkflowStep label="AI Review" active={status==="verifying"}/>
<WorkflowStep label="Payout" active={status==="approved"}/>
</div>

<div className="ai-suggestion">
AI detected disruption: <b>🌧 Heavy Rain</b>
</div>

<div ref={dropdownRef} className="dropdown-box">

<label>Confirm disruption</label>

<div className="dropdown" onClick={()=>setOpen(!open)}>
<span>
{selected ? options.find(o=>o.value===selected)?.label : "Choose disruption"}
</span>
<span>▾</span>
</div>

{open && (
<div className="dropdown-list">
{options.map(opt=>(
<div key={opt.value}
className="dropdown-item"
onClick={()=>{
setSelected(opt.value);
setOpen(false);
}}>
{opt.label}
</div>
))}
</div>
)}

</div>

<button className="btn" onClick={handleApply}>
⚡ Auto Claim Now
</button>

</motion.div>


{/* 🔥 RECENT CLAIMS (FIXED) */}
<motion.div className="dashboard-panel">
<h3 className="dp-title">Recent Claims</h3>

{recentClaims.map((c,i)=>(
<div key={i} className="claim-history-item">
<span>{c.type}</span>
<span>₹{c.amount}</span>
<span className="muted">{c.date}</span>
</div>
))}

</motion.div>

</div>


{/* RIGHT */}
<div className="claims-right">

<motion.div className="dashboard-panel decision-panel">

<h3 className="dp-title">AI Decision</h3>

{status==="" && <p>Auto-detecting disruption...</p>}

{status==="verifying" && (
<div className="status-card warn">
🤖 analysing weather & demand...
</div>
)}

{status==="approved" && (
<div className="status-card success">

<div className="decision-row">

{/* LEFT */}
<div className="decision-left">
<p className="auto-tag">⚡ Auto Claim Triggered</p>
<h3>{reason}</h3>
</div>

{/* CENTER */}
<div className="decision-center">
<h1>₹{payout}</h1>
<p>AI confidence {confidence}%</p>
</div>

{/* RIGHT */}
<div className="decision-right">

<p><b>Risk:</b> {risk}</p>
<p><b>Decision:</b> {fraudReason}</p>
<p>{payment==="success" ? "✅ Paid" : "❌ Failed"}</p>

{/* 🔥 MOVE PAYMENT DETAILS INSIDE HERE */}
{paymentDetails && (
<div className="mini-box">
<p><b>Time:</b> {paymentDetails.time}</p>
<p><b>Transaction ID:</b> {paymentDetails?.id}</p>
</div>
)}

</div>

</div>


<button onClick={downloadReceipt} className="btn">
🧾 Download Receipt
</button>

</div>
)}

{status==="rejected" && (
<div className="status-card danger">
<h3>❌ Claim Rejected</h3>
<p>{reason}</p>
<p>₹{payout}</p>
</div>
)}

</motion.div>

</div>

</div>

</section>
);
}


function WorkflowStep({label,active}){
return(
<div className={`workflow-step ${active?"active":""}`}>
<div className="dot"/>
{label}
</div>
);
}

export default Claims;