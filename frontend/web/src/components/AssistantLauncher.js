import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/*
  Floating assistant robot
  - Big white badge with a pulsing ring, so it is easy to see
  - Roams around the screen on its own every few seconds
  - Can be dragged anywhere; roaming pauses while you drag or hover
  - Click (without dragging) opens the full assistant page at /assistant
*/

const SIZE = 76;          // robot size in px
const EDGE = 12;          // gap kept from the screen edges
const TOP_SAFE = 80;      // stay below the navbar
const ROAM_EVERY = 5000;  // ms between automatic moves
const RESUME_AFTER_DRAG = 6000; // ms to wait after you drop it

function getBounds() {
  return {
    minX: EDGE,
    minY: TOP_SAFE,
    maxX: Math.max(EDGE, window.innerWidth - SIZE - EDGE),
    maxY: Math.max(TOP_SAFE, window.innerHeight - SIZE - EDGE),
  };
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

export default function AssistantLauncher() {
  const navigate = useNavigate();

  const [pos, setPos] = useState(() => {
    const b = getBounds();
    return { x: b.maxX, y: b.maxY - 10 };
  });
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);

  const drag = useRef(null);          // { px, py, x, y, moved }
  const hovering = useRef(false);
  const pauseUntil = useRef(0);
  const rootRef = useRef(null);

  // Automatic roaming
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return undefined;

    function roam() {
      if (drag.current || hovering.current || Date.now() < pauseUntil.current) return;
      const b = getBounds();
      setPos({
        x: b.minX + Math.random() * (b.maxX - b.minX),
        y: b.minY + Math.random() * (b.maxY - b.minY),
      });
    }

    const first = setTimeout(roam, 1500);
    const id = setInterval(roam, ROAM_EVERY);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // Keep it on screen when the window is resized
  useEffect(() => {
    function onResize() {
      const b = getBounds();
      setPos(p => ({ x: clamp(p.x, b.minX, b.maxX), y: clamp(p.y, b.minY, b.maxY) }));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onPointerDown(e) {
    // Freeze at the spot where the robot visually is right now
    const rect = rootRef.current.getBoundingClientRect();
    drag.current = { px: e.clientX, py: e.clientY, x: rect.left, y: rect.top, moved: false };
    setPos({ x: rect.left, y: rect.top });
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) > 5) d.moved = true;
    if (!d.moved) return;
    const b = getBounds();
    setPos({
      x: clamp(d.x + dx, EDGE, b.maxX),
      y: clamp(d.y + dy, EDGE, b.maxY),
    });
  }

  function onPointerUp(e) {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (d && !d.moved) {
      navigate("/assistant"); // a plain click opens the assistant
    } else {
      pauseUntil.current = Date.now() + RESUME_AFTER_DRAG;
    }
  }

  return (
    <>
      <style>{`
        .zxbot {
          position: fixed; top: 0; left: 0; z-index: 9000;
          width: ${SIZE}px; height: ${SIZE}px;
          cursor: grab; touch-action: none; user-select: none;
          transition: transform 4.5s ease-in-out;
          will-change: transform;
        }
        .zxbot.dragging { cursor: grabbing; transition: none; }

        .zxbot-badge {
          position: relative; width: 100%; height: 100%; border-radius: 50%;
          background: #ffffff;
          border: 3px solid #4f46e5;
          box-shadow: 0 10px 28px rgba(79, 70, 229, 0.45), 0 2px 6px rgba(15, 23, 42, 0.25);
          display: grid; place-items: center;
          animation: zxbot-bob 2.6s ease-in-out infinite;
        }
        .zxbot.dragging .zxbot-badge { animation: none; transform: scale(1.08); }

        .zxbot-ring {
          position: absolute; inset: -6px; border-radius: 50%;
          border: 3px solid rgba(79, 70, 229, 0.55);
          animation: zxbot-pulse 2s ease-out infinite;
          pointer-events: none;
        }

        .zxbot-label {
          position: absolute; right: 100%; top: 50%; transform: translateY(-50%);
          margin-right: 10px; white-space: nowrap;
          background: #4f46e5; color: #fff; font-size: 13px; font-weight: 700;
          padding: 7px 12px; border-radius: 999px;
          box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
          opacity: 0; pointer-events: none; transition: opacity 0.2s;
        }
        .zxbot.show-label .zxbot-label { opacity: 1; }

        .zxbot-eye { animation: zxbot-blink 4s infinite; transform-origin: center; transform-box: fill-box; }

        @keyframes zxbot-bob   { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes zxbot-pulse { 0% { transform: scale(0.92); opacity: 0.9; } 100% { transform: scale(1.35); opacity: 0; } }
        @keyframes zxbot-blink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }

        @media (prefers-reduced-motion: reduce) {
          .zxbot-badge, .zxbot-ring, .zxbot-eye { animation: none !important; }
        }
      `}</style>

      <div
        ref={rootRef}
        className={`zxbot ${dragging ? "dragging" : ""} ${hover && !dragging ? "show-label" : ""}`}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        role="button"
        tabIndex={0}
        aria-label="Open ZensureX assistant"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerEnter={() => {
          hovering.current = true;
          setHover(true);
        }}
        onPointerLeave={() => {
          hovering.current = false;
          setHover(false);
        }}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") navigate("/assistant");
        }}
      >
        <span className="zxbot-label">Ask ZensureX 💬</span>
        <div className="zxbot-badge">
          <span className="zxbot-ring" />
          <svg width="46" height="46" viewBox="0 0 64 64" aria-hidden="true">
            <defs>
              <linearGradient id="zxbotg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#6366f1" />
                <stop offset="1" stopColor="#4338ca" />
              </linearGradient>
            </defs>
            {/* antenna */}
            <line x1="32" y1="6" x2="32" y2="14" stroke="#4338ca" strokeWidth="3" strokeLinecap="round" />
            <circle cx="32" cy="6" r="3.5" fill="#ef4444" />
            {/* ears */}
            <rect x="5" y="28" width="6" height="12" rx="3" fill="#4338ca" />
            <rect x="53" y="28" width="6" height="12" rx="3" fill="#4338ca" />
            {/* head */}
            <rect x="10" y="14" width="44" height="36" rx="12" fill="url(#zxbotg)" />
            {/* face screen */}
            <rect x="15" y="21" width="34" height="22" rx="8" fill="#0f172a" />
            {/* eyes */}
            <ellipse className="zxbot-eye" cx="25" cy="31" rx="4" ry="4.5" fill="#22d3ee" />
            <ellipse className="zxbot-eye" cx="39" cy="31" rx="4" ry="4.5" fill="#22d3ee" />
            {/* smile */}
            <path d="M26 38 Q32 42 38 38" fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" />
            {/* neck */}
            <rect x="26" y="50" width="12" height="6" rx="2" fill="#4338ca" />
          </svg>
        </div>
      </div>
    </>
  );
}
