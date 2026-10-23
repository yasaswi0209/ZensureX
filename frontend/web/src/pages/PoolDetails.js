import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import axios from "axios";


const API_BASE = "https://zensurex-backend.onrender.com";

const inr = n => Number(n || 0).toLocaleString("en-IN");


function PoolDetails(){

  const [search,setSearch] = useState("");
  const [pool,setPool] = useState(null);
  const [error,setError] = useState("");

  useEffect(()=>{
    const token = localStorage.getItem("token");
    axios.get(`${API_BASE}/pool/me`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(res => setPool(res.data))
      .catch(() => setError("Could not load the pool. Try again."));
  },[]);

  const workers = pool?.members || [];
  const payoutTrend = pool?.trend || [];

  const filteredWorkers = workers.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase())
  );


  return(

<section className="scene active">

<div className="pool-container">


{/* COMMUNITY POOL INFO */}

<motion.div
className="dashboard-panel glass pool-info-card"
initial={{opacity:0}}
animate={{opacity:1}}
>

<h3 className="dp-title">

Community Pool – How it works

</h3>


<p className="muted">

The Community Pool is formed by gig workers located in the same nearby area or city.

People working in similar locations often face common risks such as rain, heat,
pollution, or low demand.

Each member contributes a small weekly premium into a shared fund.
When disruption affects workers in that location, payouts are released
from the same community pool.

This creates fair contribution, faster support, and stronger protection
for workers in your area.

</p>

</motion.div>



{/* TOP SECTION */}

<div className="pool-top">


{/* STATS */}

<div className="dash-stats-grid">

<motion.div
className="dash-stat-card glass"
whileHover={{scale:1.05}}
>

<p className="dsc-label">
Pool Balance
</p>

<h3 className="highlight-green">
{pool ? `₹${inr(pool.balance)}` : "..."}
</h3>

<p className="muted">
{pool ? pool.zone_label : "community protection fund"}
</p>

</motion.div>



<motion.div
className="dash-stat-card glass"
whileHover={{scale:1.05}}
>

<p className="dsc-label">
Workers
</p>

<h3>
{pool ? pool.member_count : "..."}
</h3>

<p className="muted">
active members in your zone
</p>

</motion.div>



<motion.div
className="dash-stat-card glass"
whileHover={{scale:1.05}}
>

<p className="dsc-label">
Premiums Collected
</p>

<h3 className="highlight-green">
{pool ? `₹${inr(pool.total_premiums)}` : "..."}
</h3>

<p className="muted">
{pool ? `plus ₹${inr(pool.seed_funds)} seed funds` : "from active plans"}
</p>

</motion.div>



<motion.div
className="dash-stat-card glass"
whileHover={{scale:1.05}}
>

<p className="dsc-label">
Total Payout
</p>

<h3 className="highlight-red">
{pool ? `₹${inr(pool.total_payouts)}` : "..."}
</h3>

<p className="muted">
paid out from this pool
</p>

</motion.div>

</div>



{/* GRAPH */}

<motion.div
className="dashboard-panel glass graph-panel"
initial={{opacity:0}}
animate={{opacity:1}}
>

<h3 className="dp-title">

Contribution vs Payout (last 4 weeks)

</h3>


<ResponsiveContainer width="100%" height={320}>

<BarChart data={payoutTrend}>

<CartesianGrid strokeDasharray="3 3"/>

<XAxis dataKey="period"/>

<YAxis/>

<Tooltip/>


<defs>

<linearGradient id="greenGradient">

<stop offset="0%" stopColor="#22c55e"/>

<stop offset="100%" stopColor="#4ade80"/>

</linearGradient>


<linearGradient id="redGradient">

<stop offset="0%" stopColor="#ef4444"/>

<stop offset="100%" stopColor="#f87171"/>

</linearGradient>

</defs>


<Bar
dataKey="contribution"
fill="url(#greenGradient)"
radius={[8,8,0,0]}
/>


<Bar
dataKey="payout"
fill="url(#redGradient)"
radius={[8,8,0,0]}
/>


</BarChart>

</ResponsiveContainer>


<p className="muted">

Balanced contribution keeps the protection pool stable.

</p>

</motion.div>

</div>




{/* MEMBERS */}

<motion.div
className="dashboard-panel glass members-panel"
initial={{opacity:0}}
animate={{opacity:1}}
>

<div className="member-header">

<h3 className="dp-title">

Community Members

</h3>


<input
className="modern-search"
placeholder="🔍 search worker..."
value={search}
onChange={(e)=>setSearch(e.target.value)}
/>

</div>



<div className="pool-list">

{/* HEADER ROW */}

<div className="worker-card header-row grid-worker">

<div>Name</div>

<div>Plan</div>

<div>Contribution</div>

<div>Status</div>

</div>



{error && <p className="muted">{error}</p>}

{pool && filteredWorkers.length === 0 && (
<p className="muted">No active members yet. Members appear when they confirm a plan.</p>
)}

{filteredWorkers.map((w,i)=>(

<motion.div
key={`${w.name}-${i}`}
className="worker-card modern-card grid-worker"
whileHover={{scale:1.02}}
>

{/* NAME */}

<div>

<h3>{w.name}</h3>

<p className="muted">{pool?.zone_label}</p>

</div>


{/* PLAN COLUMN */}

<div className="area-badge">

🛡 {w.plan}

</div>


{/* CONTRIBUTION */}

<div className="contribution">

+₹{inr(w.contribution)}/wk

</div>


{/* STATUS */}

<div>

{w.payout>0 ?

<span className="paid">

₹{inr(w.payout)}

</span>

:

<span className="safe">

Protected

</span>

}

</div>

</motion.div>

))}

</div>


</motion.div>



</div>

</section>

  )

}

export default PoolDetails;
