// Shared assistant logic. The chat UI lives in pages/AssistantPage.js
// and the floating robot lives in components/AssistantLauncher.js.

export const QUICK = [
  "Is it safe to work now?",
  "Will it rain soon?",
  "Which plan should I take?",
  "How do payouts work?",
  "What is the community pool?"
];

const has = (q, words) => words.some(w => q.includes(w));

function aqiLabel(a) {
  if (a <= 50) return "Good";
  if (a <= 100) return "Satisfactory";
  if (a <= 200) return "Moderate";
  if (a <= 300) return "Poor";
  return "Severe";
}

// Same pricing rule as the Policy page
function planPrices(base) {
  const b = base > 0 ? base : 20;
  const moderate = Math.round(b * 1.25);
  const premium = Math.max(Math.round(b * 1.5), moderate + 5);
  return { Basic: b, Moderate: moderate, Premium: premium };
}

// Answers come from the worker's live data, not from canned numbers.
export function answer(question, { data, pool, userName }) {
  const q = question.toLowerCase().trim();

  const temp = data?.weather?.temp;
  const rain = data?.weather?.rain_mm ?? 0;
  const aqi = data?.aqi;
  const f3 = data?.forecast?.h3;
  const f6 = data?.forecast?.h6;
  const needsData = !data;
  const loading = { text: "I am still loading your live conditions. Ask me again in a few seconds." };

  if (/\b(thanks|thank you|thx)\b/.test(q)) {
    return { text: "Happy to help. Ride safe!" };
  }

  if (/^(hi|hello|hey|hii)\b/.test(q) || q.includes("good morning") || q.includes("good evening")) {
    return { text: `Hi ${userName || "there"}! Ask me about your risk, weather, plan, payouts or the community pool.` };
  }

  if (has(q, ["payout", "claim", "paid", "money", "upi", "refund"])) {
    let status = "";
    if (data && pool) {
      status = pool.plan
        ? "You have an active plan, so a payout would be sent to your UPI. Conditions are below the limits right now."
        : "You have no active plan yet, so a claim would be rejected. Choose a plan first.";
      if (rain > 7.5 || temp > 45 || aqi > 250) status = "Conditions are above the payout limits right now.";
    }
    return {
      text:
        "Payouts are automatic. A claim is raised when rain goes above 7.5 mm/h, temperature above 45°C, AQI above 250, or the risk level turns HIGH. The money is paid to your UPI from the community pool.\n" +
        status,
      action: { label: "Open Claims", to: "/claims" }
    };
  }

  if (has(q, ["recommend", "which plan", "best plan", "should i take", "upgrade", "what plan"])) {
    if (needsData) return loading;
    const prices = planPrices(data.price);
    const rec = data.recommended_plan || "Basic";
    return {
      text:
        `For today's outlook (${data.outlook_risk || data.risk}) I would pick the ${rec} plan at ₹${prices[rec]} a week.\n` +
        `Basic ₹${prices.Basic}, Moderate ₹${prices.Moderate}, Premium ₹${prices.Premium}.`,
      action: { label: "Open Policy", to: "/policy" }
    };
  }

  if (has(q, ["plan", "premium", "price", "cost", "coverage", "cover"])) {
    if (!pool) return loading;
    if (!pool.plan) {
      return {
        text: "You do not have an active plan yet, so you are not covered. Pick one to start.",
        action: { label: "Choose a plan", to: "/policy" }
      };
    }
    const until = pool.locked_until ? ` It is locked until ${new Date(pool.locked_until).toLocaleDateString()}.` : "";
    return {
      text: `You are on the ${pool.plan} plan. You pay ₹${pool.premium} a week and your cover is up to ₹${pool.coverage}.${until}`,
      action: { label: "View plans", to: "/policy" }
    };
  }

  if (has(q, ["pool", "community", "members"])) {
    if (!pool) return loading;
    return {
      text:
        `The community pool is a shared fund for workers in the same area. Your zone is ${pool.zone_label} with ${pool.member_count} ${pool.member_count === 1 ? "member" : "members"} and ₹${pool.balance} in the pool. ` +
        "Everyone pays a small weekly premium, and payouts for rain, heat or pollution come from it.",
      action: { label: "Open Pool", to: "/pool" }
    };
  }

  if (has(q, ["lock", "cancel", "change plan", "switch"])) {
    return {
      text:
        "A plan locks for 7 days after you confirm it, so it cannot be changed or cancelled in that time." +
        (pool?.locked_until ? ` Yours unlocks on ${new Date(pool.locked_until).toLocaleDateString()}.` : "")
    };
  }

  if (has(q, ["rain", "umbrella", "forecast", "weather", "storm"])) {
    if (needsData) return loading;
    const lines = [`Right now: ${rain > 0.1 ? `raining, ${Number(rain).toFixed(1)} mm/h` : "no rain"}, ${Number(temp).toFixed(0)}°C.`];
    if (f3) lines.push(`Next 3 hours: ${f3.pop}% chance of rain, ${Number(f3.rain_mm).toFixed(1)} mm/h.`);
    if (f6) lines.push(`Next 6 hours: ${f6.pop}% chance of rain, ${Number(f6.rain_mm).toFixed(1)} mm/h.`);
    if (!f3 && !f6) lines.push("The forecast is unavailable right now.");
    return { text: lines.join("\n"), action: { label: "Open Risk Analysis", to: "/risk" } };
  }

  if (has(q, ["aqi", "pollution", "air", "smog"])) {
    if (needsData) return loading;
    return { text: `The AQI in your area is ${aqi}, which is ${aqiLabel(aqi)}. Pollution cover starts at AQI 250 and is part of the Moderate and Premium plans.` };
  }

  if (has(q, ["heat", "hot", "temperature"])) {
    if (needsData) return loading;
    return { text: `It is ${Number(temp).toFixed(0)}°C right now. Heat cover pays out above 45°C and is part of the Premium plan.` };
  }

  if (has(q, ["risk", "safe", "danger", "work now", "ride", "should i go"])) {
    if (needsData) return loading;
    const why = (data.reason || "").split("|").map(s => s.trim()).filter(Boolean).slice(0, 2);
    return {
      text:
        `Your risk is ${data.risk} right now, and ${data.outlook_risk || data.risk} for the next 6 hours.\n` +
        `${Number(temp).toFixed(0)}°C, rain ${Number(rain).toFixed(1)} mm/h, AQI ${aqi}.` +
        (why.length ? `\nWhy: ${why.join(". ")}.` : ""),
      action: { label: "Open Risk Analysis", to: "/risk" }
    };
  }

  if (has(q, ["support", "contact", "human", "agent"])) {
    return { text: "You can reach support from Settings, under Support.", action: { label: "Open Settings", to: "/settings" } };
  }

  return {
    text: "I can help with your risk, the weather, plans, payouts and the community pool. Try one of the questions below."
  };
}

export function Robot({ width = 84, height = 110 }) {
  return (
    <svg viewBox="0 0 100 130" width={width} height={height} aria-hidden="true">
      <ellipse cx="50" cy="125" rx="26" ry="5" fill="rgba(15,23,42,.2)" />
      <rect x="38" y="98" width="8" height="20" rx="4" fill="#475569" />
      <rect x="54" y="98" width="8" height="20" rx="4" fill="#475569" />
      <rect x="33" y="114" width="16" height="8" rx="4" fill="#1e293b" />
      <rect x="51" y="114" width="16" height="8" rx="4" fill="#1e293b" />
      <rect x="16" y="66" width="10" height="28" rx="5" fill="#818cf8" />
      <g className="zx-bot-wave">
        <rect x="74" y="40" width="10" height="28" rx="5" fill="#818cf8" />
      </g>
      <rect x="28" y="62" width="44" height="42" rx="14" fill="#6366f1" />
      <rect x="38" y="72" width="24" height="16" rx="6" fill="#eef2ff" />
      <circle className="zx-bot-heart" cx="50" cy="80" r="4" fill="#ef4444" />
      <rect x="16" y="28" width="6" height="14" rx="3" fill="#818cf8" />
      <rect x="78" y="28" width="6" height="14" rx="3" fill="#818cf8" />
      <rect x="22" y="14" width="56" height="44" rx="18" fill="#ffffff" stroke="#c7d2fe" strokeWidth="3" />
      <rect x="30" y="24" width="40" height="24" rx="10" fill="#1e1b4b" />
      <ellipse className="zx-bot-eye" cx="42" cy="35" rx="4" ry="5" fill="#67e8f9" />
      <ellipse className="zx-bot-eye" cx="58" cy="35" rx="4" ry="5" fill="#67e8f9" />
      <path d="M43 42 Q50 47 57 42" stroke="#67e8f9" strokeWidth="2" fill="none" strokeLinecap="round" />
      <line x1="50" y1="14" x2="50" y2="6" stroke="#94a3b8" strokeWidth="3" />
      <circle className="zx-bot-led" cx="50" cy="4" r="4" fill="#ef4444" />
    </svg>
  );
}
