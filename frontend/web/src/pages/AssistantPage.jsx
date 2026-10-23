import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import useLiveRisk, { API_BASE } from "../components/useLiveRisk";
import { QUICK, answer, Robot } from "../components/Assistant";
import "../styles/zensurex-ui.css";
import "../styles/zensurex-extra.css";

// Use the SAME endpoint your Dashboard calls to get `pool`
// (plan, premium, coverage, zone_label, member_count, balance, locked_until).
const POOL_ENDPOINT = "/pool/me";

export default function AssistantPage() {
  const navigate = useNavigate();
  const { data } = useLiveRisk();
  const [pool, setPool] = useState(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const endRef = useRef(null);

  const token = localStorage.getItem("token");
  let userName = "";
  try {
    userName = JSON.parse(localStorage.getItem("user"))?.name || "";
  } catch (e) {
    userName = "";
  }

  const [messages, setMessages] = useState([
    {
      from: "bot",
      text: `Hi${userName ? ` ${userName}` : ""}! I am your ZensureX assistant. Ask me anything about your cover, the weather or payouts.`
    }
  ]);

  useEffect(() => {
    axios
      .get(`${API_BASE}${POOL_ENDPOINT}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setPool(res.data))
      .catch(() => setPool(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  function ask(question) {
    const q = question.trim();
    if (!q || typing) return;
    setMessages(m => [...m, { from: "me", text: q }]);
    setText("");
    setTyping(true);
    setTimeout(() => {
      setMessages(m => [...m, { from: "bot", ...answer(q, { data, pool, userName }) }]);
      setTyping(false);
    }, 500);
  }

  return (
    <section className="scene active">
      <div className="zx-page" style={{ paddingTop: 96 }}>
        <div className="zx-assist">

          <div className="zx-assist-head">
            <Robot />
            <div style={{ flex: 1 }}>
              <h1>ZensureX assistant</h1>
              <p>Answers come from your live weather, plan and pool data.</p>
            </div>
            <button className="zx-btn" onClick={() => navigate("/dashboard")}>Back to dashboard</button>
          </div>

          <div className="zx-chat-body">
            {messages.map((m, i) => (
              <div key={i} className={`zx-msg ${m.from}`}>
                <p>{m.text}</p>
                {m.action && (
                  <button className="zx-msg-action" onClick={() => navigate(m.action.to)}>
                    {m.action.label}
                  </button>
                )}
              </div>
            ))}
            {typing && (
              <div className="zx-msg bot">
                <p className="zx-typing"><span /><span /><span /></p>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="zx-qchips">
            {QUICK.map(s => (
              <button key={s} className="zx-qchip" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>

          <div className="zx-chat-input">
            <input
              value={text}
              placeholder="Ask a question"
              aria-label="Ask a question"
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && ask(text)}
              autoFocus
            />
            <button onClick={() => ask(text)} disabled={!text.trim() || typing}>Send</button>
          </div>

        </div>
      </div>
    </section>
  );
}
