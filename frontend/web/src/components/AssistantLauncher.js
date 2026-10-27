import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/*
  Floating assistant robot (side-gutter version)
  - Measures the main content (.zx-page) and only moves in the empty space
    on the LEFT and RIGHT of it, so it never covers cards or text
  - Roams up and down those side areas on its own
  - Now and then it fades out and reappears on the other side
    (it never travels across the content)
  - Can be dragged; on release it snaps back into the nearest side area
  - Click (without dragging) opens /assistant
  - If the screen is too narrow to have side space (phones), it parks in the
    bottom-right corner and stays there
*/

const SIZE = 72;            // robot size in px
const EDGE = 8;             // gap from the screen edge
const GAP = 10;             // gap between the robot and the content
const TOP_SAFE = 90;        // stay below the navbar
const BOTTOM_SAFE = 44;     // room for the "Ask me" tag under the robot
const ROAM_EVERY = 4500;    // ms between automatic moves
const RESUME_AFTER_DRAG = 6000;
const SWITCH_SIDE_CHANCE = 0.25;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// Empty areas on the left and right of the main content
function getGutters() {
  const el = document.querySelector(".zx-page, .policy-container, main");
  const w = document.documentElement.clientWidth;

  let left;
  let right;
  if (el) {
    const r = el.getBoundingClientRect();
    left = r.left;
    right = r.right;
  } else {
    left = (w - 1140) / 2;
    right = left + 1140;
  }

  const gutters = [];

  const leftMax = left - GAP - SIZE;
  if (leftMax >= EDGE) gutters.push({ side: "left", minX: EDGE, maxX: leftMax });

  const rightMin = right + GAP;
  const rightMax = w - SIZE - EDGE;
  if (rightMax >= rightMin) gutters.push({ side: "right", minX: rightMin, maxX: rightMax });

  return gutters;
}

function getYBounds() {
  return {
    minY: TOP_SAFE,
    maxY: Math.max(TOP_SAFE, window.innerHeight - SIZE - BOTTOM_SAFE),
  };
}

function dockedCorner() {
  const w = document.documentElement.clientWidth;
  return { x: w - SIZE - EDGE, y: getYBounds().maxY };
}

// Put any position into the nearest side area
function snapToGutter(x, y) {
  const gutters = getGutters();
  const { minY, maxY } = getYBounds();
  if (!gutters.length) return dockedCorner();

  let best = gutters[0];
  let bestDist = Infinity;
  gutters.forEach(g => {
    const center = (g.minX + g.maxX) / 2;
    const d = Math.abs(x - center);
    if (d < bestDist) {
      bestDist = d;
      best = g;
    }
  });

  return { x: clamp(x, best.minX, best.maxX), y: clamp(y, minY, maxY) };
}

function sideOf(x) {
  const gutters = getGutters();
  if (!gutters.length) return "dock";
  let best = gutters[0];
  let bestDist = Infinity;
  gutters.forEach(g => {
    const d = Math.abs(x - (g.minX + g.maxX) / 2);
    if (d < bestDist) {
      bestDist = d;
      best = g;
    }
  });
  return best.side;
}

export default function AssistantLauncher() {
  const navigate = useNavigate();

  const [pos, setPos] = useState(null); // null until the page has been measured
  const [dragging, setDragging] = useState(false);
  const [jumping, setJumping] = useState(false); // fade out, move, fade in

  const posRef = useRef(null);
  const drag = useRef(null);
  const hovering = useRef(false);
  const busy = useRef(false);
  const pauseUntil = useRef(0);
  const rootRef = useRef(null);
  const timers = useRef([]);

  function place(p) {
    posRef.current = p;
    setPos(p);
  }

  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  }

  // First position: right side area, near the bottom
  useEffect(() => {
    const { maxY } = getYBounds();
    const gutters = getGutters();
    const start = gutters.length
      ? { x: gutters[gutters.length - 1].maxX, y: maxY - 40 }
      : dockedCorner();
    setJumping(true);
    place(start);
    later(() => setJumping(false), 60);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  // Automatic roaming, only inside the side areas
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return undefined;

    function roam() {
      if (drag.current || hovering.current || busy.current) return;
      if (Date.now() < pauseUntil.current) return;
      if (!posRef.current) return;

      const gutters = getGutters();
      if (!gutters.length) return; // phones: stay docked

      const { minY, maxY } = getYBounds();
      const currentSide = sideOf(posRef.current.x);

      // Mostly stay on the same side, sometimes switch
      let target = gutters.find(g => g.side === currentSide) || gutters[0];
      if (gutters.length > 1 && Math.random() < SWITCH_SIDE_CHANCE) {
        target = gutters.find(g => g.side !== currentSide) || target;
      }

      const next = {
        x: target.minX + Math.random() * (target.maxX - target.minX),
        y: minY + Math.random() * (maxY - minY),
      };

      if (target.side !== currentSide) {
        // Never cross the content: fade out, reappear on the other side
        busy.current = true;
        setJumping(true);
        later(() => {
          place(next);
          later(() => {
            setJumping(false);
            busy.current = false;
          }, 80);
        }, 380);
      } else {
        place(next);
      }
    }

    later(roam, 1500);
    const id = setInterval(roam, ROAM_EVERY);
    return () => clearInterval(id);
  }, []);

  // Re-fit when the window size changes
  useEffect(() => {
    function onResize() {
      if (!posRef.current) return;
      place(snapToGutter(posRef.current.x, posRef.current.y));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onPointerDown(e) {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    drag.current = { px: e.clientX, py: e.clientY, x: rect.left, y: rect.top, moved: false };
    place({ x: rect.left, y: rect.top });
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
    place({
      x: clamp(d.x + dx, EDGE, document.documentElement.clientWidth - SIZE - EDGE),
      y: clamp(d.y + dy, EDGE, window.innerHeight - SIZE - EDGE),
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
      navigate("/assistant"); // plain click opens the assistant
      return;
    }

    // Dropped somewhere: glide back into the nearest side area
    if (posRef.current) place(snapToGutter(posRef.current.x, posRef.current.y));
    pauseUntil.current = Date.now() + RESUME_AFTER_DRAG;
  }

  return (
    <>
      <style>{`
        .zxbot {
          position: fixed; top: 0; left: 0; z-index: 9000;
          width: ${SIZE}px; height: ${SIZE}px;
          cursor: grab; touch-action: none; user-select: none;
          transition: transform 4s ease-in-out, opacity 0.35s ease;
          will-change: transform;
        }
        .zxbot.dragging { cursor: grabbing; transition: none; }
        .zxbot.jumping { opacity: 0; transition: opacity 0.35s ease; }
        .zxbot.hidden { visibility: hidden; }

        .zxbot-badge {
          position: relative; width: 100%; height: 100%; border-radius: 50%;
          background: #ffffff;
          border: 3px solid #4f46e5;
          box-shadow: 0 10px 26px rgba(79, 70, 229, 0.45), 0 2px 6px rgba(15, 23, 42, 0.25);
          display: grid; place-items: center;
          animation: zxbot-bob 2.6s ease-in-out infinite;
        }
        .zxbot.dragging .zxbot-badge { animation: none; transform: scale(1.08); }

        .zxbot-ring {
          position: absolute; inset: -5px; border-radius: 50%;
          border: 3px solid rgba(79, 70, 229, 0.55);
          animation: zxbot-pulse 2s ease-out infinite;
          pointer-events: none;
        }

        .zxbot-tag {
          position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
          margin-top: 8px; white-space: nowrap;
          background: #4f46e5; color: #fff; font-size: 11px; font-weight: 700;
          padding: 4px 10px; border-radius: 999px;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);
          pointer-events: none;
        }

        .zxbot-eye { animation: zxbot-blink 4s infinite; transform-origin: center; transform-box: fill-box; }

        @keyframes zxbot-bob   { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes zxbot-pulse { 0% { transform: scale(0.92); opacity: 0.9; } 100% { transform: scale(1.3); opacity: 0; } }
        @keyframes zxbot-blink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }

        @media (prefers-reduced-motion: reduce) {
          .zxbot-badge, .zxbot-ring, .zxbot-eye { animation: none !important; }
        }
      `}</style>

      <div
        ref={rootRef}
        className={`zxbot ${dragging ? "dragging" : ""} ${jumping ? "jumping" : ""} ${pos ? "" : "hidden"}`}
        style={{ transform: `translate(${pos ? pos.x : 0}px, ${pos ? pos.y : 0}px)` }}
        role="button"
        tabIndex={0}
        aria-label="Open ZensureX assistant"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerEnter={() => {
          hovering.current = true;
        }}
        onPointerLeave={() => {
          hovering.current = false;
        }}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") navigate("/assistant");
        }}
      >
        <div className="zxbot-badge">
          <span className="zxbot-ring" />
          <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">
            <defs>
              <linearGradient id="zxbotg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#6366f1" />
                <stop offset="1" stopColor="#4338ca" />
              </linearGradient>
            </defs>
            <line x1="32" y1="6" x2="32" y2="14" stroke="#4338ca" strokeWidth="3" strokeLinecap="round" />
            <circle cx="32" cy="6" r="3.5" fill="#ef4444" />
            <rect x="5" y="28" width="6" height="12" rx="3" fill="#4338ca" />
            <rect x="53" y="28" width="6" height="12" rx="3" fill="#4338ca" />
            <rect x="10" y="14" width="44" height="36" rx="12" fill="url(#zxbotg)" />
            <rect x="15" y="21" width="34" height="22" rx="8" fill="#0f172a" />
            <ellipse className="zxbot-eye" cx="25" cy="31" rx="4" ry="4.5" fill="#22d3ee" />
            <ellipse className="zxbot-eye" cx="39" cy="31" rx="4" ry="4.5" fill="#22d3ee" />
            <path d="M26 38 Q32 42 38 38" fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="26" y="50" width="12" height="6" rx="2" fill="#4338ca" />
          </svg>
        </div>
        <span className="zxbot-tag">Ask me</span>
      </div>
    </>
  );
}
