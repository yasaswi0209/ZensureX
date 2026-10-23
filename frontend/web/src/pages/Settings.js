import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PasswordModal from "../components/PasswordModal";
import "../styles/zensurex-ui.css";

const NOTIFY_KEY = "zx_notify";
const DEFAULT_NOTIFY = { risk: true, weekly: true, offers: false };

function readNotify() {
  try {
    return { ...DEFAULT_NOTIFY, ...JSON.parse(localStorage.getItem(NOTIFY_KEY)) };
  } catch (e) {
    return DEFAULT_NOTIFY;
  }
}

function Switch({ checked, onChange, label }) {
  return (
    <label className="zx-switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

function Settings() {

  const navigate = useNavigate();

  const [dark, setDark] = useState(
    localStorage.getItem("theme") === "dark" || document.body.classList.contains("dark")
  );
  const [notify, setNotify] = useState(readNotify);
  const [showPassword, setShowPassword] = useState(false);
  const [location, setLocation] = useState("checking");
  const [savedNote, setSavedNote] = useState(false);

  // real location permission, so the user knows why the pin may be approximate
  useEffect(() => {
    if (!navigator.permissions?.query) {
      setLocation("unknown");
      return undefined;
    }
    let status;
    navigator.permissions
      .query({ name: "geolocation" })
      .then(s => {
        status = s;
        setLocation(s.state);
        s.onchange = () => setLocation(s.state);
      })
      .catch(() => setLocation("unknown"));
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  function applyTheme(next) {
    setDark(next);
    document.body.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  function updateNotify(key, value) {
    const next = { ...notify, [key]: value };
    setNotify(next);
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 1800);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("city");
    navigate("/login");
  }

  const locationText = {
    granted: { label: "Allowed", tone: "ok", hint: "Your map pin and live weather use your exact position." },
    prompt: { label: "Not asked yet", tone: "warn", hint: "Your browser will ask when a page needs your location." },
    denied: { label: "Blocked", tone: "bad", hint: "Allow location in your browser's site settings for an exact pin. Until then the saved city is used." },
    checking: { label: "Checking", tone: "warn", hint: "" },
    unknown: { label: "Unknown", tone: "warn", hint: "Your browser does not report this. The saved city is used as a fallback." }
  }[location];

  return (
    <section className="scene active">
      <div className="zx-page" style={{ paddingTop: 96 }}>

        <div className="zx-rise" style={{ "--i": 0, marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.02em", margin: 0 }}>Settings</h1>
          <p className="zx-muted" style={{ marginTop: 4, fontSize: 14 }}>Manage how ZensureX looks and what it tells you.</p>
        </div>

        <div className="zx-settings-grid">

          {/* APPEARANCE */}
          <div className="zx-card zx-rise" style={{ "--i": 1 }}>
            <div className="zx-card-head">
              <div>
                <h3 className="zx-card-title">🎨 Appearance</h3>
                <p className="zx-card-sub">Choose how the app looks on this device.</p>
              </div>
            </div>
            <div className="zx-theme-row">
              <button className={`zx-theme-tile light ${!dark ? "on" : ""}`} onClick={() => applyTheme(false)}>
                <span className="zx-theme-preview"><i /><i /><i /></span>
                Light
              </button>
              <button className={`zx-theme-tile dark ${dark ? "on" : ""}`} onClick={() => applyTheme(true)}>
                <span className="zx-theme-preview"><i /><i /><i /></span>
                Dark
              </button>
            </div>
          </div>

          {/* NOTIFICATIONS */}
          <div className="zx-card zx-rise" style={{ "--i": 2 }}>
            <div className="zx-card-head">
              <div>
                <h3 className="zx-card-title">🔔 Notifications</h3>
                <p className="zx-card-sub">
                  {savedNote ? "Saved on this device ✅" : "Saved on this device."}
                </p>
              </div>
            </div>

            <div className="zx-setting-row">
              <div>
                <b>Risk alerts</b>
                <span>Warn me when risk rises in my area</span>
              </div>
              <Switch label="Risk alerts" checked={notify.risk} onChange={v => updateNotify("risk", v)} />
            </div>
            <div className="zx-setting-row">
              <div>
                <b>Weekly report</b>
                <span>A summary of my cover and payouts</span>
              </div>
              <Switch label="Weekly report" checked={notify.weekly} onChange={v => updateNotify("weekly", v)} />
            </div>
            <div className="zx-setting-row">
              <div>
                <b>Offers and updates</b>
                <span>News about plans and new features</span>
              </div>
              <Switch label="Offers and updates" checked={notify.offers} onChange={v => updateNotify("offers", v)} />
            </div>
          </div>

          {/* LOCATION */}
          <div className="zx-card zx-rise" style={{ "--i": 3 }}>
            <div className="zx-card-head">
              <div>
                <h3 className="zx-card-title">📍 Location access</h3>
                <p className="zx-card-sub">Used for live weather and your map pin.</p>
              </div>
              <span className={`zx-status zx-tone-${locationText.tone}`}>{locationText.label}</span>
            </div>
            <p className="zx-muted" style={{ fontSize: 13.5 }}>{locationText.hint}</p>
          </div>

          {/* ACCOUNT */}
          <div className="zx-card zx-rise" style={{ "--i": 4 }}>
            <div className="zx-card-head">
              <div>
                <h3 className="zx-card-title">🔒 Account</h3>
                <p className="zx-card-sub">Your profile, password and session.</p>
              </div>
            </div>
            <div className="zx-btn-stack">
              <button className="zx-btn" onClick={() => navigate("/profile")}>View profile</button>
              <button className="zx-btn" onClick={() => setShowPassword(true)}>Change password</button>
              <button className="zx-btn zx-btn-danger" onClick={logout}>Log out</button>
            </div>
          </div>

          {/* SUPPORT */}
          <div className="zx-card zx-rise" style={{ "--i": 5 }}>
            <div className="zx-card-head">
              <div>
                <h3 className="zx-card-title">💬 Support</h3>
                <p className="zx-card-sub">We reply within one working day.</p>
              </div>
            </div>
            <p style={{ fontSize: 14, margin: "0 0 4px" }}>Email: <a href="mailto:support@gigshield.ai">support@gigshield.ai</a></p>
            <p style={{ fontSize: 14, margin: "0 0 14px" }}>Phone: <a href="tel:+919876543210">+91 98765 43210</a></p>
            <a className="zx-btn" href="mailto:support@gigshield.ai?subject=ZensureX%20support">Contact support</a>
          </div>

          {/* ABOUT */}
          <div className="zx-card zx-rise" style={{ "--i": 6 }}>
            <div className="zx-card-head">
              <div>
                <h3 className="zx-card-title">📊 About ZensureX</h3>
                <p className="zx-card-sub">AI powered income protection for gig workers.</p>
              </div>
            </div>
            <div className="zx-setting-row" style={{ border: 0, padding: 0 }}>
              <div><b>Version</b></div>
              <span className="zx-plan">1.0</span>
            </div>
          </div>

        </div>

        {showPassword && <PasswordModal onClose={() => setShowPassword(false)} />}

      </div>
    </section>
  );
}

export default Settings;
