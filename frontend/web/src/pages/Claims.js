
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import useLiveRisk, { API_BASE } from "../components/useLiveRisk";
import "../styles/zensurex-ui.css";

const LIMITS = { rain: 7.5, heat: 45, pollution: 250 };

const OPTIONS = [
  { value: "rain", icon: "🌧", name: "Heavy rain" },
  { value: "pollution", icon: "🌫", name: "High pollution" },
  { value: "heat", icon: "🔥", name: "Extreme heat" },
  { value: "curfew", icon: "🚫", name: "Curfew" }
];

const styles = {
  page: {
    paddingTop: 96,
    maxWidth: 1200,
    margin: "0 auto",
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: 40,
    color: "var(--zx-ink, #0f172a)"
  },
  heading: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-.02em",
    margin: 0
  },
  muted: {
    color: "var(--zx-muted, #64748b)",
    fontSize: 13,
    lineHeight: 1.5
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
    gap: 20,
    alignItems: "start"
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    minWidth: 0
  },
  card: {
    background: "var(--zx-surface, #fff)",
    border: "1px solid var(--zx-line, #e2e8f0)",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 4px 18px rgba(15,23,42,.04)"
  },
  cardHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap"
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: 800,
    margin: "0 0 5px"
  },
  cardSub: {
    fontSize: 12.5,
    color: "var(--zx-muted, #64748b)",
    margin: 0,
    lineHeight: 1.5
  },
  button: {
    border: "1px solid var(--zx-line, #e2e8f0)",
    background: "var(--zx-surface, #fff)",
    color: "var(--zx-ink, #0f172a)",
    borderRadius: 10,
    padding: "9px 13px",
    fontWeight: 700,
    fontSize: 12.5,
    cursor: "pointer"
  },
  meter: { marginBottom: 18 },
  meterTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    fontSize: 13,
    flexWrap: "wrap"
  },
  bar: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    background: "var(--zx-line, #e2e8f0)"
  },
  steps: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "4px 0 24px"
  },
  step: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "var(--zx-muted, #64748b)",
    minWidth: 0
  },
  stepCircle: {
    width: 26,
    height: 26,
    minWidth: 26,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 800,
    border: "2px solid var(--zx-line, #e2e8f0)"
  },
  pickLabel: {
    display: "block",
    marginBottom: 12,
    fontSize: 13,
    fontWeight: 700,
    color: "var(--zx-muted, #64748b)"
  },
  types: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
    gap: 12,
    marginBottom: 16
  },
  type: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 12px",
    textAlign: "left",
    borderRadius: 14,
    border: "2px solid var(--zx-line, #e2e8f0)",
    background: "var(--zx-surface, #fff)",
    color: "var(--zx-ink, #0f172a)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    minWidth: 0
  },
  note: {
    margin: "0 0 12px",
    padding: "10px 12px",
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 1.5,
    background: "#fffbeb",
    border: "1px solid #fde68a",
    color: "#92400e"
  },
  payto: {
    margin: "0 0 12px",
    padding: "10px 12px",
    borderRadius: 10,
    fontSize: 13,
    background: "var(--zx-soft, #f8fafc)",
    border: "1px solid var(--zx-line, #e2e8f0)"
  },
  cta: {
    width: "100%",
    marginTop: 4,
    padding: "13px 16px",
    border: "none",
    borderRadius: 12,
    background: "var(--zx-brand, #4f46e5)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer"
  },
  empty: {
    minHeight: 150,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    textAlign: "center",
    padding: 16
  },
  banner: {
    padding: 13,
    borderRadius: 12,
    marginBottom: 18,
    fontSize: 13,
    lineHeight: 1.5,
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap"
  },
  result: {
    padding: 18,
    borderRadius: 16,
    fontSize: 14,
    lineHeight: 1.5,
    overflowWrap: "anywhere"
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))",
    gap: 10,
    marginTop: 12
  },
  resultItem: {
    padding: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,.7)",
    minWidth: 0,
    overflowWrap: "anywhere"
  },
  history: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 8,
    padding: "13px 0",
    borderTop: "1px solid var(--zx-line, #e2e8f0)",
    fontSize: 13
  }
};

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
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [upi, setUpi] = useState(null);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const temp = data?.weather?.temp ?? 0;
  const rainMm = data?.weather?.rain_mm ?? 0;
  const aqi = data?.aqi ?? 0;

  const meters = [
    {
      key: "rain",
      icon: "🌧",
      label: "Heavy rain",
      value: rainMm,
      limit: LIMITS.rain,
      unit: "mm/h",
      digits: 1
    },
    {
      key: "heat",
      icon: "🔥",
      label: "Extreme heat",
      value: temp,
      limit: LIMITS.heat,
      unit: "°C",
      digits: 0
    },
    {
      key: "pollution",
      icon: "🌫",
      label: "High pollution",
      value: aqi,
      limit: LIMITS.pollution,
      unit: "AQI",
      digits: 0
    }
  ];

  const triggered = data
    ? meters.filter(m => m.value > m.limit).map(m => m.key)
    : [];

  const busy = status === "verifying";
  const selectedName =
    OPTIONS.find(o => o.value === selected)?.name || "";
  const risk = scoreLabel(result?.score);

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
    if (!selected || busy) return;

    setStatus("verifying");
    setResult(null);

    try {
      const res = await axios.post(
        `${API_BASE}/claims/auto`,
        { trigger: selected },
        { headers }
      );

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
        reason:
          err.response?.data?.detail ||
          "The server could not process the claim. Try again.",
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

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain"
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "claim_receipt.txt";
    a.click();

    window.URL.revokeObjectURL(url);
  }

  let warning = "";

  if (data && selected) {
    if (selected === "curfew") {
      warning =
        "Curfews cannot be checked from live data, so this claim needs a manual review.";
    } else if (!triggered.includes(selected)) {
      warning =
        "Live data does not show this disruption right now. The claim may be rejected.";
    }
  }

  const stepIndex =
    status === "verifying" ? 1 : status === "approved" ? 2 : 0;

  const steps = ["Submit", "AI review", "Payout"];

  return (
    <section className="scene active">
      <div className="zx-page zx-claims" style={styles.page}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={styles.heading}>Claims</h1>
          <p style={{ ...styles.muted, marginTop: 5, fontSize: 14 }}>
            Payouts trigger from live conditions in{" "}
            {data?.city || localStorage.getItem("city") || "your area"}.
          </p>
        </div>

        {error && (
          <div
            style={{
              ...styles.banner,
              background: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca"
            }}
          >
            <span>⚠️ {error}</span>
            <button
              style={{ ...styles.button, marginLeft: "auto" }}
              onClick={refresh}
            >
              Try again
            </button>
          </div>
        )}

        <div style={styles.grid}>
          {/* LEFT COLUMN */}
          <div style={styles.column}>
            {/* Live payout triggers */}
            <div style={styles.card}>
              <div style={styles.cardHead}>
                <div>
                  <h3 style={styles.cardTitle}>Live payout triggers</h3>
                  <p style={styles.cardSub}>
                    A payout is due when a bar reaches its limit.
                  </p>
                </div>

                <button
                  style={styles.button}
                  onClick={refresh}
                  disabled={loading}
                >
                  {loading ? "Checking..." : "↻ Refresh"}
                </button>
              </div>

              {loading && !data ? (
                <div
                  style={{
                    height: 150,
                    borderRadius: 12,
                    background: "var(--zx-soft, #f8fafc)"
                  }}
                />
              ) : (
                meters.map(m => {
                  const ratio = m.limit ? m.value / m.limit : 0;
                  const hit = m.value > m.limit;

                  return (
                    <div key={m.key} style={styles.meter}>
                      <div style={styles.meterTop}>
                        <span>
                          {m.icon} {m.label}
                        </span>

                        <span>
                          <b>{Number(m.value).toFixed(m.digits)}</b>{" "}
                          of {m.limit} {m.unit}

                          {hit && (
                            <span
                              style={{
                                marginLeft: 8,
                                padding: "3px 8px",
                                borderRadius: 999,
                                background: "#fee2e2",
                                color: "#b91c1c",
                                fontSize: 11,
                                fontWeight: 800,
                                whiteSpace: "nowrap"
                              }}
                            >
                              Triggered
                            </span>
                          )}
                        </span>
                      </div>

                      <div style={styles.bar}>
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.min(100, ratio * 100)}%`,
                            background: meterColor(ratio),
                            borderRadius: 999,
                            transition: "width .8s ease"
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}

              {data && (
                <p style={{ ...styles.muted, marginTop: 12 }}>
                  Overall risk:{" "}
                  <b
                    style={{
                      color:
                        data.risk === "HIGH"
                          ? "#ef4444"
                          : data.risk === "MEDIUM"
                          ? "#f59e0b"
                          : "#22c55e"
                    }}
                  >
                    {data.risk}
                  </b>

                  {triggered.length === 0
                    ? ". Nothing has reached a payout limit right now."
                    : ""}
                </p>
              )}
            </div>

            {/* File a claim */}
            <div style={styles.card}>
              <div style={styles.cardHead}>
                <div>
                  <h3 style={styles.cardTitle}>File a claim</h3>
                  <p style={styles.cardSub}>
                    Confirm the disruption that stopped your work.
                  </p>
                </div>
              </div>

              <div style={styles.steps}>
                {steps.map((step, i) => {
                  const active = i <= stepIndex;

                  return (
                    <div
                      key={step}
                      style={{
                        ...styles.step,
                        color: active
                          ? "var(--zx-ink, #0f172a)"
                          : "var(--zx-muted, #64748b)"
                      }}
                    >
                      <span
                        style={{
                          ...styles.stepCircle,
                          background: active
                            ? "var(--zx-brand, #4f46e5)"
                            : "var(--zx-soft, #f8fafc)",
                          borderColor: active
                            ? "var(--zx-brand, #4f46e5)"
                            : "var(--zx-line, #e2e8f0)",
                          color: active ? "#fff" : "inherit"
                        }}
                      >
                        {i + 1}
                      </span>
                      {step}
                    </div>
                  );
                })}
              </div>

              <span style={styles.pickLabel}>
                What stopped your work?
              </span>

              <div
                style={styles.types}
                role="radiogroup"
                aria-label="Claim disruption type"
              >
                {OPTIONS.map(o => {
                  const live = triggered.includes(o.value);
                  const on = selected === o.value;

                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={busy}
                      onClick={() => setSelected(o.value)}
                      style={{
                        ...styles.type,
                        borderColor: on
                          ? "var(--zx-brand, #4f46e5)"
                          : "var(--zx-line, #e2e8f0)",
                        background: on
                          ? "var(--zx-brand-soft, #eef2ff)"
                          : "var(--zx-surface, #fff)",
                        boxShadow: on
                          ? "0 0 0 3px rgba(79,70,229,.12)"
                          : "none",
                        opacity: busy ? 0.6 : 1,
                        cursor: busy ? "not-allowed" : "pointer"
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{o.icon}</span>
                      <span>{o.name}</span>

                      {live && (
                        <span
                          style={{
                            position: "absolute",
                            top: -9,
                            right: 8,
                            background: "#dc2626",
                            color: "#fff",
                            borderRadius: 999,
                            padding: "3px 7px",
                            fontSize: 10,
                            fontWeight: 800
                          }}
                        >
                          Live now
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {warning && <p style={styles.note}>{warning}</p>}

              {upi === "" && (
                <p style={styles.note}>
                  Add your UPI ID in your profile so the payout can reach you.{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/profile")}
                    style={{
                      border: "none",
                      padding: 0,
                      background: "transparent",
                      color: "#4338ca",
                      fontWeight: 800,
                      cursor: "pointer",
                      textDecoration: "underline"
                    }}
                  >
                    Open profile
                  </button>
                </p>
              )}

              {upi && (
                <p style={styles.payto}>
                  Payout goes to <b>{upi}</b>
                </p>
              )}

              <button
                style={{
                  ...styles.cta,
                  opacity: busy || !selected ? 0.65 : 1,
                  cursor: busy || !selected ? "not-allowed" : "pointer"
                }}
                onClick={submit}
                disabled={!selected || busy}
              >
                {busy
                  ? "Checking your claim..."
                  : `⚡ Submit ${selectedName.toLowerCase()} claim`}
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={styles.column}>
            {/* AI decision */}
            <div style={styles.card}>
              <div style={styles.cardHead}>
                <div>
                  <h3 style={styles.cardTitle}>AI decision</h3>
                  <p style={styles.cardSub}>
                    Checked against live weather and fraud rules.
                  </p>
                </div>
              </div>

              {status === "idle" && (
                <div style={styles.empty}>
                  <span style={{ fontSize: 34 }}>🤖</span>
                  <b>No claim submitted yet</b>
                  <span style={styles.muted}>
                    Submit a claim and the decision appears here.
                  </span>
                </div>
              )}

              {status === "verifying" && (
                <div
                  style={{
                    ...styles.banner,
                    margin: 0,
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    color: "#92400e"
                  }}
                >
                  🤖 Analysing weather, demand and fraud signals...
                </div>
              )}

              {status === "approved" && result && (
                <div
                  style={{
                    ...styles.result,
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    color: "#14532d"
                  }}
                >
                  <p style={{ fontWeight: 800, margin: "0 0 8px" }}>
                    ⚡ Claim approved
                  </p>

                  <p
                    style={{
                      fontSize: 34,
                      fontWeight: 800,
                      letterSpacing: "-.02em",
                      margin: "0 0 8px"
                    }}
                  >
                    ₹{result.amount}
                  </p>

                  <p>{result.reason}</p>

                  <div style={styles.resultGrid}>
                    <div style={styles.resultItem}>
                      <span style={styles.muted}>Payment</span>
                      <b>{result.paid ? "✅ Paid" : "❌ Failed"}</b>
                    </div>

                    {risk && (
                      <div style={styles.resultItem}>
                        <span style={styles.muted}>Fraud risk</span>
                        <b>{risk}</b>
                      </div>
                    )}

                    {result.fraud && (
                      <div style={styles.resultItem}>
                        <span style={styles.muted}>Review</span>
                        <b>{result.fraud}</b>
                      </div>
                    )}

                    {result.payment?.time && (
                      <div style={styles.resultItem}>
                        <span style={styles.muted}>Time</span>
                        <b>{result.payment.time}</b>
                      </div>
                    )}

                    {result.payment?.id && (
                      <div style={styles.resultItem}>
                        <span style={styles.muted}>Transaction ID</span>
                        <b>{result.payment.id}</b>
                      </div>
                    )}
                  </div>

                  <button
                    style={{ ...styles.button, marginTop: 14 }}
                    onClick={downloadReceipt}
                  >
                    🧾 Download receipt
                  </button>
                </div>
              )}

              {status === "rejected" && result && (
                <div
                  style={{
                    ...styles.result,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#7f1d1d"
                  }}
                >
                  <p style={{ fontWeight: 800 }}>
                    ❌ Claim not approved
                  </p>
                  <p>
                    {result.reason ||
                      "The claim did not meet the payout rules."}
                  </p>
                </div>
              )}
            </div>

            {/* Recent claims */}
            <div style={styles.card}>
              <div style={styles.cardHead}>
                <div>
                  <h3 style={styles.cardTitle}>Recent claims</h3>
                  <p style={styles.cardSub}>Your last payouts</p>
                </div>
              </div>

              {recentLoading ? (
                <div
                  style={{
                    height: 90,
                    borderRadius: 12,
                    background: "var(--zx-soft, #f8fafc)"
                  }}
                />
              ) : recent.length === 0 ? (
                <div style={styles.empty}>
                  <span style={{ fontSize: 34 }}>🧾</span>
                  <b>No claims yet</b>
                  <span style={styles.muted}>
                    Approved claims will be listed here.
                  </span>
                </div>
              ) : (
                recent.map((c, i) => (
                  <div key={i} style={styles.history}>
                    <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                      {c.type}
                      <span
                        style={{
                          display: "block",
                          ...styles.muted,
                          fontSize: 11,
                          marginTop: 3
                        }}
                      >
                        {c.date}
                      </span>
                    </span>

                    <b style={{ whiteSpace: "nowrap" }}>₹{c.amount}</b>
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
