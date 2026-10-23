import { useEffect, useRef } from "react";

// Full-screen rain. intensity: 0 to 1. storm: adds lightning flashes.
// Sits on top of the page but never blocks clicks.
export default function RainCanvas({ intensity = 0.5, storm = false }) {
  const canvasRef = useRef(null);
  const intensityRef = useRef(intensity);
  const stormRef = useRef(storm);

  intensityRef.current = intensity;
  stormRef.current = storm;

  useEffect(() => {
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const SLANT = 0.18; // how far drops lean with the wind

    let w = 0;
    let h = 0;
    let raf = 0;
    let flash = 0;
    let nextFlash = performance.now() + 4000 + Math.random() * 6000;
    const drops = [];
    const splashes = [];

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function makeDrop(anywhere) {
      return {
        x: Math.random() * (w + h * SLANT),
        y: anywhere ? Math.random() * h : -30 - Math.random() * 200,
        len: 10 + Math.random() * 18,
        speed: 13 + Math.random() * 11,
        alpha: 0.25 + Math.random() * 0.45
      };
    }

    resize();
    window.addEventListener("resize", resize);

    function frame(now) {
      ctx.clearRect(0, 0, w, h);

      const wanted = Math.round(70 + 330 * Math.min(1, intensityRef.current));
      while (drops.length < wanted) drops.push(makeDrop(true));
      if (drops.length > wanted) drops.length = wanted;

      ctx.lineCap = "round";
      ctx.lineWidth = 1.3;

      for (let i = 0; i < drops.length; i += 1) {
        const d = drops[i];
        ctx.strokeStyle = `rgba(125,180,255,${d.alpha})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * SLANT, d.y - d.len);
        ctx.stroke();

        d.y += d.speed;
        d.x -= d.speed * SLANT;

        if (d.y > h) {
          if (splashes.length < 45 && Math.random() < 0.35) {
            splashes.push({ x: d.x, y: h - 2, r: 1, life: 1 });
          }
          drops[i] = makeDrop(false);
        }
      }

      for (let i = splashes.length - 1; i >= 0; i -= 1) {
        const s = splashes[i];
        ctx.strokeStyle = `rgba(160,200,255,${s.life * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.r * 2.2, s.r * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();
        s.r += 0.6;
        s.life -= 0.045;
        if (s.life <= 0) splashes.splice(i, 1);
      }

      if (stormRef.current) {
        if (now > nextFlash) {
          flash = 1;
          nextFlash = now + 5000 + Math.random() * 9000;
        }
        if (flash > 0.02) {
          ctx.fillStyle = `rgba(220,230,255,${flash * 0.22})`;
          ctx.fillRect(0, 0, w, h);
          flash *= 0.88;
        }
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 40
      }}
    />
  );
}
