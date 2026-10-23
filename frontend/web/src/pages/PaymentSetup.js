import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";

function PaymentSetup(){

  const navigate = useNavigate();

  const [phone, setPhone] = useState("");
  const [upi, setUpi] = useState("");
  const [bank, setBank] = useState("");

  const [otp, setOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [verified, setVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [timer, setTimer] = useState(0);

  const [message, setMessage] = useState("");
  const [type, setType] = useState("");

  function showMessage(msg, t="success"){
    setMessage(msg);
    setType(t);

    setTimeout(() => {
      setMessage("");
    }, 3000);
  }

  // ⏱ TIMER
  useState(() => {
    if(timer > 0){
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  // 📲 SEND OTP
  function sendOtp(){
    if(phone.length !== 10){
      showMessage("Enter valid 10-digit number","error");
      return;
    }

    const fakeOtp = Math.floor(1000 + Math.random() * 9000).toString();

    setGeneratedOtp(fakeOtp);
    setOtpSent(true);
    setVerified(false);
    setTimer(30);

    showMessage("OTP sent successfully ✅");
  }

  // 🔁 RESEND
  function resendOtp(){
    if(timer > 0) return;
    sendOtp();
  }

  // ✅ VERIFY
  function verifyOtp(){
    if(otp.length !== 4){
      showMessage("Enter valid OTP","error");
      return;
    }

    if(otp === generatedOtp){
      setVerified(true);
      showMessage("Phone verified successfully 🎉");
    }else{
      showMessage("Invalid OTP ❌","error");
    }
  }

  function maskedPhone(){
    return phone.slice(0,2) + "******" + phone.slice(-2);
  }

  // 💾 SAVE TO DB (MAIN LOGIC)
 async function handleSave() {
  try {
    const token = localStorage.getItem("token");

    if (!token) {
      showMessage("Session expired. Please login again", "error");
      return;
    }

    await axios.post(
      "https://zensurex-backend.onrender.com/settings/save",
      {
        phone,
        upi,
        bank
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    // ✅ SHOW SUCCESS MESSAGE IN UI
    showMessage("Payment details saved successfully 🎉");

    // ✅ REDIRECT AFTER 1.5s
    setTimeout(() => {
      navigate("/dashboard");
    }, 1500);

  } catch (err) {
    console.error(err);

    // ✅ SHOW ERROR IN UI (NO ALERT)
    showMessage("Failed to save ❌", "error");
  }
}

  return(

    <section className="auth-page">

      <div className="auth-container">

        <div className="auth-left">
          <h1>Setup your payouts 💸</h1>
        </div>

        <motion.div className="auth-box">

          <h2>Step 2: Payment Setup</h2>

          {/* MESSAGE */}
          {message && (
            <motion.div
              initial={{opacity:0,y:-10}}
              animate={{opacity:1,y:0}}
              className={`msg ${type}`}
              style={{
                marginBottom:"10px",
                padding:"8px",
                borderRadius:"8px",
                background: type==="error" ? "#fee2e2" : "#dcfce7",
                color: type==="error" ? "#b91c1c" : "#166534"
              }}
            >
              {message}
            </motion.div>
          )}

          {/* PHONE + OTP */}
          {!verified ? (
            <>
              <input
                className="input"
                placeholder="Phone Number"
                value={phone}
                onChange={(e)=>{
                  const val = e.target.value.replace(/\D/g,"");
                  if(val.length<=10) setPhone(val);
                }}
              />

              {phone.length === 10 && !otpSent && (
                <button className="btn" onClick={sendOtp}>
                  Send OTP
                </button>
              )}

              {otpSent && (
                <p style={{ color: "blue" }}>
                  Demo OTP: {generatedOtp}
                </p>
              )}

              {otpSent && (
                <input
                  className="input"
                  placeholder="Enter OTP"
                  value={otp}
                  onChange={(e)=>setOtp(e.target.value)}
                />
              )}

              {otpSent && otp.length===4 && (
                <button className="btn" onClick={verifyOtp}>
                  Verify OTP
                </button>
              )}

              {otpSent && (
                <p>
                  {timer>0
                    ? `Resend in ${timer}s`
                    : <span onClick={resendOtp}>Resend OTP</span>}
                </p>
              )}
            </>
          ) : (
            <p style={{color:"green"}}>
              ✔ Verified: {maskedPhone()}
            </p>
          )}

          {/* BANK + UPI */}
          <input
            className="input"
            placeholder="Bank Name"
            value={bank}
            onChange={(e)=>setBank(e.target.value)}
          />

          <input
            className="input"
            placeholder="UPI ID"
            value={upi}
            onChange={(e)=>setUpi(e.target.value)}
          />

          {verified && (
            <button className="btn-primary" onClick={handleSave}>
              Complete Setup 🚀
            </button>
          )}

        </motion.div>

      </div>

    </section>
  );
}

export default PaymentSetup;