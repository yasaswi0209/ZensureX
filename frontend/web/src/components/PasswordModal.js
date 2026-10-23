import { useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "https://zensurex-backend.onrender.com";

// ASSUMPTION: change this path and the two field names below to match your backend route.
const CHANGE_PASSWORD_URL = `${API}/settings/profile/password`;

export default function PasswordModal({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    if (!current) return setError("Enter your current password.");
    if (next.length < 6) return setError("The new password must be at least 6 characters.");
    if (next !== confirm) return setError("The new passwords do not match.");

    setBusy(true);
    try {
      await axios.put(
        CHANGE_PASSWORD_URL,
        { current_password: current, new_password: next },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      setDone(true);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404 || status === 405) {
        setError("Password change is not available on the server yet.");
      } else {
        setError(err.response?.data?.detail || "Could not change the password. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="zx-modal-back" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="zx-modal" role="dialog" aria-label="Change password">

        {done ? (
          <>
            <h3 className="zx-card-title">Password changed ✅</h3>
            <p className="zx-muted" style={{ margin: "8px 0 16px" }}>Use your new password the next time you log in.</p>
            <button className="zx-btn zx-btn-primary" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <h3 className="zx-card-title">Change password</h3>

            <div className="zx-field">
              <label>Current password</label>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="zx-field">
              <label>New password</label>
              <input type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="zx-field">
              <label>Confirm new password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>

            {error && <p className="zx-error">{error}</p>}

            <div className="zx-actions">
              <button className="zx-btn" onClick={onClose}>Cancel</button>
              <button className="zx-btn zx-btn-primary" onClick={submit} disabled={busy}>
                {busy ? "Saving..." : "Update password"}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
