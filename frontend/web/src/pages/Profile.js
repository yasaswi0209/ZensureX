import { useState, useEffect, useContext } from "react";
import axios from "axios";
import { AppContext } from "../utils/AppContext";
import PasswordModal from "../components/PasswordModal";
import ProfilePlans from "../components/ProfilePlans"; // NEW
import "../styles/zensurex-ui.css";

const API = process.env.REACT_APP_API_URL || "https://zensurex-backend.onrender.com";

const PLATFORMS = ["Swiggy", "Zomato", "Uber", "Ola", "Rapido", "Zepto", "Blinkit", "Amazon", "Dunzo"];

const EMPTY = {
  name: "",
  email: "",
  platform: "",
  location: "",
  weekly_income: "",
  phone: "",
  bank_name: "",
  upi_id: ""
};

function validate(d) {
  const e = {};
  if (!d.name.trim()) e.name = "Enter your name.";
  if (d.phone && !/^[6-9]\d{9}$/.test(String(d.phone).replace(/\s/g, ""))) {
    e.phone = "Enter a 10 digit mobile number.";
  }
  if (d.weekly_income !== "" && (isNaN(Number(d.weekly_income)) || Number(d.weekly_income) < 0)) {
    e.weekly_income = "Enter a valid amount.";
  }
  if (d.upi_id && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(d.upi_id.trim())) {
    e.upi_id = "Use the format name@bank.";
  }
  return e;
}

function Profile() {

  const { plan, premium } = useContext(AppContext);

  const [edit, setEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(EMPTY);
  const [saved, setSaved] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const token = localStorage.getItem("token");

  function flash(message, type = "ok") {
    setNotice({ message, type });
    setTimeout(() => setNotice(null), 3500);
  }

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await axios.get(`${API}/settings/profile/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const profile = {
          name: res.data.name || "",
          email: res.data.email || "",
          platform: res.data.platform || "",
          location: res.data.location || "",
          weekly_income: res.data.weekly_income ?? "",
          phone: res.data.phone || "",
          bank_name: res.data.bank_name || "",
          upi_id: res.data.upi_id || ""
        };

        setData(profile);
        setSaved(profile);

        // keep the navbar and other pages in sync
        localStorage.setItem("user", JSON.stringify(profile));
        localStorage.setItem("city", profile.location);
      } catch (err) {
        console.error("Profile fetch error:", err);
        flash("Could not load your profile. Refresh to try again.", "error");
      } finally {
        setLoading(false);
      }
    }

    if (token) fetchProfile();
    else setLoading(false);
  }, [token]);

  function set(field, value) {
    setData(d => ({ ...d, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }));
  }

  async function save() {
    const found = validate(data);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      await axios.put(`${API}/settings/profile/update`, data, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSaved(data);
      localStorage.setItem("user", JSON.stringify(data));
      localStorage.setItem("city", data.location);

      setEdit(false);
      flash("Profile updated ✅");
    } catch (err) {
      console.error("Update error:", err);
      flash(err.response?.data?.detail || "Update failed. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setData(saved);
    setErrors({});
    setEdit(false);
  }

  // Profile completeness: payouts need a UPI id, so it counts
  const tracked = ["name", "email", "platform", "location", "weekly_income", "phone", "bank_name", "upi_id"];
  const filled = tracked.filter(k => String(saved[k] ?? "").trim() !== "").length;
  const percent = Math.round((filled / tracked.length) * 100);
  const missing = tracked.filter(k => String(saved[k] ?? "").trim() === "");

  const firstLetter = (saved.name || "?").charAt(0).toUpperCase();

  // Called as a function (not used as a component) so inputs keep focus while typing
  function field({ label, name, type = "text", disabled, list, placeholder, full }) {
    return (
      <div className={`zx-field ${full ? "full" : ""}`} key={name}>
        <label htmlFor={`pf-${name}`}>{label}</label>
        <input
          id={`pf-${name}`}
          type={type}
          list={list}
          value={data[name]}
          placeholder={placeholder}
          disabled={disabled ?? !edit}
          className={errors[name] ? "bad" : ""}
          onChange={e => set(name, e.target.value)}
        />
        {errors[name] && <span className="zx-error">{errors[name]}</span>}
      </div>
    );
  }

  if (loading) {
    return (
      <section className="scene active">
        <div className="zx-page">
          <span className="zx-skel" style={{ width: "100%", height: 180, borderRadius: 24 }} />
          <div style={{ height: 18 }} />
          <span className="zx-skel" style={{ width: "100%", height: 360, borderRadius: 18 }} />
        </div>
      </section>
    );
  }

  return (
    <section className="scene active">
      <div className="zx-page" style={{ paddingTop: 96 }}>

        {notice && (
          <div className={`zx-banner ${notice.type === "error" ? "zx-banner-danger" : ""}`}>
            <span>{notice.type === "error" ? "⚠️" : "✅"}</span>
            <span>{notice.message}</span>
          </div>
        )}

        {/* HERO */}
        <div className="zx-profile-hero zx-rise" style={{ "--i": 0 }}>
          <div className="zx-pavatar">{firstLetter}</div>
          <div className="zx-profile-info">
            <h1>{saved.name || "Your profile"}</h1>
            <p>{saved.email}</p>
            <div className="zx-chips" style={{ marginTop: 10 }}>
              {saved.platform && <span className="zx-chip">🛵 {saved.platform}</span>}
              {saved.location && <span className="zx-chip">📍 {saved.location}</span>}
              <span className="zx-chip">🛡 {plan || "No active plan"}</span>
            </div>
          </div>

          <div className="zx-complete">
            <div className="zx-complete-top">
              <span>Profile complete</span>
              <b>{percent}%</b>
            </div>
            <div className="zx-bar" style={{ background: "rgba(255,255,255,.25)", height: 8 }}>
              <div className="zx-bar-fill" style={{ width: `${percent}%`, background: "#4ade80" }} />
            </div>
            <p>
              {percent === 100
                ? "All set. Payouts can reach you."
                : missing.includes("upi_id")
                ? "Add your UPI ID so payouts can reach you."
                : "Add the missing details to finish."}
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div className="zx-kpis zx-kpis-3" style={{ marginTop: 18 }}>
          <div className="zx-kpi zx-rise" style={{ "--i": 1 }}>
            <p className="zx-kpi-label">📋 Active plan</p>
            <p className="zx-kpi-value">{plan || "No plan"}</p>
            <p className="zx-kpi-sub">{plan ? "Currently covered" : "Choose a plan on the Policy page"}</p>
          </div>
          <div className="zx-kpi zx-rise" style={{ "--i": 2 }}>
            <p className="zx-kpi-label">💰 Weekly premium</p>
            <p className="zx-kpi-value">₹{premium || 0}</p>
            <p className="zx-kpi-sub">Charged every week</p>
          </div>
          <div className="zx-kpi zx-rise" style={{ "--i": 3 }}>
            <p className="zx-kpi-label">📈 Weekly income</p>
            <p className="zx-kpi-value">{saved.weekly_income !== "" ? `₹${Number(saved.weekly_income).toLocaleString("en-IN")}` : "Not set"}</p>
            <p className="zx-kpi-sub">Used to size your cover</p>
          </div>
        </div>

        {/* NEW: plan and payment history */}
        <ProfilePlans />

        {/* FORM */}
        <div className="zx-card zx-rise" style={{ "--i": 4 }}>

          <div className="zx-card-head">
            <div>
              <h3 className="zx-card-title">Your details</h3>
              <p className="zx-card-sub">{edit ? "Make your changes, then save." : "Select Edit profile to change anything."}</p>
            </div>
            {!edit && (
              <button className="zx-btn zx-btn-primary" onClick={() => setEdit(true)}>Edit profile</button>
            )}
          </div>

          <h4 className="zx-section">Personal</h4>
          <div className="zx-form-grid">
            {field({ label: "Full name", name: "name" })}
            {field({ label: "Email", name: "email", disabled: true })}
            {field({ label: "Mobile number", name: "phone", type: "tel", placeholder: "10 digit number" })}
          </div>

          <h4 className="zx-section">Work</h4>
          <div className="zx-form-grid">
            {field({ label: "Delivery platform", name: "platform", list: "zx-platforms", placeholder: "Swiggy, Zomato..." })}
            <datalist id="zx-platforms">
              {PLATFORMS.map(p => <option key={p} value={p} />)}
            </datalist>
            {field({ label: "City or area", name: "location" })}
            {field({ label: "Weekly income (₹)", name: "weekly_income", type: "number" })}
          </div>

          <h4 className="zx-section">Payout details</h4>
          <div className="zx-form-grid">
            {field({ label: "Bank name", name: "bank_name" })}
            {field({ label: "UPI ID", name: "upi_id", placeholder: "name@bank" })}
          </div>

          {edit && (
            <div className="zx-actions">
              <button className="zx-btn" onClick={cancel} disabled={saving}>Cancel</button>
              <button className="zx-btn zx-btn-primary" onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          )}

        </div>

        {/* SECURITY */}
        <div className="zx-card zx-rise" style={{ "--i": 5, marginTop: 18 }}>
          <div className="zx-card-head" style={{ marginBottom: 0 }}>
            <div>
              <h3 className="zx-card-title">Security</h3>
              <p className="zx-card-sub">Keep your account safe with a strong password.</p>
            </div>
            <button className="zx-btn" onClick={() => setShowPassword(true)}>Change password</button>
          </div>
        </div>

        {showPassword && <PasswordModal onClose={() => setShowPassword(false)} />}

      </div>
    </section>
  );
}

export default Profile;
