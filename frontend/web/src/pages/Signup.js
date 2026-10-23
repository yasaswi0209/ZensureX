import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = "https://zensurex-backend.onrender.com";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Signup(){

  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");

  const [platform,setPlatform] = useState("");
  const [location,setLocation] = useState("");
  const [income,setIncome] = useState("");

  const [emailError, setEmailError] = useState("");
  const [checking, setChecking] = useState(false);

  // Returns true if the email is valid and not already registered
  async function checkEmail(){
    const value = email.trim().toLowerCase();
    if(!value) return false;

    if(!EMAIL_REGEX.test(value)){
      setEmailError("Enter a valid email address ❌");
      return false;
    }

    try{
      setChecking(true);
      const res = await axios.get(`${API}/auth/check-email`, {
        params: { email: value }
      });

      if(res.data.exists){
        setEmailError("This email is already registered ❌");
        return false;
      }

      setEmailError("");
      return true;

    }catch(err){
      // If the check itself fails, don't block signup. The backend checks again.
      setEmailError("");
      return true;
    }finally{
      setChecking(false);
    }
  }

  async function handleSignup(){

    if(!name || !email || !password || !platform || !location || !income){
      setMessage("Please fill all fields ❌");
      return;
    }

    if(password.length < 6){
      setMessage("Password must be at least 6 characters ❌");
      return;
    }

    const emailOk = await checkEmail();
    if(!emailOk){
      setMessage("Please fix the email ❌");
      return;
    }

    try{

      await axios.post(`${API}/auth/signup`, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        platform,
        location: location.trim(),
        weekly_income: Number(income)
      });

      // ✅ SUCCESS MESSAGE
      setMessage("Signup Successful 🎉");

      // 🔥 REDIRECT AFTER DELAY
      setTimeout(() => {
        navigate("/login");
      }, 1500);

    }catch(err){
      console.error("Signup error:", err);

      if(err.response){
        const detail = err.response.data?.detail;
        setMessage(
          typeof detail === "string" ? `${detail} ❌` : "Signup failed ❌"
        );
      }else{
        setMessage("Server not reachable ❌");
      }
    }

  }

  return(

    <section className="auth-page">

      <div className="auth-container">

        {/* LEFT */}
        <div className="auth-left">

          <h1>
            Start protecting your income today
          </h1>

          <p>
            AI powered insurance for gig workers.
            Instant protection against disruption.
          </p>

          <img
            src="https://cdn-icons-png.flaticon.com/512/2972/2972185.png"
            alt="bike"
          />

        </div>

        {/* RIGHT */}
        <motion.form
          className="auth-box"
          initial={{opacity:0, y:20}}
          animate={{opacity:1, y:0}}
          onSubmit={(e)=>{
            e.preventDefault();
            handleSignup();
          }}
        >

          <h2 className="auth-title">
            Create Account
          </h2>

          <p className="muted">
            Join GigShield AI protection
          </p>

          <input
            className="input"
            placeholder="Full Name"
            value={name}
            onChange={(e)=>setName(e.target.value)}
          />

          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e)=>{
              setEmail(e.target.value);
              setEmailError("");
              setMessage("");
            }}
            onBlur={checkEmail}
            style={emailError ? { borderColor: "#d8000c" } : undefined}
          />

          {checking && (
            <p style={{ fontSize: "13px", margin: "-6px 0 8px" }} className="muted">
              Checking email...
            </p>
          )}

          {emailError && (
            <p style={{ color: "#d8000c", fontSize: "13px", margin: "-6px 0 8px" }}>
              {emailError}
            </p>
          )}

          <input
            className="input"
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
          />

          <select
            className="input"
            value={platform}
            onChange={(e)=>setPlatform(e.target.value)}
          >
            <option value="">Select Platform</option>
            <option value="Zomato">Zomato</option>
            <option value="Swiggy">Swiggy</option>
          </select>

          <input
            className="input"
            placeholder="Work Location (City)"
            value={location}
            onChange={(e)=>setLocation(e.target.value)}
          />

          <input
            className="input"
            type="number"
            placeholder="Weekly Income (₹)"
            value={income}
            onChange={(e)=>setIncome(e.target.value)}
          />

          {message && (
            <div style={{
              background: message.includes("Successful") ? "#e6ffe6" : "#ffe6e6",
              color: message.includes("Successful") ? "#2e7d32" : "#d8000c",
              padding: "10px",
              borderRadius: "6px",
              marginBottom: "10px",
              textAlign: "center"
            }}>
              {message}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={checking}>
            Signup
          </button>

          <p className="muted">
            Already have account?

            <span
              className="link"
              onClick={()=>navigate("/login")}
            >
              Login
            </span>

          </p>

        </motion.form>

      </div>

    </section>

  );

}

export default Signup;
