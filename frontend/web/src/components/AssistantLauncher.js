import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Robot } from "./Assistant";

// Small animated robot in the corner. Clicking it opens the /assistant page.
export default function AssistantLauncher() {
  const navigate = useNavigate();
  const [hint, setHint] = useState(false);

  // Wave hello once per session
  useEffect(() => {
    if (sessionStorage.getItem("zx_bot_hint")) return undefined;
    const show = setTimeout(() => setHint(true), 2500);
    const hide = setTimeout(() => setHint(false), 9000);
    sessionStorage.setItem("zx_bot_hint", "1");
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  return (
    <div className="zx-bot">
      {hint && <div className="zx-bot-hint">Hi! Need help? 👋</div>}
      <button
        className="zx-bot-btn"
        onClick={() => navigate("/assistant")}
        aria-label="Open assistant"
      >
        <Robot />
      </button>
    </div>
  );
}
