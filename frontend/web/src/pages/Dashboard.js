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
          animation: zxfx-rise linear infinite;
