import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../pages/AuthContext";

const BASE_URL = "https://zensurex-backend.onrender.com";

function Login() {

  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {

    if (!email || !password) {
      setMessage("Please enter email and password ❌");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      // 🔥 Prepare form data
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      // 🔥 Login API
      const res = await axios.post(
        `${BASE_URL}/auth/login`,
        formData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      // 🚨 Token safety check
      if (!res.data.access_token) {
        setMessage("Login failed ❌");
        return;
      }

      let userData = { name: "User", email };

      // 🔥 Fetch real user data (safe)
      try {
        const userRes = await axios.get(
          `${BASE_URL}/auth/me`,
          {
            headers: {
              Authorization: `Bearer ${res.data.access_token}`
            }
          }
        );
        userData = userRes.data;
      } catch {
        console.warn("User fetch failed, using fallback");
      }

      // 🔥 Save in context
      login(userData, res.data.access_token);

      // ✅ Success message
      setMessage("Login successful 🎉");

      // 🚀 Redirect
      setTimeout(() => {
        navigate("/dashboard");
      }, 800);

    } catch (err) {
      setMessage("Invalid credentials ❌");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-container">

        {/* LEFT */}
        <div className="auth-left">
          <h1>Protect your income with AI</h1>
          <p>
            Insurance built for delivery workers.
            Instant protection against disruption.
          </p>

          <img
            src="https://cdn-icons-png.flaticon.com/512/2972/2972185.png"
            alt="bike"
          />
        </div>

        {/* RIGHT */}
        <motion.div
          className="auth-box"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >

          <h2 className="auth-title">Welcome Back</h2>
          <p className="muted">Login to continue</p>

          {/* 🔥 MESSAGE */}
          {message && (
            <div style={{
              background: message.includes("successful") ? "#e6ffe6" : "#ffe6e6",
              color: message.includes("successful") ? "#2e7d32" : "#d8000c",
              padding: "10px",
              borderRadius: "6px",
              marginBottom: "10px",
              textAlign: "center"
            }}>
              {message}
            </div>
          )}

          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />

          <button
            className="btn-primary"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          {/* 🆕 FORGOT PASSWORD */}
          <p className="muted">
            <span
              className="link"
              onClick={() => navigate("/forgot-password")}
            >
              Forgot password?
            </span>
          </p>

          <p className="muted">
            New user?{" "}
            <span
              className="link"
              onClick={() => navigate("/signup")}
            >
              Create account
            </span>
          </p>

        </motion.div>

      </div>
    </section>
  );
}

export default Login;
