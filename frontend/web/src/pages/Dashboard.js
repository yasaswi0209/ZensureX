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

// Real payout tiers from the backend auto_claim_logic: [limit, payout in ₹]
// Payouts add up across perils, capped at ₹700 in total, minimum ₹150 once anything triggers.
const TRIGGERS = [
  { key: "rain", cover: "rain", icon: "🌧", label: "Heavy rain", unit: " mm", max: 100,
    tiers: [[20, 150], [50, 250], [80, 350]] },
  { key: "heat", cover: "heat", icon: "🔥", label: "Extreme heat", unit: "°C", max: 50,
    tiers: [[40, 150], [45, 250]] },
  { key: "aqi", cover: "pollution", icon: "🌫", label: "High pollution (AQI)", unit: "", max: 500,
    tiers: [[150, 150], [300, 250]] }
];

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

    return {
      name:
        a.city ||
        a.town ||
        a.village ||
        a.suburb ||
        a.city_district ||
        a.neighbourhood ||
        "",
      state: a.state || "",
      district: a.state_district || a.county || ""
    };
  } catch (e) {
    return { name: "", state: "", district: "" };
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
//   snow   : heavy falling snow, frost tint (snow weather code, or 5°C and below)
//   cold   : falling snow, frost tint and mist (below 15°C)
//   cloudy : drifting soft clouds  (15 to 24°C)
//   warm   : golden tint, sun glow, few clouds  (25 to 34°C)
//   sunny  : strong sun, rays, golden sparkles  (35 to 37°C)
//   scorch : red sun, heat waves, rising embers (38°C and above)
// Night adds a deep blue sky, bright moon, stars and shooting stars to every mode.
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
  cold: { n: 3, color: "#94a3b8", op: 0.6, band: 0.12 },
  snow: { n: 4, color: "#94a3b8", op: 0.6, band: 0.16 },
  rain: { n: 4, color: "#64748b", op: 0.5, band: 0.22 },
  storm: { n: 5, color: "#334155", op: 0.6, band: 0.34 }
};

const SKY_MODES = ["cloudy", "warm", "sunny", "scorch", "cold", "snow"]; // modes that show moon and stars at night
const SUN_MODES = ["warm", "sunny", "scorch"];                           // modes that show the sun in the day
const FOG_MODES = ["rain", "storm"];                                     // modes with rolling fog
const BAND_MODES = ["cloudy", "cold", "snow", "rain", "storm"];          // modes with the soft top sky band
const FROST_MODES = ["cold", "snow"];                                    // modes with the blue frost tint

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

    // snowflakes: bigger so they can be seen on the light page
    const flakeCount = mode === "snow" ? 90 : mode === "cold" ? 48 : 0;
    const flakes = Array.from({ length: flakeCount }, () => ({
      left: r() * 100,
      size: 5 + r() * 8,
      dur: 9 + r() * 10,
      delay: -r() * 19,
      dx: (r() - 0.5) * 140,
      op: 0.75 + r() * 0.25
    }));

    // embers (scorch) and golden sparkles (sunny, warm)
    const emberCount = mode === "scorch" ? 22 : mode === "sunny" ? 16 : mode === "warm" ? 8 : 0;
    const embers = Array.from({ length: emberCount }, () => ({
      left: r() * 100,
      size: 3 + r() * 5,
      dur: 6 + r() * 8,
      delay: -r() * 12,
      dx: (r() - 0.5) * 60
    }));

    // night stars: more, bigger, brighter
    const stars = Array.from({ length: 90 }, () => ({
      left: r() * 100,
      top: r() * 62,
      size: 1.5 + r() * 2.5,
      dur: 2 + r() * 4,
      delay: -r() * 6
    }));

    return { clouds, flakes, embers, stars };
  }, [mode, cfg.n, cfg.op]);

  const showSun = !night && SUN_MODES.includes(mode);
  const showSky = night && SKY_MODES.includes(mode);
  const showBand = BAND_MODES.includes(mode) && cfg.band > 0;
  const showFog = FOG_MODES.includes(mode);
  const showFrost = FROST_MODES.includes(mode);
  const showTint = !night && SUN_MODES.includes(mode);

  return (
    <>
      <style>{`
        .zxfx { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }

        /* night: deep blue sky that fades down the page so the moon and stars can be seen */
        .zxfx-nightsky {
          position: absolute; inset: 0;
          background: linear-gradient(to bottom,
            rgba(6, 10, 38, 0.94) 0%,
            rgba(14, 24, 68, 0.80) 30%,
            rgba(26, 38, 90, 0.55) 62%,
            rgba(36, 48, 100, 0.40) 100%);
        }

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
        .zxfx.night .zxfx-cloud { filter: blur(16px) brightness(0.75); }

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

        /* cold and snow: blue frost on the top and the edges of the screen */
        .zxfx-frost {
          position: absolute; inset: 0;
          background:
            linear-gradient(to bottom, rgba(147, 197, 253, 0.42), transparent 38%),
            radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(125, 180, 250, 0.38) 100%);
          animation: zxfx-breathe 8s ease-in-out infinite;
        }

        /* snow: white flakes with a blue edge so they show on a light page */
        .zxfx-flake {
          position: absolute; top: 0; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #ffffff, #e0f0ff 70%);
          border: 1px solid rgba(96, 165, 250, 0.75);
          box-shadow: 0 0 9px 2px rgba(59, 130, 246, 0.55);
          animation: zxfx-fall linear infinite; will-change: transform;
        }
        .zxfx.night .zxfx-flake { border-color: rgba(255, 255, 255, 0.9); box-shadow: 0 0 10px 2px rgba(191, 219, 254, 0.9); }

        /* cold mist */
        .zxfx-mist {
          position: absolute; left: -10%; right: -10%; bottom: 0; height: 40vh;
          background:
            radial-gradient(ellipse at 30% 100%, rgba(125, 165, 215, 0.60), transparent 62%),
            radial-gradient(ellipse at 75% 100%, rgba(148, 170, 205, 0.55), transparent 62%);
          filter: blur(8px);
          animation: zxfx-mist 14s ease-in-out infinite alternate;
        }

        /* sun */
        .zxfx.m-warm   { --s1: rgba(255, 224, 120, 0.80); --s2: rgba(255, 200, 80, 0.38);  --r1: rgba(255, 224, 130, 0.28); --tint: rgba(255, 214, 120, 0.24); }
        .zxfx.m-sunny  { --s1: rgba(255, 200, 60, 0.95);  --s2: rgba(255, 170, 30, 0.50);  --r1: rgba(255, 195, 70, 0.38);  --tint: rgba(255, 190, 60, 0.36); }
        .zxfx.m-scorch { --s1: rgba(255, 110, 40, 0.90);  --s2: rgba(255, 70, 30, 0.46);   --r1: rgba(255, 105, 40, 0.34);  --tint: rgba(255, 100, 40, 0.34); }

        .zxfx-tint {
          position: absolute; inset: 0;
          background: linear-gradient(to bottom left, var(--tint), transparent 58%);
          animation: zxfx-breathe 7s ease-in-out infinite;
        }
        .zxfx-sun {
          position: absolute; top: -200px; right: -200px; width: 580px; height: 580px; border-radius: 50%;
          background: radial-gradient(circle, var(--s1) 0%, var(--s2) 38%, transparent 70%);
          animation: zxfx-pulse 6s ease-in-out infinite;
        }
        .zxfx-rays {
          position: absolute; top: -380px; right: -380px; width: 920px; height: 920px; border-radius: 50%;
          background: repeating-conic-gradient(from 0deg, var(--r1) 0 6deg, transparent 6deg 24deg);
          -webkit-mask-image: radial-gradient(circle, #000 8%, transparent 64%);
          mask-image: radial-gradient(circle, #000 8%, transparent 64%);
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

        /* rising embers (scorch) and golden sparkles (sunny, warm) */
        .zxfx-ember {
          position: absolute; bottom: -10px; border-radius: 50%;
          background: radial-gradient(circle, #ffd27a, #ff7a1a 70%);
          box-shadow: 0 0 8px rgba(255, 120, 30, 0.9);
          animation: zxfx-rise linear infinite; will-change: transform;
        }
        .zxfx.m-sunny .zxfx-ember,
        .zxfx.m-warm .zxfx-ember {
          background: radial-gradient(circle, #fffbe0, #ffc83a 70%);
          box-shadow: 0 0 10px 2px rgba(255, 190, 40, 0.85);
        }

        /* night: bright moon, stars, shooting star */
        .zxfx-moon {
          position: absolute; top: 80px; right: 9%; width: 96px; height: 96px; border-radius: 50%;
          background:
            radial-gradient(circle at 30% 32%, rgba(148, 163, 184, 0.55) 0 7px, transparent 8px),
            radial-gradient(circle at 62% 58%, rgba(148, 163, 184, 0.45) 0 10px, transparent 11px),
            radial-gradient(circle at 45% 78%, rgba(148, 163, 184, 0.40) 0 5px, transparent 6px),
            radial-gradient(circle at 35% 35%, #ffffff, #f1f5f9 50%, #cbd5e1);
          box-shadow: 0 0 40px 14px rgba(241, 245, 249, 0.60), 0 0 110px 44px rgba(147, 197, 253, 0.40);
          animation: zxfx-moonglow 6s ease-in-out infinite;
        }
        .zxfx-star {
          position: absolute; border-radius: 50%; background: #ffffff;
          box-shadow: 0 0 8px 2px rgba(255, 255, 255, 0.9), 0 0 14px 3px rgba(147, 197, 253, 0.7);
          animation: zxfx-twinkle ease-in-out infinite;
        }
        .zxfx-shoot {
          position: absolute; top: 14%; left: 62%; width: 130px; height: 2px; border-radius: 2px;
          background: linear-gradient(90deg, #ffffff, rgba(255, 255, 255, 0));
          box-shadow: 0 0 8px 2px rgba(255, 255, 255, 0.8);
          opacity: 0; animation: zxfx-shoot 11s linear infinite;
        }
        .zxfx-shoot.b { top: 30%; left: 32%; animation-delay: -5s; animation-duration: 15s; }

        @keyframes zxfx-drift    { from { transform: translateX(-50vw); } to { transform: translateX(115vw); } }
        @keyframes zxfx-breathe  { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
        @keyframes zxfx-fog      { from { transform: translateX(-8%); } to { transform: translateX(8%); } }
        @keyframes zxfx-fall     { from { transform: translate3d(0, -8vh, 0); } to { transform: translate3d(var(--dx), 108vh, 0); } }
        @keyframes zxfx-rise     { 0% { transform: translate3d(0, 0, 0); opacity: 0; } 15% { opacity: 0.9; } 100% { transform: translate3d(var(--dx), -70vh, 0); opacity: 0; } }
        @keyframes zxfx-twinkle  { 0%, 100% { opacity: 0.35; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }
        @keyframes zxfx-moonglow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.08); } }
        @keyframes zxfx-shoot    { 0% { transform: translate3d(0, 0, 0) rotate(-34deg); opacity: 0; } 2% { opacity: 1; } 7% { transform: translate3d(-340px, 230px, 0) rotate(-34deg); opacity: 0; } 100% { transform: translate3d(-340px, 230px, 0) rotate(-34deg); opacity: 0; } }
        @keyframes zxfx-spin     { to { transform: rotate(360deg); } }
        @keyframes zxfx-pulse    { 0%, 100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.08); opacity: 1; } }
        @keyframes zxfx-heat     { 0% { background-position: 0 0; transform: skewX(0); } 50% { transform: skewX(1.2deg); } 100% { background-position: 0 -88px; transform: skewX(0); } }
        @keyframes zxfx-mist     { from { transform: translateX(-10%); } to { transform: translateX(10%); } }

        @media (prefers-reduced-motion: reduce) {
          .zxfx *, .zxfx *::after { animation: none !important; }
        }
      `}</style>

      <div className={`zxfx m-${mode} ${night ? "night" : ""}`} aria-hidden="true">

        {/* night sky */}
        {night && <div className="zxfx-nightsky" />}

        {/* day: warm golden tint and sun */}
        {showTint && <div className="zxfx-tint" />}
        {showSun && <div className="zxfx-rays" />}
        {showSun && <div className="zxfx-sun" />}

        {/* night: moon, stars, shooting stars */}
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
        {showSky && <div className="zxfx-shoot" />}
        {showSky && <div className="zxfx-shoot b" />}

        {mode === "scorch" && <div className="zxfx-heat" />}

        {/* soft sky band */}
        {showBand && (
          <div
            className="zxfx-band"
            style={{ "--band-color": hexToRgba(cfg.color, cfg.band) }}
          />
        )}

        {/* frost tint for cold and snow */}
        {showFrost && <div className="zxfx-frost" />}

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

// Shows how close live conditions are to each payout limit. "Simulate" is for demos.
function TriggerCard({ temp, rainMm, aqi, covered, ready }) {
  const [simulate, setSimulate] = useState(false);
  const [sim, setSim] = useState({ rain: 0, heat: 30, aqi: 100 });

  const live = { rain: Number(rainMm) || 0, heat: Number(temp) || 0, aqi: Number(aqi) || 0 };
  const values = simulate ? sim : live;

  const statusOf = (v, limit) =>
    v >= limit
      ? { text: "Payout triggers", color: RISK.HIGH }
      : v >= limit * 0.7
      ? { text: "Close", color: RISK.MEDIUM }
      : { text: "Safe", color: RISK.LOW };

  return (
    <div className="zx-card zx-rise" style={{ "--i": 10 }}>
      <div className="zx-card-head">
        <div>
          <h3 className="zx-card-title">Payout triggers</h3>
          <p className="zx-card-sub">
            {simulate
              ? "Demo mode: drag the sliders to test a payout."
              : "How close conditions are to an automatic payout."}
          </p>
        </div>
        <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={simulate} onChange={e => setSimulate(e.target.checked)} />
          Simulate
        </label>
      </div>

      {!ready && !simulate ? (
        <span className="zx-skel" style={{ width: "100%", height: 110 }} />
      ) : (
        TRIGGERS.map(t => {
          const v = values[t.key];
          const limit = t.tiers[0][0];
          const s = statusOf(v, limit);
          const hit = [...t.tiers].reverse().find(([at]) => v >= at);
          const inPlan = covered.includes(t.cover);
          return (
            <div key={t.key} style={{ padding: "10px 0", opacity: inPlan ? 1 : 0.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                <span>{t.icon} {t.label}</span>
                <span style={{ color: inPlan ? s.color : "#64748b" }}>{inPlan ? s.text : "Not in plan"}</span>
              </div>
              <div className="zx-bar" style={{ margin: "6px 0 4px" }}>
                <div
                  className="zx-bar-fill"
                  style={{ width: `${Math.min((v / limit) * 100, 100)}%`, background: s.color }}
                />
              </div>
              <p className="zx-muted" style={{ fontSize: 12, margin: 0 }}>
                Now {Number(v).toFixed(t.key === "rain" ? 1 : 0)}{t.unit} ·{" "}
                {hit ? `pays ₹${hit[1]}` : `pays from ${limit}${t.unit}`}
              </p>
              <p className="zx-muted" style={{ fontSize: 11, margin: "2px 0 0" }}>
                {t.tiers.map(([at, amt]) => `${at}${t.unit} = ₹${amt}`).join("  ·  ")}
              </p>
              {simulate && (
                <input
                  type="range"
                  min="0"
                  max={t.max}
                  step={t.key === "rain" ? 0.5 : 1}
                  value={sim[t.key]}
                  onChange={e => setSim({ ...sim, [t.key]: Number(e.target.value) })}
                  style={{ width: "100%" }}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function Dashboard() {

  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [pool, setPool] = useState(null);

  // GPS only: no saved city, no default position
  const [position, setPosition] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("pending"); // "pending" | "ok" | "denied"
  const [place, setPlace] = useState("");
  const [accuracy, setAccuracy] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tick, setTick] = useState(0);

  const gpsOk = gpsStatus === "ok";

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
  const rain24h = data?.weather?.rain_24h ?? 0;           // rain that fell in the last 24 hours
  const windKmh = data?.weather?.wind_kmh;                // sustained wind
  const gustKmh = data?.weather?.gust_kmh;                // gusts
  const aqi = data?.aqi ?? 0;
  const shownCity = gpsOk ? (place || "Your current location") : "Location needed";
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
    } else if (!data) {
      nextPayout = "Waiting for location";
      nextPayoutNote = "Allow location to check conditions";
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
    if (data.alerts?.length) {
      // official IMD / NDMA alert for the user's own location comes first
      const top = data.alerts[0];
      banner = {
        tone: top.level === "HIGH" ? "danger" : "warn",
        icon: "🌀",
        text: `${top.headline}${top.source ? ` (${top.source})` : ""}${
          pool?.plan
            ? ". Your plan pays out automatically if conditions trigger it."
            : ". Choose a plan to stay covered."
        }`
      };
    } else if (isStorm) {
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

  // refresh every 5 minutes so rain shows up without a manual reload
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // RISK: location comes from GPS only
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
        setLoadError(false);
        setUpdatedAt(new Date());
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        console.error(err);
        setLoadError(true);
      }
    }

    if (!navigator.geolocation) {
      setGpsStatus("denied");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy: acc } = pos.coords;

        setGpsStatus("ok");
        setPosition([latitude, longitude]);
        setAccuracy(acc);

        // state and district go to the backend so it can match official alerts to this user
        let region = { state: "", district: "" };

        lookupPlace(latitude, longitude)
          .then(info => {
            region = info;
            const name = info.name;
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
              lon: longitude,
              state: region.state || undefined,
              district: region.district || undefined
            });
          });
      },
      () => {
        setGpsStatus("denied");
        setPosition(null);
        setData(null);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, [navigate, tick]);

  // POOL, PLAN, COVERAGE: real values (reload after risk so the GPS zone is saved)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    if (!data && gpsStatus !== "denied") return;
    axios
      .get(`${API_BASE}/pool/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setPool(res.data))
      .catch(err => console.error("Pool load failed", err));
  }, [data, gpsStatus]);

  // ONE risk for the gauge, the map and the legend:
  // the worst of "now" and the outlook, so the gauge never says LOW while the outlook says MEDIUM/HIGH.
  const gaugeRisk = data?.outlook_risk || data?.risk || "LOW";
  const riskKey = gaugeRisk;
  const riskColor = RISK[riskKey] || RISK.LOW;

  const forecastCards = [
    { label: "Now", temp, rain: rainMm, pop: null, risk: data?.risk, storm: isStorm, wind: gustKmh ?? windKmh },
    forecast?.h3 && {
      label: "Next 3 hours",
      temp: forecast.h3.temp,
      rain: forecast.h3.rain_mm,
      pop: forecast.h3.pop,
      risk: forecast.h3.risk,
      storm: forecast.h3.condition_id >= 200 && forecast.h3.condition_id <= 232,
      wind: forecast.h3.gust_kmh ?? forecast.h3.wind_kmh
    },
    forecast?.h6 && {
      label: "Next 6 hours",
      temp: forecast.h6.temp,
      rain: forecast.h6.rain_mm,
      pop: forecast.h6.pop,
      risk: forecast.h6.risk,
      storm: forecast.h6.condition_id >= 200 && forecast.h6.condition_id <= 232,
      wind: forecast.h6.gust_kmh ?? forecast.h6.wind_kmh
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
              {gpsStatus === "pending" ? "Finding your location..." : shownCity}
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
                <span className="zx-chip">🌧 Last 24h {Number(rain24h).toFixed(0)} mm</span>
                {windKmh !== undefined && (
                  <span className="zx-chip">
                    💨 Wind {Number(windKmh).toFixed(0)} km/h (gusts {Number(gustKmh ?? windKmh).toFixed(0)})
                  </span>
                )}
                <span className="zx-chip">🌫 AQI {aqi} ({aqiLabel(aqi)})</span>
              </div>
            )}
          </div>

          <div className="zx-gauge-box">
            <RiskGauge risk={data ? gaugeRisk : undefined} />
            <p className="zx-gauge-value">{data ? `${gaugeRisk} risk` : "Checking risk"}</p>
            <p className="zx-gauge-label">
              {data ? `Now: ${data.risk} · Next 6 hours: ${next6 || "Unavailable"}` : "..."}
            </p>
            <button className="zx-refresh" onClick={() => setTick(t => t + 1)}>
              Refresh now
            </button>
          </div>

        </div>

        {/* LOCATION OFF */}
        {gpsStatus === "denied" && (
          <div className="zx-banner zx-banner-warn zx-rise" style={{ "--i": 1 }}>
            <span>📍</span>
            <span>
              Location access is off. ZensureX uses your device GPS only, so allow location in your browser,
              then press Refresh now.
            </span>
          </div>
        )}

        {/* SERVER ERROR */}
        {gpsOk && loadError && !data && (
          <div className="zx-banner zx-banner-warn zx-rise" style={{ "--i": 1 }}>
            <span>⏳</span>
            <span>Could not load live conditions. The server may be waking up. Press Refresh now in a few seconds.</span>
          </div>
        )}

        {/* BANNER */}
        {data && (
          <div className={`zx-banner ${banner.tone ? `zx-banner-${banner.tone}` : ""} zx-rise`} style={{ "--i": 1 }}>
            <span>{banner.icon}</span>
            <span>{banner.text}</span>
          </div>
        )}

        {/* WHY THIS RISK: wind, gusts, 24h rain and the model's own reasons */}
        {data?.reason && data.reason !== "Normal conditions" && (
          <p className="zx-muted zx-rise" style={{ "--i": 1, margin: "8px 4px 0", fontSize: 13 }}>
            Why {gaugeRisk}: {data.reason}
          </p>
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
              {pool
                ? `${pool.member_count} ${pool.member_count === 1 ? "member" : "members"}${gpsOk && pool.zone_label ? ` • ${pool.zone_label}` : ""}`
                : "\u00a0"}
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
                    {gpsOk
                      ? `Exact GPS position${accuracy ? ` (accurate to about ${Math.round(accuracy)} m)` : ""}`
                      : gpsStatus === "denied"
                      ? "Location is off. Allow location access to see your position."
                      : "Finding your GPS position..."}
                  </p>
                </div>
              </div>

              {gpsOk && position ? (
                <div className="zx-map-wrap">
                  <MapContainer
                    center={position}
                    key={position.toString()}
                    zoom={15}
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

                    {accuracy && accuracy < 2000 && (
                      <Circle
                        center={position}
                        radius={accuracy}
                        pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.12, weight: 1 }}
                      />
                    )}

                    <Marker position={position} icon={makePin(riskColor)}>
                      <Popup>
                        <b>You are here</b>
                        <br />
                        Risk: {data ? gaugeRisk : "Loading"}
                      </Popup>
                    </Marker>
                  </MapContainer>

                  <div className="zx-legend">
                    <div className="zx-legend-row">
                      {["LOW", "MEDIUM", "HIGH"].map(k => (
                        <span
                          key={k}
                          className="zx-legend-item"
                          style={{ fontWeight: riskKey === k && data ? 800 : 400 }}
                        >
                          <span className="zx-dot" style={{ background: RISK[k] }} />
                          {k.charAt(0) + k.slice(1).toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : gpsStatus === "denied" ? (
                <div className="zx-empty">
                  <span className="zx-empty-icon">📍</span>
                  <b>Location is off</b>
                  <span className="zx-muted">
                    Turn on location for this site in your browser settings, then press Refresh now.
                  </span>
                  <button className="zx-cta" onClick={() => setTick(t => t + 1)}>Try again</button>
                </div>
              ) : (
                <div className="zx-empty"><span className="zx-skel" style={{ width: "100%", height: 200 }} /></div>
              )}
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
                      {c.wind !== undefined && c.wind !== null && (
                        <p className="zx-fc-meta">💨 {Number(c.wind).toFixed(0)} km/h</p>
                      )}
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

            {/* PAYOUT TRIGGERS */}
            <TriggerCard temp={temp} rainMm={rainMm} aqi={aqi} covered={covered} ready={!!data} />

            {/* PROTECTION SUMMARY */}
            <div className="zx-card zx-rise" style={{ "--i": 11 }}>
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
