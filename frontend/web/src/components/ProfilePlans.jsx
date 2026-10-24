import { useState, useEffect } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "https://zensurex-backend.onrender.com";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ProfilePlans() {
  const [state, setState] = useState({ loading: true, error: false, current: null, payments: [] });
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setState({ loading: false, error: false, current: null, payments: [] });
      return;
    }

    axios
      .get(`${API}/insurance/history`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res =>
        setState({
          loading: false,
          error: false,
          current: res.data.current,
          payments: res.data.payments || []
        })
      )
      .catch(err => {
        console.error("History fetch error:", err);
        setState({ loading: false, error: true, current: null, payments: [] });
      });
  }, []);

  async function copy(id) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {
      window.prompt("Copy this payment ID:", id);
    }
  }

  const { loading, error, current, payments } = state;

  return (
    <div className="zx-card zx-rise" style={{ "--i": 4, marginTop: 18, marginBottom: 18 }}>
      <div className="zx-card-head">
        <div>
          <h3 className="zx-card-title">Plan and payments</h3>
          <p className="zx-card-sub">Your current plan and recent Razorpay payments.</p>
        </div>
      </div>

      {loading && <p className="zx-card-sub">Loading...</p>}
      {error && <p className="zx-card-sub">Could not load plan details. Refresh to try again.</p>}

      {!loading && !error && (
        <>
          {current ? (
            <div className="zx-kpis zx-kpis-3">
              <div className="zx-kpi">
                <p className="zx-kpi-label">Plan</p>
                <p className="zx-kpi-value">{current.plan}</p>
                <p className="zx-kpi-sub">{current.active ? "Active" : "Expired"}</p>
              </div>
              <div className="zx-kpi">
                <p className="zx-kpi-label">Price / Cover</p>
                <p className="zx-kpi-value">₹{current.premium}</p>
                <p className="zx-kpi-sub">Cover up to ₹{current.coverage}</p>
              </div>
              <div className="zx-kpi">
                <p className="zx-kpi-label">{current.active ? "Active until" : "Ended on"}</p>
                <p className="zx-kpi-value" style={{ fontSize: 16 }}>{fmtDate(current.active_until)}</p>
                <p className="zx-kpi-sub">Renew after this date</p>
              </div>
            </div>
          ) : (
            <p className="zx-card-sub">No plan yet. Choose one on the Policy page.</p>
          )}

          <h4 className="zx-section">Recent payments</h4>

          {payments.length === 0 ? (
            <p className="zx-card-sub">No verified payments yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th style={{ padding: "8px 6px" }}>Date</th>
                    <th style={{ padding: "8px 6px" }}>Plan</th>
                    <th style={{ padding: "8px 6px" }}>Amount</th>
                    <th style={{ padding: "8px 6px" }}>Payment ID</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.order_id} style={{ borderTop: "1px solid rgba(128,128,128,.25)" }}>
                      <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{fmtDate(p.date)}</td>
                      <td style={{ padding: "8px 6px" }}>{p.plan}</td>
                      <td style={{ padding: "8px 6px" }}>₹{p.amount}</td>
                      <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                        <code>{p.payment_id || "—"}</code>{" "}
                        {p.payment_id && (
                          <button className="zx-btn" style={{ padding: "2px 10px" }} onClick={() => copy(p.payment_id)}>
                            {copied === p.payment_id ? "Copied" : "Copy"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ProfilePlans;
