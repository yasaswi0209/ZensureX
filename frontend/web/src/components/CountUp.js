import { useEffect, useRef, useState } from "react";

// Counts from the previous value to the new one. Respects reduced motion.
export default function CountUp({ value, prefix = "", suffix = "", decimals = 0, duration = 900 }) {
  const [shown, setShown] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const target = Number(value) || 0;
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      current.current = target;
      setShown(target);
      return undefined;
    }

    const from = current.current;
    const start = performance.now();
    let raf = 0;

    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * eased;
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const text = Number(shown).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  return (
    <>
      {prefix}
      {text}
      {suffix}
    </>
  );
}
