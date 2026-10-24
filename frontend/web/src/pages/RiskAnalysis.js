import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";

const API = "https://zensurex-backend.onrender.com";

/* Payout triggers: change the limits here if your policy uses different ones */
const TRIGGERS = [
  { key: "rain", label: "Rain", icon: "🌧", unit: "mm", limit: 50, max: 100 },
  { key: "heat", label: "Heat", icon: "🔥", unit: "°C", limit: 42, max: 50 },
  { key: "aqi", label: "Air quality (AQI)", icon: "😷", unit: "", limit: 300, max: 500 },
];

function statusOf(value, limit) {
  if (value >= limit) return { text: "Triggered", color: "#ef4444", bg: "#fef2f2" };
  if (value >= limit * 0.7) return { text: "Close to trigger", color: "#f59e0b", bg: "#fffbeb" };
  return { text: "Safe", color: "#22c55e", bg: "#f0fdf4" };
}

function TriggerRow({ t, value }) {
  const s = statusOf(value, t.limit);
  const fill = Math.min((value / t.limit) * 100, 100);
  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid #eee" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong>
          {t.icon} {t.label}
        </strong>
        <span
          style={{
            background: s.bg,
            color: s.color,
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {s.text}
        </span>
      </div>
      <div style={{ height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fill}%` }}
          transition={{ duration: 0.5 }}
          style={{ height: "100%", background: s.color, borderRadius: 999 }}
        />
      </div>
      <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
        Now {value}
        {t.unit} · pays out at {t.limit}
        {t.unit}
      </p>
    </div>
  );
}

function RiskAnalysis() {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const city = user?.city || "Hyderabad";

  const [simulate, setSimulate] = useState(false);
  const [live, setLive] = useState({ rain: 0, heat: 0, aqi: 0, condition: "" });
  const [sim, setSim] = useState({ rain: 0, heat: 30, aqi: 100 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [risk, setRisk] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");

  /* load live weather for the user's city */
  useEffect(() => {
    async function fetchLiveData() {
      try {
        const res = await axios.get(`${API}/claims/weather/${city}`);
        const d = res.data;
        setLive({
          rain: Number(d.rain ?? d.rainfall ?? d.precipitation ?? 0),
          heat: Number(d.temp ?? d.temperature ?? 0),
          aqi: Number(d.aqi ?? 0),
          condition: String(d.condition || ""),
        });
      } catch (err) {
        console.error("API error:", err);
        setError("Could not load live data. The server may be waking up, try again in a few seconds.");
      } finally {
        setLoading(false);
      }
    }
    fetchLiveData();
  }, [city]);

  const values = simulate ? sim : live;
  const anyTriggered = TRIGGERS.some((t) => values[t.key] >= t.limit);
  const triggeredNames = TRIGGERS.filter((t) => values[t.key] >= t.limit).map((t) => t.label);

  /* decide the weather type from numbers (heat now depends on temperature, not "not clear") */
  function weatherType() {
    if (values.rain > 0 || values.condition.toLowerCase().includes("rain")) return "rain";
    if (values.heat >= 38) return "heat";
    return "normal";
  }

  async function calculateRisk() {
    setStatus("analyzing");
    try {
      const res = await axios.post(`${API}/claims/risk`, {
        weather: weatherType(),
        aqi: Number(values.aqi),
      });
      setRisk(res.data.risk);
      setReason(res.data.reason);
      setStatus("done");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  const riskColor = risk === "High" ? "#ef4444" : risk === "Medium" ? "#f59e0b" : "#22c55e";

  return (
    <section className="scene active risk-page">
      <div className="scene-layout scene-2-layout">
        {/* LEFT: trigger monitor */}
        <div>
          <motion.div className="dashboard-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="dp-title">Trigger Monitor</h3>
              <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
                Simulate a disaster
              </label>
            </div>

            <p className="muted" style={{ marginBottom: 4 }}>
              {simulate ? "Demo mode: move the sliders to test a payout." : `Live conditions for ${city}.`}
            </p>

            {loading && !simulate && <p className="muted">Loading live conditions...</p>}
            {error && !simulate && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}

            {(!loading || simulate) &&
              TRIGGERS.map((t) => <TriggerRow key={t.key} t={t} value={values[t.key]} />)}
          </motion.div>

          {simulate && (
            <div className="dashboard-panel">
              <h3 className="dp-title">Simulator</h3>
              {TRIGGERS.map((t) => (
                <div key={t.key} style={{ marginBottom: 14 }}>
                  <label style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>
                      {t.icon} {t.label}
                    </span>
                    <span>
                      {sim[t.key]}
                      {t.unit}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={t.max}
                    value={sim[t.key]}
                    onChange={(e) => setSim({ ...sim, [t.key]: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </div>
              ))}
              <button className="btn" onClick={() => setSim({ rain: 0, heat: 30, aqi: 100 })}>
                Reset
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: payout status + AI risk */}
        <div>
          <motion.div
            className="dashboard-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ borderLeft: `4px solid ${anyTriggered ? "#ef4444" : "#22c55e"}` }}
          >
            <h3 className="dp-title">Payout status</h3>
            {anyTriggered ? (
              <>
                <h2 style={{ color: "#ef4444" }}>Payout triggered</h2>
                <p>
                  {triggeredNames.join(" and ")} crossed the limit. Active policies in {city} are paid
                  automatically, with no claim form.
                </p>
              </>
            ) : (
              <>
                <h2 style={{ color: "#22c55e" }}>No payout right now</h2>
                <p className="muted">
                  All conditions are below the trigger limits. You are paid automatically as soon as one is crossed.
                </p>
              </>
            )}
          </motion.div>

          <motion.div className="dashboard-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h3 className="dp-title">AI risk check</h3>

            <button className="btn" onClick={calculateRisk} disabled={status === "analyzing"}>
              {status === "analyzing" ? "Analyzing..." : "Check risk level"}
            </button>

            {status === "" && <p className="muted" style={{ marginTop: 10 }}>Uses the conditions on the left.</p>}

            {status === "error" && (
              <div className="status-card warn" style={{ marginTop: 10 }}>
                Could not reach the server. Try again in a few seconds.
              </div>
            )}

            {status === "done" && (
              <motion.div
                className="risk-result"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{ marginTop: 12 }}
              >
                <p className="muted">Risk level</p>
                <h1 style={{ color: riskColor }}>{risk}</h1>
                <p>{reason}</p>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default RiskAnalysis;
