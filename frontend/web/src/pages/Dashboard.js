import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";

import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "../styles/zensurex-ui.css";
import "../styles/zensurex-extra.css"; // NEW: styles for assistant, profile, settings
import RainCanvas from "../components/RainCanvas";
import CountUp from "../components/CountUp";
import AssistantLauncher from "../components/AssistantLauncher"; // NEW

const API_BASE = "https://zensurex-backend.onrender.com";

const RISK = { LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#ef4444" };

const inr = n => Number(n || 0).toLocaleString("en-IN");

const PERILS = [
  { key: "rain", icon: "🌧", label: "Heavy rain" },
  { key: "heat", icon: "🔥", label: "Extreme heat" },
  { key: "pollution", icon: "🌫", label: "High pollution" },
  { key: "demand", icon: "📉", label: "Demand drop" },
  { key: "accident", icon: "🚑", label: "Accident protection" }
];

const PLAN_COVERS = {
  Basic: ["rain", "demand"],
  Moderate: ["rain", "pollution", "demand"],
  Premium: ["rain", "heat", "pollution", "demand", "accident"]
};

function aqiLabel(a) {
  if (a <= 50) return "Good";
  if (a <= 100) return "Satisfactory";
  if (a <= 200) return "Moderate";
  if (a <= 300) return "Poor";
  return "Severe";
}

function makePin(color) {
  return L.divIcon({
    className: "",
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    popupAnchor: [0, -40],
    html: `
      <div class="zx-pin">
        <span class="zx-pin-pulse" style="background:${color}"></span>
        <svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.2 0 0 7 0 15.7 0 27.5 16 44 16 44s16-16.5 16-28.3C32 7 24.8 0 16 0z"
                fill="${color}" stroke="#ffffff" stroke-width="2"/>
          <circle cx="16" cy="15.5" r="6" fill="#ffffff"/>
        </svg>
      </div>`
  });
}

// Small "i" with a tooltip. Hover on desktop, tap on mobile.
function InfoTip({ text }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  function show() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const width = 230;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    setPos({ top: r.bottom + 8, left, width });
  }

  function hide() {
    setPos(null);
  }

  useEffect(() => {
    if (!pos) return undefined;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos]);

  return (
    <>
      <span
        ref={ref}
        className="zx-info"
        role="button"
        tabIndex={0}
        aria-label="About the community pool"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={e => {
          e.stopPropagation();
          if (pos) hide();
          else show();
        }}
      >
        i
      </span>
      {pos &&
        createPortal(
          <div className="zx-tooltip" role="tooltip" style={{ top: pos.top, left: pos.left, width: pos.width }}>
            {text}
          </div>,
          document.body
        )}
    </>
  );
}

// Half-circle risk meter with a needle
function RiskGauge({ risk }) {
  const rotation = { LOW: -60, MEDIUM: 0, HIGH: 60 }[risk] ?? -90;

  const pt = (deg, r) => {
    const a = (deg * Math.PI) / 180;
    return [100 + r * Math.cos(a), 100 - r * Math.sin(a)];
  };
  const arc = (from, to) => {
    const [x1, y1] = pt(from, 80);
    const [x2, y2] = pt(to, 80);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A 80 80 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };

  const segments = [
    { key: "LOW", from: 178, to: 122 },
    { key: "MEDIUM", from: 118, to: 62 },
    { key: "HIGH", from: 58, to: 2 }
  ];

  return (
    <svg viewBox="0 0 200 112" width="100%" style={{ maxWidth: 250 }} role="img" aria-label={`Risk level ${risk || "loading"}`}>
      {segments.map(s => (
        <path
          key={s.key}
          d={arc(s.from, s.to)}
          fill="none"
          stroke={RISK[s.key]}
          strokeWidth="15"
          strokeLinecap="round"
          opacity={risk === s.key ? 1 : 0.3}
        />
      ))}
      <g
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "100px 100px",
          transition: "transform 1.1s cubic-bezier(.3,1.4,.5,1)"
        }}
      >
        <line x1="100" y1="100" x2="100" y2="38" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="100" r="8" fill="#fff" />
    </svg>
  );
}

async function lookupPlace(lat, lon) {
  try {
    const r = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          format: "jsonv2",
          lat,
          lon,
          zoom: 12
        },
        timeout: 5000
      }
    );

    const a = r.data.address || {};

    return (
      a.city ||
      a.town ||
      a.village ||
      a.suburb ||
      a.city_district ||
      a.neighbourhood ||
      ""
    );
  } catch (e) {
    return "";
  }
}

// Icon picked from the temperature (rain, storm and snow override this in the scene logic)
function tempIcon(t, isNight) {
  if (t >= 38) return "🔥";            // extreme heat
  if (t < 15) return "❄️";             // cold
  if (isNight) return t >= 25 ? "🌙" : "☁️";
  if (t >= 35) return "☀️";            // very hot and sunny
  if (t >= 25) return "⛅";            // warm, partly cloudy
  return "☁️";                         // 15 to 24°C
}

/* ------------------------------------------------------------------ */
/* WEATHER ANIMATIONS                                                  */
/* ------------------------------------------------------------------ */

// Which animation to play. Rain and storm win, then snow, then temperature.
//   storm  : dark soft clouds, sky band, fog, vignette (lightning is added separately)
//   rain   : soft clouds, sky band, fog (rain drops come from RainCanvas)
//   snow   : falling snow, heavy   (snow weather code, or 5°C and below)
//   cold   : light snow and mist   (below 15°C)
//   cloudy : drifting soft clouds  (15 to 24°C)
//   warm   : sun glow, few clouds  (25 to 34°C)
//   sunny  : strong sun and rays   (35 to 37°C)
//   scorch : red sun, heat waves, rising embers (38°C and above)
function pickFx({ raining, isStorm, isSnow, temp }) {
  if (raining) return isStorm ? "storm" : "rain";
  if (isSnow || temp <= 5) return "snow";
  if (temp < 15) return "cold";
  if (temp >= 38) return "scorch";
  if (temp >= 35) return "sunny";
  if (temp >= 25) return "warm";
  return "cloudy";
}

// n: number of clouds, color: cloud color, op: base opacity, band: top sky gradient strength (0 = none)
const CLOUD_CFG = {
  cloudy: { n: 4, color: "#cbd5e1", op: 0.55, band: 0.10 },
  warm: { n: 2, color: "#e8eef7", op: 0.6, band: 0 },
  sunny: { n: 1, color: "#e8eef7", op: 0.45, band: 0 },
  scorch: { n: 0, color: "#e8eef7", op: 0, band: 0 },
  cold: { n: 3, color: "#b6c4d8", op: 0.55, band: 0.10 },
  snow: { n: 4, color: "#94a3b8", op: 0.55, band: 0.14 },
  rain: { n: 4, color: "#64748b", op: 0.5, band: 0.22 },
  storm: { n: 5, color: "#334155", op: 0.6, band: 0.34 }
};

const SKY_MODES = ["cloudy", "warm", "sunny", "scorch", "cold"]; // modes that show moon and stars at night
const SUN_MODES = ["warm", "sunny", "scorch"];                   // modes that show the sun in the day
const FOG_MODES = ["rain", "storm"];                             // modes with rolling fog
const BAND_MODES = ["cloudy", "cold", "snow", "rain", "storm"];  // modes with the soft top sky band

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function WeatherFX({ mode, night }) {
  const cfg = CLOUD_CFG[mode] || CLOUD_CFG.cloudy;

  // Random positions are made once per mode so they do not jump on every render
  const fx = useMemo(() => {
    const seed = [...mode].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    const r = mulberry32(seed);

    // soft clouds: kept near the top, slow and blurred
    const clouds = Array.from({ length: cfg.n }, () => ({
      top: r() * 20,
      size: 240 + r() * 260,
      dur: 110 + r() * 90,
      delay: -r() * 200,
      op: cfg.op * (0.55 + r() * 0.35)
    }));

    const flakeCount = mode === "snow" ? 70 : mode === "cold" ? 26 : 0;
    const flakes = Array.from({ length: flakeCount }, () => ({
      left: r() * 100,
      size: 3 + r() * 6,
      dur: 8 + r() * 10,
      delay: -r() * 18,
      dx: (r() - 0.5) * 120,
      op: 0.6 + r() * 0.4
    }));

    const emberCount = mode === "scorch" ? 22 : mode === "sunny" ? 8 : 0;
    const embers = Array.from({ length: emberCount }, () => ({
      left: r() * 100,
      size: 2 + r() * 4,
      dur: 6 + r() * 8,
      delay: -r() * 12,
      dx: (r() - 0.5) * 60
    }));

    const stars = Array.from({ length: 45 }, () => ({
      left: r() * 100,
      top: r() * 48,
      size: 1 + r() * 2,
      dur: 2 + r() * 4,
      delay: -r() * 6
    }));

    return { clouds, flakes, embers, stars };
  }, [mode, cfg.n, cfg.op]);

  const showSun = !night && SUN_MODES.includes(mode);
  const showSky = night && SKY_MODES.includes(mode);
  const showBand = BAND_MODES.includes(mode) && cfg.band > 0;
  const showFog = FOG_MODES.includes(mode);

  return (
    <>
      <style>{`
        .zxfx { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
        .zxfx.night::before { content: ""; position: absolute; inset: 0; background: rgba(15, 23, 42, 0.10); }

        /* soft sky band at the top (rain, storm, snow, cloudy, cold) */
        .zxfx-band {
          position: absolute; top: 0; left: 0; right: 0; height: 42vh;
          background: linear-gradient(to bottom, var(--band-color), transparent);
          animation: zxfx-breathe 9s ease-in-out infinite;
        }

        /* soft blurred clouds */
        .zxfx-cloud {
          position: absolute; left: 0;
          filter: blur(16px);
          background:
            radial-gradient(ellipse 30% 55% at 22% 62%, currentColor 0%, transparent 100%),
            radial-gradient(ellipse 36% 72% at 48% 42%, currentColor 0%, transparent 100%),
            radial-gradient(ellipse 30% 55% at 76% 60%, currentColor 0%, transparent 100%),
            radial-gradient(ellipse 62% 36% at 50% 78%, currentColor 0%, transparent 100%);
          animation: zxfx-drift linear infinite; will-change: transform;
        }
        .zxfx.night .zxfx-cloud { filter: blur(16px) brightness(0.5); }

        /* rolling fog (rain and storm) */
        .zxfx-fog {
          position: absolute; left: -20%; right: -20%; bottom: 0; height: 30vh;
          background:
            radial-gradient(ellipse at 20% 100%, rgba(148, 163, 184, 0.40), transparent 62%),
            radial-gradient(ellipse at 70% 100%, rgba(100, 116, 139, 0.34), transparent 62%);
          filter: blur(10px);
          animation: zxfx-fog 22s ease-in-out infinite alternate;
        }
        .zxfx-fog.two {
          height: 20vh; opacity: 0.8;
          animation-duration: 30s; animation-direction: alternate-reverse;
        }

        /* dark edge vignette during rain and storm */
        .zxfx-vignette {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 50% 40%, transparent 45%, var(--vig) 100%);
        }

        /* snow */
        .zxfx-flake {
          position: absolute; top: 0; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #ffffff, #dbeafe 70%);
          box-shadow: 0 0 6px rgba(96, 165, 250, 0.9);
          animation: zxfx-fall linear infinite; will-change: transform;
        }

        /* cold mist */
        .zxfx-mist {
          position: absolute; left: -10%; right: -10%; bottom: 0; height: 34vh;
          background:
            radial-gradient(ellipse at 30% 100%, rgba(219, 234, 254, 0.75), transparent 60%),
            radial-gradient(ellipse at 75% 100%, rgba(226, 232, 240, 0.65), transparent 60%);
          animation: zxfx-mist 14s ease-in-out infinite alternate;
        }

        /* sun */
        .zxfx.m-warm   { --s1: rgba(255, 224, 130, 0.65); --s2: rgba(255, 206, 90, 0.28);  --r1: rgba(255, 226, 140, 0.20); }
        .zxfx.m-sunny  { --s1: rgba(255, 205, 70, 0.80);  --s2: rgba(255, 176, 40, 0.38);  --r1: rgba(255, 200, 80, 0.28); }
        .zxfx.m-scorch { --s1: rgba(255, 120, 40, 0.85);  --s2: rgba(255, 70, 30, 0.42);   --r1: rgba(255, 110, 40, 0.30); }
        .zxfx-sun {
          position: absolute; top: -140px; right: -140px; width: 460px; height: 460px; border-radius: 50%;
          background: radial-gradient(circle, var(--s1) 0%, var(--s2) 38%, transparent 70%);
          animation: zxfx-pulse 6s ease-in-out infinite;
        }
        .zxfx-rays {
          position: absolute; top: -300px; right: -300px; width: 760px; height: 760px; border-radius: 50%;
          background: repeating-conic-gradient(from 0deg, var(--r1) 0 6deg, transparent 6deg 24deg);
          -webkit-mask-image: radial-gradient(circle, #000 8%, transparent 62%);
          mask-image: radial-gradient(circle, #000 8%, transparent 62%);
          animation: zxfx-spin 90s linear infinite;
        }

        /* heat waves (38°C and above) */
        .zxfx-heat {
          position: absolute; left: 0; right: 0; bottom: 0; height: 42vh;
          background: linear-gradient(to top, rgba(255, 106, 40, 0.22), rgba(255, 160, 60, 0.08) 60%, transparent);
        }
        .zxfx-heat::after {
          content: ""; position: absolute; inset: 0;
          background: repeating-linear-gradient(to top, rgba(255, 255, 255, 0.10) 0 5px, transparent 5px 22px);
          -webkit-mask-image: linear-gradient(to top, #000, transparent);
          mask-image: linear-gradient(to top, #000, transparent);
          animation: zxfx-heat 3s ease-in-out infinite;
        }

        /* rising embers and dust (hot weather) */
        .zxfx-ember {
          position: absolute; bottom: -10px; border-radius: 50%;
          background: radial-gradient(circle, #ffd27a, #ff7a1a 70%);
          box-shadow: 0 0 8px rgba(255, 120, 30, 0.9);
          animation: zxfx-rise linear infinite; will-change: transform;
        }

        /* night: moon and stars */
        .zxfx-moon {
          position: absolute; top: 84px; right: 9%; width: 72px; height: 72px; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #ffffff, #e2e8f0 55%, #94a3b8);
          box-shadow: 0 0 50px 18px rgba(226, 232, 240, 0.35);
        }
        .zxfx-star {
          position: absolute; border-radius: 50%; background: #ffffff;
          box-shadow: 0 0 5px 1px rgba(59, 130, 246, 0.9);
          animation: zxfx-twinkle ease-in-out infinite;
        }

        @keyframes zxfx-drift   { from { transform: translateX(-50vw); } to { transform: translateX(115vw); } }
        @keyframes zxfx-breathe { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
        @keyframes zxfx-fog     { from { transform: translateX(-8%); } to { transform: translateX(8%); } }
        @keyframes zxfx-fall    { from { transform: translate3d(0, -8vh, 0); } to { transform: translate3d(var(--dx), 108vh, 0); } }
        @keyframes zxfx-rise    { 0% { transform: translate3d(0, 0, 0); opacity: 0; } 15% { opacity: 0.85; } 100% { transform: translate3d(var(--dx), -70vh, 0); opacity: 0; } }
        @keyframes zxfx-twinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
        @keyframes zxfx-spin    { to { transform: rotate(360deg); } }
        @keyframes zxfx-pulse   { 0%, 100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.08); opacity: 1; } }
        @keyframes zxfx-heat    { 0% { background-position: 0 0; transform: skewX(0); } 50% { transform: skewX(1.2deg); } 100% { background-position: 0 -88px; transform: skewX(0); } }
        @keyframes zxfx-mist    { from { transform: translateX(-10%); } to { transform: translateX(10%); } }

        @media (prefers-reduced-motion: reduce) {
          .zxfx *, .zxfx *::after { animation: none !important; }
        }
      `}</style>

      <div className={`zxfx m-${mode} ${night ? "night" : ""}`} aria-hidden="true">

        {showSun && <div className="zxfx-rays" />}
        {showSun && <div className="zxfx-sun" />}

        {showSky && <div className="zxfx-moon" />}
        {showSky &&
          fx.stars.map((s, i) => (
            <span
              key={`st${i}`}
              className="zxfx-star"
              style={{
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: s.size,
                height: s.size,
                animationDuration: `${s.dur}s`,
                animationDelay: `${s.delay}s`
              }}
            />
          ))}

        {mode === "scorch" && <div className="zxfx-heat" />}

        {/* soft sky band */}
        {showBand && (
          <div
            className="zxfx-band"
            style={{ "--band-color": hexToRgba(cfg.color, cfg.band) }}
          />
        )}

        {/* soft blurred clouds */}
        {fx.clouds.map((c, i) => (
          <div
            key={`c${i}`}
            className="zxfx-cloud"
            style={{
              top: `${c.top}%`,
              width: c.size,
              height: c.size * 0.45,
              color: cfg.color,
              opacity: c.op,
              animationDuration: `${c.dur}s`,
              animationDelay: `${c.delay}s`
            }}
          />
        ))}

        {/* rolling fog and vignette for rain / storm */}
        {showFog && <div className="zxfx-fog" />}
        {showFog && <div className="zxfx-fog two" />}
        {showFog && (
          <div
            className="zxfx-vignette"
            style={{ "--vig": mode === "storm" ? "rgba(15, 23, 42, 0.28)" : "rgba(15, 23, 42, 0.14)" }}
          />
        )}

        {mode === "cold" && <div className="zxfx-mist" />}

        {fx.flakes.map((f, i) => (
          <span
            key={`f${i}`}
            className="zxfx-flake"
            style={{
              left: `${f.left}%`,
              width: f.size,
              height: f.size,
              opacity: f.op,
              "--dx": `${f.dx}px`,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`
            }}
          />
        ))}

        {fx.embers.map((e, i) => (
          <span
            key={`e${i}`}
            className="zxfx-ember"
            style={{
              left: `${e.left}%`,
              width: e.size,
              height: e.size,
              "--dx": `${e.dx}px`,
              animationDuration: `${e.dur}s`,
              animationDelay: `${e.delay}s`
            }}
          />
        ))}
      </div>
    </>
  );
}

// "#334155" + 0.3 -> "rgba(51, 65, 85, 0.3)"
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Lightning flashes for thunderstorms. Random timing, skipped if the user prefers reduced motion.
function Lightning() {
  const [flash, setFlash] = useState(false);
  const [boltX, setBoltX] = useState(50);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    const timers = [];
    let stopped = false;

    const later = (fn, ms) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
    };

    function strike() {
      if (stopped) return;
      setBoltX(10 + Math.random() * 80);
      setFlash(true);
      later(() => setFlash(false), 110);
      // quick second flash, like real lightning
      later(() => setFlash(true), 230);
      later(() => setFlash(false), 330);
      // next strike in 4 to 11 seconds
      later(strike, 4000 + Math.random() * 7000);
    }

    later(strike, 800);

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <>
      <style>{`
        .zx-storm-dim {
          position: fixed; inset: 0; pointer-events: none; z-index: 3;
          background: rgba(15, 23, 42, 0.10);
        }
        .zx-flash {
          position: fixed; inset: 0; pointer-events: none; z-index: 4;
          background: radial-gradient(circle at var(--bx) 0%, rgba(255,255,255,0.95), rgba(191,219,254,0.55) 45%, rgba(147,197,253,0.15) 80%);
          opacity: 0; transition: opacity 60ms ease-out;
        }
        .zx-flash.on { opacity: 1; }
        .zx-bolt {
          position: fixed; top: 0; height: 60vh; width: 120px; pointer-events: none; z-index: 4;
          opacity: 0; transition: opacity 60ms ease-out;
          filter: drop-shadow(0 0 12px rgba(250, 250, 255, 0.95));
        }
        .zx-bolt.on { opacity: 1; }
      `}</style>

      <div className="zx-storm-dim" />
      <div className={`zx-flash ${flash ? "on" : ""}`} style={{ "--bx": `${boltX}%` }} />
      <svg
        className={`zx-bolt ${flash ? "on" : ""}`}
        style={{ left: `calc(${boltX}% - 60px)` }}
        viewBox="0 0 120 400"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points="70,0 50,110 78,120 40,230 66,238 30,400"
          fill="none"
          stroke="#ffffff"
          strokeWidth="5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points="52,112 20,170"
          fill="none"
          stroke="#e0ecff"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </>
  );
}

function Dashboard() {

  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [pool, setPool] = useState(null);
  const [position, setPosition] = useState([17.385, 78.4867]);
  const [place, setPlace] = useState("");
  const [accuracy, setAccuracy] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tick, setTick] = useState(0);

  // true once the browser gave us a real GPS position
  const gpsUsed = useRef(false);

  const city = localStorage.getItem("city");

  let userName = "";
  try {
    userName = JSON.parse(localStorage.getItem("user"))?.name || "";
  } catch (e) {
    userName = "";
  }

  // ---- values from the backend ----
  const temp = data?.weather?.temp ?? 0;
  const humidity = data?.weather?.humidity;
  const rainMm = data?.weather?.rain_mm ?? 0;
  const aqi = data?.aqi ?? 0;
  const usingGps = data?.location_source === "gps";
  const shownCity = (usingGps && place) || data?.city || city || "Your area";
  const forecast = data?.forecast || null;
  const next6 = forecast?.h6?.risk || "";

  // ---- weather condition from OpenWeather ----
  const condId = data?.weather?.condition_id ?? 800;
  const condText = data?.weather?.description || data?.weather?.condition || "";
  const isStorm = condId >= 200 && condId <= 232;          // thunderstorm
  const isSnow = condId >= 600 && condId <= 622;          // snow
  const apiSaysRain = data?.weather?.rain === 1;           // backend flag: rain, drizzle or storm

  // ---- rain effect: real rain, or ?rain=1 / ?rain=2 to preview ----
  const demo = new URLSearchParams(window.location.search).get("rain");
  const raining = demo === "1" || demo === "2" || rainMm > 0.1 || apiSaysRain;
  const stormy = demo === "2" || rainMm > 7.5 || isStorm;
  const rainIntensity = demo
    ? (demo === "2" ? 1 : 0.6)
    : Math.min(1, 0.25 + rainMm / 10 + (isStorm ? 0.4 : 0));

  // AQI is no longer used for the scene or the risk, it is only shown as a chip
  let scene = "clear";
  if (raining) scene = "rain";
  else if (temp > 38) scene = "hot";

  const hour = new Date().getHours();
  const isNight = hour >= 19 || hour < 6;

  // ---- weather animation layer ----
  // Preview any animation with ?fx=storm|rain|snow|cold|cloudy|warm|sunny|scorch and ?night=1
  const urlParams = new URLSearchParams(window.location.search);
  const fxDemo = urlParams.get("fx");
  const nightFx = isNight || urlParams.get("night") === "1";
  const fxMode = fxDemo || (data ? pickFx({ raining, isStorm, isSnow, temp }) : null);

  let sceneIcon;
  if (scene === "rain") sceneIcon = isStorm ? "⛈" : "🌧";
  else if (isSnow) sceneIcon = "🌨";
  else if (scene === "hot") sceneIcon = "🔥";
  else sceneIcon = tempIcon(temp, isNight);

  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ---- next payout ----
  let nextPayout = "Loading";
  let nextPayoutNote = "";
  if (pool) {
    if (!pool.plan) {
      nextPayout = "No active plan";
      nextPayoutNote = "Choose a plan to be covered";
    } else if (data?.outlook_risk === "HIGH") {
      nextPayout = "Payout ready";
      nextPayoutNote = "High risk ahead, pays on trigger";
    } else {
      nextPayout = "No disruption";
      nextPayoutNote = pool.locked_until
        ? `Plan active until ${new Date(pool.locked_until).toLocaleDateString()}`
        : "";
    }
  }

  // ---- banner under the hero ----
  let banner = { tone: "", icon: "✅", text: "Conditions are stable. Auto payout is watching your zone." };
  if (data) {
    if (isStorm) {
      banner = {
        tone: "danger",
        icon: "⛈",
        text: pool?.plan
          ? "Thunderstorm in your area. Stay alert. Your plan pays out automatically if conditions trigger it."
          : "Thunderstorm in your area and you have no active plan. Choose a plan to stay covered."
      };
    } else if (data.outlook_risk === "HIGH") {
      banner = {
        tone: "danger",
        icon: "⚠️",
        text: pool?.plan
          ? "High risk ahead. Your plan pays out automatically if conditions trigger it."
          : "High risk ahead and you have no active plan. Choose a plan to stay covered."
      };
    } else if (raining) {
      banner = { tone: "warn", icon: "🌧", text: "It is raining in your area right now. Rain cover is being monitored." };
    } else if (forecast?.h3?.pop >= 50) {
      banner = { tone: "warn", icon: "☔", text: `Rain likely in the next 3 hours (${forecast.h3.pop}% chance).` };
    }
  }

  // ---- Income Disruption Trend: real weekly payouts, no fake numbers ----
  const trend = pool?.trend || [];
  const hasTrend = trend.some(t => Number(t.payout) > 0);

  const covered = PLAN_COVERS[pool?.plan] || [];

  async function getCityCoordinates(cityName) {
    try {
      const res = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`
      );
      if (res.data.length > 0) {
        return [parseFloat(res.data[0].lat), parseFloat(res.data[0].lon)];
      }
    } catch (err) {
      console.error("Location error:", err);
    }
    return [20.5937, 78.9629];
  }

  // refresh every 5 minutes so rain shows up without a manual reload
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // RISK: GPS first, saved city as fallback
  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    async function load(params) {
      try {
        const res = await axios.get(`${API_BASE}/risk/`, { headers, params });
        setData(res.data);
        setUpdatedAt(new Date());
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        if (params && params.lat !== undefined) {
          load(city ? { city } : {});
          return;
        }
        console.error(err);
      }
    }

    const byCity = () => load(city ? { city } : {});

    if (!navigator.geolocation) {
      byCity();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy: acc } = pos.coords;

        gpsUsed.current = true;

        setPosition([latitude, longitude]);
        setAccuracy(acc);

        lookupPlace(latitude, longitude)
          .then(name => {
            if (name) setPlace(name);

            return axios
              .post(
                `${API_BASE}/pool/location`,
                {
                  lat: latitude,
                  lon: longitude,
                  place: name
                },
                { headers }
              )
              .catch(() => {});
          })
          .finally(() => {
            load({
              lat: latitude,
              lon: longitude
            });
          });
      },
      () => byCity(),
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, [city, navigate, tick]);

  // POOL, PLAN, COVERAGE: real values (reload after risk so the GPS zone is saved)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !data) return;
    axios
      .get(`${API_BASE}/pool/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setPool(res.data))
      .catch(err => console.error("Pool load failed", err));
  }, [data]);

  // MAP: saved city only when GPS was not used
  useEffect(() => {
    const target = city || data?.city;

    async function updateLocation() {
      if (target) {
        const coords = await getCityCoordinates(target);
        if (!gpsUsed.current) setPosition(coords);
      }
    }
    updateLocation();
  }, [city, data?.city]);

  const riskKey = data?.risk || "LOW";
  const riskColor = RISK[riskKey] || RISK.LOW;

  const forecastCards = [
    { label: "Now", temp, rain: rainMm, pop: null, risk: data?.risk, storm: isStorm },
    forecast?.h3 && {
      label: "Next 3 hours",
      temp: forecast.h3.temp,
      rain: forecast.h3.rain_mm,
      pop: forecast.h3.pop,
      risk: forecast.h3.risk,
      storm: forecast.h3.condition_id >= 200 && forecast.h3.condition_id <= 232
    },
    forecast?.h6 && {
      label: "Next 6 hours",
      temp: forecast.h6.temp,
      rain: forecast.h6.rain_mm,
      pop: forecast.h6.pop,
      risk: forecast.h6.risk,
      storm: forecast.h6.condition_id >= 200 && forecast.h6.condition_id <= 232
    }
  ].filter(Boolean);

  const skel = (w, h = 26) => <span className="zx-skel" style={{ width: w, height: h }} />;

  return (

    <section className="scene active">

      {fxMode && <WeatherFX mode={fxMode} night={nightFx} />}
      {raining && <RainCanvas intensity={rainIntensity} storm={stormy} />}
      {isStorm && <Lightning />}

      <div className="zx-page">

        {/* HERO */}
        <div className={`zx-hero zx-scene-${scene} zx-rise`} style={{ "--i": 0 }}>

          <div>
            <p className="zx-greet">{greeting}</p>
            <h1 className="zx-name">{userName || "Welcome back"} 👋</h1>

            <p className="zx-loc">
              <span className="zx-live-dot" />
              {shownCity}
            </p>

            <div className="zx-temp-row">
              <span className="zx-temp-icon">{sceneIcon}</span>
              <span className="zx-temp">{data ? `${Number(temp).toFixed(0)}°C` : "--"}</span>
            </div>

            {data && (
              <div className="zx-chips">
                {condText && (
                  <span className="zx-chip" style={{ textTransform: "capitalize" }}>
                    {isStorm ? "⛈" : "🌤"} {condText}
                  </span>
                )}
                {humidity !== undefined && <span className="zx-chip">💧 Humidity {humidity}%</span>}
                <span className="zx-chip">🌧 Rain {Number(rainMm).toFixed(1)} mm/h</span>
                <span className="zx-chip">🌫 AQI {aqi} ({aqiLabel(aqi)})</span>
              </div>
            )}
          </div>

          <div className="zx-gauge-box">
            <RiskGauge risk={data?.risk} />
            <p className="zx-gauge-value">{data ? `${data.risk} risk` : "Checking risk"}</p>
            <p className="zx-gauge-label">
              Next 6 hours: {data ? (next6 || "Unavailable") : "..."}
            </p>
            <button className="zx-refresh" onClick={() => setTick(t => t + 1)}>
              Refresh now
            </button>
          </div>

        </div>

        {/* BANNER */}
        {data && (
          <div className={`zx-banner ${banner.tone ? `zx-banner-${banner.tone}` : ""} zx-rise`} style={{ "--i": 1 }}>
            <span>{banner.icon}</span>
            <span>{banner.text}</span>
          </div>
        )}

        {/* KPI CARDS */}
        <div className="zx-kpis">

          <div className="zx-kpi zx-rise" style={{ "--i": 2 }}>
            <p className="zx-kpi-label">📋 Active plan</p>
            <p className="zx-kpi-value">{pool ? (pool.plan || "No plan") : skel(80)}</p>
            {pool && !pool.plan ? (
              <button className="zx-cta" onClick={() => navigate("/policy")}>Choose a plan</button>
            ) : (
              <p className="zx-kpi-sub">
                {pool?.locked_until ? `Until ${new Date(pool.locked_until).toLocaleDateString()}` : "\u00a0"}
              </p>
            )}
          </div>

          <div className="zx-kpi zx-rise" style={{ "--i": 3 }}>
            <p className="zx-kpi-label">💰 Weekly premium</p>
            <p className="zx-kpi-value">{pool ? <CountUp value={pool.premium} prefix="₹" /> : skel(80)}</p>
            <p className="zx-kpi-sub">{data?.price ? `Price today: ₹${data.price}` : "\u00a0"}</p>
          </div>

          <div className="zx-kpi zx-rise" style={{ "--i": 4 }}>
            <p className="zx-kpi-label">📊 Coverage amount</p>
            <p className="zx-kpi-value">{pool ? <CountUp value={pool.coverage} prefix="₹" /> : skel(80)}</p>
            <p className="zx-kpi-sub">Maximum protected</p>
          </div>

          <div className="zx-kpi zx-kpi-click zx-rise" style={{ "--i": 5 }} onClick={() => navigate("/pool")}>
            <p className="zx-kpi-label">
              👥 Community pool
              <InfoTip text="Workers in your area share a small weekly premium. When rain, heat or pollution disrupts work, payouts come from this shared pool. Tap the card to see members and activity." />
            </p>
            <p className="zx-kpi-value green">{pool ? <CountUp value={pool.balance} prefix="₹" /> : skel(90)}</p>
            <p className="zx-kpi-sub">
              {pool ? `${pool.member_count} ${pool.member_count === 1 ? "member" : "members"} • ${pool.zone_label}` : "\u00a0"}
            </p>
          </div>

          <div className="zx-kpi zx-rise" style={{ "--i": 6 }}>
            <p className="zx-kpi-label">⏱ Next payout</p>
            <p className="zx-kpi-value" style={{ fontSize: 18 }}>{pool ? nextPayout : skel(100)}</p>
            <p className="zx-kpi-sub">
              <span className="zx-live-dot" />Auto payout enabled
            </p>
            {nextPayoutNote ? <p className="zx-kpi-sub">{nextPayoutNote}</p> : null}
          </div>

        </div>

        <div className="zx-grid">

          {/* LEFT COLUMN */}
          <div className="zx-col">

            {/* MAP */}
            <div className="zx-card zx-rise" style={{ "--i": 7 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">Your location</h3>
                  <p className="zx-card-sub">
                    {usingGps
                      ? `Exact GPS position${accuracy ? ` (accurate to about ${Math.round(accuracy)} m)` : ""}`
                      : "Approximate position from your saved city. Allow location for an exact pin."}
                  </p>
                </div>
              </div>

              <div className="zx-map-wrap">
                <MapContainer
                  center={position}
                  key={position.toString()}
                  zoom={usingGps ? 15 : 13}
                  className="zx-map"
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                  {data?.risk && (
                    <Circle
                      center={position}
                      radius={800}
                      pathOptions={{ color: riskColor, fillColor: riskColor, fillOpacity: 0.2, weight: 2 }}
                    />
                  )}

                  {usingGps && accuracy && accuracy < 2000 && (
                    <Circle
                      center={position}
                      radius={accuracy}
                      pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.12, weight: 1 }}
                    />
                  )}

                  <Marker position={position} icon={makePin(riskColor)}>
                    <Popup>
                      <b>{usingGps ? "You are here" : "Saved city (approximate)"}</b>
                      <br />
                      Risk: {data?.risk || "Loading"}
                    </Popup>
                  </Marker>
                </MapContainer>

                <div className="zx-legend">
                  <div className="zx-legend-row">
                    {["LOW", "MEDIUM", "HIGH"].map(k => (
                      <span
                        key={k}
                        className="zx-legend-item"
                        style={{ fontWeight: data?.risk === k ? 800 : 400 }}
                      >
                        <span className="zx-dot" style={{ background: RISK[k] }} />
                        {k.charAt(0) + k.slice(1).toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* TREND */}
            <div className="zx-card zx-rise" style={{ "--i": 8 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">Income disruption trend</h3>
                  <p className="zx-card-sub">Payouts released from your zone's pool, last 4 weeks</p>
                </div>
              </div>

              {!pool ? (
                <div className="zx-empty"><span className="zx-skel" style={{ width: "100%", height: 160 }} /></div>
              ) : !hasTrend ? (
                <div className="zx-empty">
                  <span className="zx-empty-icon">☂️</span>
                  <b>No disruptions recorded yet</b>
                  <span className="zx-muted">Nothing has interrupted earnings in the last 4 weeks. Payouts appear here when a claim is approved.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="zxPayout" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="period" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => `₹${v}`} tickLine={false} axisLine={false} />
                    <Tooltip formatter={v => [`₹${inr(v)}`, "Payout"]} />
                    <Area type="monotone" dataKey="payout" stroke="#ef4444" strokeWidth={3} fill="url(#zxPayout)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN */}
          <div className="zx-col">

            {/* FORECAST */}
            <div className="zx-card zx-rise" style={{ "--i": 9 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">Weather outlook</h3>
                  <p className="zx-card-sub">
                    Outlook risk:{" "}
                    <b style={{ color: RISK[data?.outlook_risk] || "#64748b" }}>{data?.outlook_risk || "..."}</b>
                  </p>
                </div>
              </div>

              {!data ? (
                <span className="zx-skel" style={{ width: "100%", height: 110 }} />
              ) : !forecast ? (
                <p className="zx-muted">Forecast unavailable right now. Showing current conditions only.</p>
              ) : (
                <div className="zx-forecast">
                  {forecastCards.map(c => (
                    <div key={c.label} className="zx-fc" style={{ "--c": RISK[c.risk] || "#94a3b8" }}>
                      <p className="zx-fc-label">{c.label}</p>
                      <p className="zx-fc-temp">{Number(c.temp).toFixed(0)}°C</p>
                      <p className="zx-fc-risk">{c.risk}</p>
                      {c.storm && <p className="zx-fc-meta">⛈ Thunderstorm</p>}
                      <p className="zx-fc-meta">🌧 {Number(c.rain).toFixed(1)} mm/h</p>
                      {c.pop !== null && (
                        <>
                          <p className="zx-fc-meta">☔ {c.pop}% chance</p>
                          <div className="zx-bar"><div className="zx-bar-fill" style={{ width: `${c.pop}%` }} /></div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {data?.data_fallback && (
                <p className="zx-muted" style={{ marginTop: 10 }}>⚠ Live weather unavailable, showing estimated values.</p>
              )}
            </div>

            {/* PROTECTION SUMMARY */}
            <div className="zx-card zx-rise" style={{ "--i": 10 }}>
              <div className="zx-card-head">
                <div>
                  <h3 className="zx-card-title">Protection summary</h3>
                  <p className="zx-card-sub">
                    {pool?.plan ? `What your ${pool.plan} plan covers` : "Choose a plan to start being covered"}
                  </p>
                </div>
              </div>

              <div className="zx-cover-list">
                {PERILS.map(p => {
                  const on = covered.includes(p.key);
                  return (
                    <div key={p.key} className={`zx-cover ${on ? "on" : ""}`}>
                      <span className="zx-cover-icon">{p.icon}</span>
                      <span className="zx-cover-name">{p.label}</span>
                      <span className="zx-cover-state">{on ? "Covered" : "Not in plan"}</span>
                    </div>
                  );
                })}
              </div>

              {pool && pool.plan !== "Premium" && (
                <button className="zx-cta" style={{ marginTop: 14 }} onClick={() => navigate("/policy")}>
                  {pool.plan ? "Upgrade plan" : "Choose a plan"}
                </button>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* Floating robot: opens the full assistant page at /assistant */}
      <AssistantLauncher />

    </section>

  );

}

export default Dashboard;
