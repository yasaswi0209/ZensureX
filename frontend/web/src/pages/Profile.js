import { useState, useEffect, useContext } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { AppContext } from "../utils/AppContext";

function Profile() {

  const { plan, premium } = useContext(AppContext);

  const [edit, setEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const [data, setData] = useState({
    name: "",
    email: "",
    platform: "",
    location: "",
    weekly_income: "",
    phone: "",
    bank_name: "",
    upi_id: ""
  });

  const token = localStorage.getItem("token");

  // ✅ BASE URL (DEPLOY SAFE)
  const API = process.env.REACT_APP_API_URL || "https://zensurex-backend.onrender.com";

  // 🔥 FETCH PROFILE (FIXED ROUTE)
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await axios.get(
          `${API}/settings/profile/me`,   // ✅ FIXED
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const profileData = {
          name: res.data.name || "",
          email: res.data.email || "",
          platform: res.data.platform || "",
          location: res.data.location || "",
          weekly_income: res.data.weekly_income || "",
          phone: res.data.phone || "",
          bank_name: res.data.bank_name || "",
          upi_id: res.data.upi_id || ""
        };

        setData(profileData);

        // ✅ Sync for Navbar
        localStorage.setItem("user", JSON.stringify(profileData));
        localStorage.setItem("city", profileData.location);

      } catch (err) {
        console.error("Profile fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    if (token) fetchProfile();
  }, [token]);

  // 🔥 SAVE PROFILE (FIXED ROUTE)
  async function save() {
    try {
      await axios.put(
        `${API}/settings/profile/update`,   // ✅ FIXED
        data,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      localStorage.setItem("user", JSON.stringify(data));
      localStorage.setItem("city", data.location);

      alert("Profile Updated ✅");
      setEdit(false);

    } catch (err) {
      console.error("Update error:", err);
      alert("Update failed ❌");
    }
  }

  const firstLetter = data.name?.charAt(0)?.toUpperCase() || "?";

  if (loading) {
    return <p style={{ padding: "50px" }}>Loading profile...</p>;
  }

  return (
    <section className="scene active">
      <div className="scene-layout">

        <div style={{ marginTop: "110px" }}>
          <h2>My Profile</h2>
          <p className="muted">Manage your personal details</p>
        </div>

        <motion.div
          className="dashboard-panel glass profile-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >

          {/* avatar */}
          <div className="profile-avatar">
            {firstLetter}
          </div>

          <div className="profile-grid">

            <div>
              <label>Name</label>
              <input
                value={data.name}
                disabled={!edit}
                onChange={(e)=>setData({...data,name:e.target.value})}
              />
            </div>

            <div>
              <label>Email</label>
              <input value={data.email} disabled />
            </div>

            <div>
              <label>Platform</label>
              <input
                value={data.platform}
                disabled={!edit}
                onChange={(e)=>setData({...data,platform:e.target.value})}
              />
            </div>

            <div>
              <label>Location</label>
              <input
                value={data.location}
                disabled={!edit}
                onChange={(e)=>setData({...data,location:e.target.value})}
              />
            </div>

            <div>
              <label>Weekly Income</label>
              <input
                value={data.weekly_income}
                disabled={!edit}
                onChange={(e)=>setData({...data,weekly_income:e.target.value})}
              />
            </div>

            <div>
              <label>Mobile Number</label>
              <input
                value={data.phone}
                disabled={!edit}
                onChange={(e)=>setData({...data,phone:e.target.value})}
              />
            </div>

            <div>
              <label>Bank Name</label>
              <input
                value={data.bank_name}
                disabled={!edit}
                onChange={(e)=>setData({...data,bank_name:e.target.value})}
              />
            </div>

            <div>
              <label>UPI ID</label>
              <input
                value={data.upi_id}
                disabled={!edit}
                onChange={(e)=>setData({...data,upi_id:e.target.value})}
              />
            </div>

          </div>

          {/* buttons */}
          <div className="profile-actions">
            {edit ? (
              <button className="btn-primary" onClick={save}>
                Save Changes
              </button>
            ) : (
              <button className="btn-primary" onClick={()=>setEdit(true)}>
                Edit Profile
              </button>
            )}
          </div>

          {/* plan */}
          <div className="profile-plan glass">
            <h3>Active Plan</h3>
            <p>{plan || "No active plan"}</p>
            <p className="muted">
              Weekly Premium: ₹{premium || 0}
            </p>
          </div>

          {/* security */}
          <div className="profile-password glass">
            <h3>Security</h3>
            <button className="btn-secondary">
              Change Password
            </button>
          </div>

        </motion.div>
      </div>
    </section>
  );
}

export default Profile;