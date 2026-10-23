import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import useLiveRisk, { API_BASE } from "../components/useLiveRisk";
import "../styles/zensurex-ui.css";

// Same limits the Policy page uses to decide a payout is due
const LIMITS = { rain: 7.5, heat: 45, pollution: 250 };

const OPTIONS = [
  { value: "rain", label: "🌧 Heavy rain" },
  { value: "pollution", label: "🌫 High pollution" },
  { value: "heat", label: "🔥 Extreme heat" },
  { value: "curfew", label: "🚫 Curfew" }
];

function meterColor(ratio) {
  if (ratio >= 1) return "#ef4444";
  if (ratio >= 0.5) return "#f59e0b";
  return "#22c55e";
}

function scoreLabel(score) {
  if (typeof score !== "number") return null;
  if (score < 0.4) return "Low";
  if (score < 0.7) return "Medium";
  return "High";
}

function Claims() {

  const navigate = useNavigate();
  const { data, loading, error, refresh } = useLiveRisk();

  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("idle"); // idle | verifying | approved | rejected
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [upi, setUpi] = useState(null); // null = loading, "" = not set

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const temp = data?.weather?.temp ?? 0;
  const rainMm = data?.weather?.rain_mm ?? 0;
  const aqi = data?.aqi ?? 0;

  const meters = [
    { key: "rain", icon: "🌧", label: "Heavy rain", value: rainMm, limit: LIMITS.rain, unit: "mm/h", digits: 1 },
    { key: "heat", icon: "🔥", label: "Extreme heat", value: temp, limit: LIMITS.heat, unit: "°C", digits: 0 },
    { key: "pollution", icon: "🌫", label: "High pollution", value: aqi, limit: LIMITS.pollution, unit: "AQI", digits: 0 }
  ];
  const triggered = data ? meters.filter(m => m.value > m.limit).map(m => m.key) : [];

  // default to what live data actually shows
  useEffect(() => {
    if (!data || selected) return;
    setSelected(triggered[0] || "rain");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function loadRecent() {
    axios
      .get(`${API_BASE}/claims/recent`, { headers })
      .then(res => setRecent(res.data || []))
      .catch(err => console.error(err))
      .finally(() => setRecentLoading(false));
  }

  useEffect(() => {
    loadRecent();
    axios
      .get(`${API_BASE}/settings/profile/me`, { headers })
      .then(res => setUpi(res.data.upi_id || ""))
      .catch(() => setUpi(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!selected || status === "verifying") return;
    setStatus("verifying");
    setResult(null);

    try {
      const res = await axios.post(`${API_BASE}/claims/auto`, { trigger: selected }, { headers });
      const d = res.data;

      setResult({
        reason: d.reason || d.message || "",
        amount: d.amount || 0,
        paid: d.payment_status === "success",
        payment: d.payment || null,
        fraud: d.fraud_reason || "",
        score: d.risk_score
      });
      setStatus(d.status === "approved" ? "approved" : "rejected");
      loadRecent();
    } catch (err) {
      console.error(err);
      setResult({
        reason: err.response?.data?.detail || "The server could not process the claim. Try again.",
        amount: 0
      });
      setStatus("rejected");
    }
  }

  function downloadReceipt() {
    const lines = [
      "ZensureX claim receipt",
      "-------------------------",
      `Amount: Rs ${result?.amount}`,
      `Reason: ${result?.reason}`,
      `UPI: ${upi || "not set"}`,
      `Time: ${result?.payment?.time || ""}`,
      `Transaction ID: ${result?.payment?.id || ""}`
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "claim_receipt.txt";
    a.click();
    window.URL.revokeObjectURL(url);
  }

  const selectedLabel = OPTIONS.find(o => o.value === selected)?.label || "";
  let warning = "";
  if (data && selected) {
    if (selected === "curfew") warning = "Curfews cannot be checked from live data, so this claim needs a manual review.";
    else if (!triggered.includes(selected)) warning = "Live data does not show this disruption right now. The claim may be rejected.";
  }

  const stepIndex = status === "verifying" ? 1 : status === "approved" ? 2 : 0;
  const risk = scoreLabel(result?.score);

  return (
    <section className="scene active">
      <div className="zx-page" style={{ paddingTop: 96 }}>

        <div className="zx-rise" style={{ "--i": 0, marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.02em", margin: 0 }}>Claims</h1>
          <p className="zx-muted" style={{ marginTop: 4, fontSize: 14 }}>
            Payouts trigger from live conditions in {data?.city || localStorage.getItem("city") || "your area"}.
          </p>
        </div>

        {error && (
          <div className="zx-banner zx-banner-danger">
            <span>⚠️</span><span>{error}</span>
            <button className="zx-cta" style={{ marginLeft: "auto", marginTop: 0 }} onClick={refresh}>Try again</button>
          </div>
        )}

        <div className="zx-grid">

          {/* LEFT */}
          <div className="zx-col">

            <div className="zx-card zx-rise" style={{ "--i": 1 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">Live payout triggers</h3>
                  <p className="zx-card-sub">A payout is due when a bar reaches its limit.</p>
                </div>
                <button className="zx-btn" onClick={refresh} disabled={loading}>{loading ? "Checking..." : "Refresh"}</button>
              </div>

              {loading && !data ? (
                <span className="zx-skel" style={{ width: "100%", height: 170 }} />
              ) : (
                meters.map(m => {
                  const ratio = m.limit ? m.value / m.limit : 0;
                  const hit = m.value > m.limit;
                  return (
                    <div key={m.key} className="zx-meter">
                      <div className="zx-meter-top">
                        <span>{m.icon} {m.label}</span>
                        <span>
                          <b>{Number(m.value).toFixed(m.digits)}</b> of {m.limit} {m.unit}
                          {hit && <em className="zx-hit">Triggered</em>}
                        </span>
                      </div>
                      <div className="zx-bar" style={{ height: 8 }}>
                        <div
                          className="zx-bar-fill"
                          style={{ width: `${Math.min(100, ratio * 100)}%`, background: meterColor(ratio) }}
                        />
                      </div>
                    </div>
                  );
                })
              )}

              {data && (
                <p className="zx-muted" style={{ marginTop: 12 }}>
                  Overall risk: <b style={{ color: data.risk === "HIGH" ? "#ef4444" : data.risk === "MEDIUM" ? "#f59e0b" : "#22c55e" }}>{data.risk}</b>
                  {triggered.length === 0 ? ". Nothing has reached a payout limit right now." : ""}
                </p>
              )}
            </div>

            <div className="zx-card zx-rise" style={{ "--i": 2 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">File a claim</h3>
                  <p className="zx-card-sub">Confirm the disruption that stopped your work.</p>
                </div>
              </div>

              <div className="zx-steps">
                {["Submit", "AI review", "Payout"].map((s, i) => (
                  <div key={s} className={`zx-step ${i <= stepIndex ? "on" : ""}`}>
                    <span>{i + 1}</span>{s}
                  </div>
                ))}
              </div>

              <div className="zx-field">
                <label htmlFor="claim-type">Disruption</label>
                <select id="claim-type" className="zx-select" value={selected} onChange={e => setSelected(e.target.value)}>
                  {OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {warning && <p className="zx-note">{warning}</p>}

              {upi === "" && (
                <p className="zx-note">
                  Add your UPI ID in your profile so the payout can reach you.{" "}
                  <button className="zx-link-btn" onClick={() => navigate("/profile")}>Open profile</button>
                </p>
              )}
              {upi && <p className="zx-muted" style={{ marginBottom: 12 }}>Payout goes to {upi}</p>}

              <button className="zx-cta" style={{ marginTop: 4 }} onClick={submit} disabled={!selected || status === "verifying"}>
                {status === "verifying" ? "Checking your claim..." : `⚡ Submit ${selectedLabel ? selectedLabel.replace(/^\S+\s/, "").toLowerCase() : ""} claim`}
              </button>
            </div>

          </div>

          {/* RIGHT */}
          <div className="zx-col">

            <div className="zx-card zx-rise" style={{ "--i": 3 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">AI decision</h3>
                  <p className="zx-card-sub">Checked against live weather and fraud rules.</p>
                </div>
              </div>

              {status === "idle" && (
                <div className="zx-empty" style={{ minHeight: 160 }}>
                  <span className="zx-empty-icon">🤖</span>
                  <b>No claim submitted yet</b>
                  <span className="zx-muted">Submit a claim and the decision appears here.</span>
                </div>
              )}

              {status === "verifying" && (
                <div className="zx-banner zx-banner-warn" style={{ margin: 0 }}>
                  <span>🤖</span><span>Analysing weather, demand and fraud signals...</span>
                </div>
              )}

              {status === "approved" && result && (
                <div className="zx-result ok">
                  <p className="zx-result-tag">⚡ Claim approved</p>
                  <p className="zx-result-amount">₹{result.amount}</p>
                  <p>{result.reason}</p>
                  <div className="zx-result-grid">
                    <div><span>Payment</span><b>{result.paid ? "✅ Paid" : "❌ Failed"}</b></div>
                    {risk && <div><span>Fraud risk</span><b>{risk}</b></div>}
                    {result.fraud && <div><span>Review</span><b>{result.fraud}</b></div>}
                    {result.payment?.time && <div><span>Time</span><b>{result.payment.time}</b></div>}
                    {result.payment?.id && <div><span>Transaction ID</span><b>{result.payment.id}</b></div>}
                  </div>
                  <button className="zx-btn" style={{ marginTop: 14 }} onClick={downloadReceipt}>🧾 Download receipt</button>
                </div>
              )}

              {status === "rejected" && result && (
                <div className="zx-result bad">
                  <p className="zx-result-tag">❌ Claim not approved</p>
                  <p>{result.reason || "The claim did not meet the payout rules."}</p>
                </div>
              )}
            </div>

            <div className="zx-card zx-rise" style={{ "--i": 4 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">Recent claims</h3>
                  <p className="zx-card-sub">Your last payouts</p>
                </div>
              </div>

              {recentLoading ? (
                <span className="zx-skel" style={{ width: "100%", height: 90 }} />
              ) : recent.length === 0 ? (
                <div className="zx-empty" style={{ minHeight: 140 }}>
                  <span className="zx-empty-icon">🧾</span>
                  <b>No claims yet</b>
                  <span className="zx-muted">Approved claims will be listed here.</span>
                </div>
              ) : (
                recent.map((c, i) => (
                  <div key={i} className="zx-history">
                    <span className="zx-history-type">{c.type}</span>
                    <b>₹{c.amount}</b>
                    <span className="zx-muted">{c.date}</span>
                  </div>
                ))
              )}
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}

export default Claims;
