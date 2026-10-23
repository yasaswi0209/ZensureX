import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const BASE_URL = "https://zensurex-backend.onrender.com";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function ForgotPassword() {

  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isSuccess = message.includes("successful") || message.includes("sent");

  async function sendCode() {
    const value = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(value)) {
      setMessage("Enter a valid email address ❌");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      await axios.post(`${BASE_URL}/auth/forgot-password`, { email: value });

      setEmail(value);
      setStep(2);
      setMessage("Code sent. Check your inbox 📧");

    } catch (err) {
      const detail = err.response?.data?.detail;
      setMessage(typeof detail === "string" ? `${detail} ❌` : "Server not reachable ❌");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {

    if (otp.trim().length !== 6) {
      setMessage("Enter the 6-digit code ❌");
      return;
    }

    if (newPassword.length < 6) {
      setMessage("Password must be at least 6 characters ❌");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match ❌");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      await axios.post(`${BASE_URL}/auth/reset-password`, {
        email,
        otp: otp.trim(),
        new_password: newPassword
      });

      setMessage("Password reset successful 🎉");

      setTimeout(() => {
        navigate("/login");
      }, 1500);

    } catch (err) {
      const detail = err.response?.data?.detail;
      setMessage(typeof detail === "string" ? `${detail} ❌` : "Reset failed ❌");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-container">

        {/* LEFT */}
        <div className="auth-left">
          <h1>Forgot your password?</h1>
          <p>
            No worries. We'll email you a code
            so you can get back to protecting your income.
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

          <h2 className="auth-title">Reset Password</h2>
          <p className="muted">
            {step === 1
              ? "Enter your registered email"
              : `Enter the code sent to ${email}`}
          </p>

          {message && (
            <div style={{
              background: isSuccess ? "#e6ffe6" : "#ffe6e6",
              color: isSuccess ? "#2e7d32" : "#d8000c",
              padding: "10px",
              borderRadius: "6px",
              marginBottom: "10px",
              textAlign: "center"
            }}>
              {message}
            </div>
          )}

          {step === 1 && (
            <>
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <button
                className="btn-primary"
                onClick={sendCode}
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Code"}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <input
                className="input"
                placeholder="6-digit code"
                maxLength={6}
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              />

              <input
                className="input"
                type="password"
                placeholder="New password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />

              <input
                className="input"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              <button
                className="btn-primary"
                onClick={resetPassword}
                disabled={loading}
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>

              <p className="muted">
                Didn't get it?{" "}
                <span
                  className="link"
                  onClick={() => { setStep(1); setOtp(""); setMessage(""); }}
                >
                  Resend code
                </span>
              </p>
            </>
          )}

          <p className="muted">
            Remember your password?{" "}
            <span
              className="link"
              onClick={() => navigate("/login")}
            >
              Back to login
            </span>
          </p>

        </motion.div>

      </div>
    </section>
  );
}

export default ForgotPassword;
