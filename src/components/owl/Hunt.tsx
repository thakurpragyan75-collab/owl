import { useEffect, useRef, useState } from "react";

export function Flock() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    c.width = 480;
    c.height = 280;
    const owl = { x: 80, y: 140, vx: 0, vy: 0 };
    const moths = Array.from({ length: 18 }, () => ({
      x: 80 + Math.random() * 380,
      y: 20 + Math.random() * 240,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      glow: 0.4 + Math.random() * 0.6,
    }));
    const trees = [40, 140, 260, 380, 450].map((x, i) => ({ x, h: 70 + (i % 3) * 28 }));
    let windX = 0;
    let windY = 0;
    let sc = 0;
    let wing = 0;
    const onMove = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * c.width;
      const my = ((e.clientY - r.top) / r.height) * c.height;
      windX = (mx - owl.x) * 0.004;
      windY = (my - owl.y) * 0.004;
      owl.vx += (mx - owl.x) * 0.012;
      owl.vy += (my - owl.y) * 0.012;
    };
    c.addEventListener("pointermove", onMove);
    const id = window.setInterval(() => {
      wing += 0.28;
      owl.vx *= 0.92;
      owl.vy *= 0.92;
      owl.x = Math.max(24, Math.min(c.width - 24, owl.x + owl.vx));
      owl.y = Math.max(24, Math.min(c.height - 24, owl.y + owl.vy));
      moths.forEach((m) => {
        m.vx += windX * 0.2 + (Math.random() - 0.5) * 0.08;
        m.vy += windY * 0.2 + (Math.random() - 0.5) * 0.08;
        m.vx *= 0.97;
        m.vy *= 0.97;
        m.x += m.vx + Math.sin(wing + m.y) * 0.3;
        m.y += m.vy + Math.cos(wing + m.x) * 0.2;
        if (m.x < 0) m.x = c.width;
        if (m.x > c.width) m.x = 0;
        if (m.y < 0) m.y = c.height;
        if (m.y > c.height) m.y = 0;
        const dx = m.x - owl.x;
        const dy = m.y - owl.y;
        if (dx * dx + dy * dy < 320) {
          sc += 1;
          setScore(sc);
          m.x = c.width - 10;
          m.y = 20 + Math.random() * 240;
          m.glow = 0.5 + Math.random() * 0.5;
        }
      });
      ctx.fillStyle = "#07080b";
      ctx.fillRect(0, 0, c.width, c.height);
      trees.forEach((tr) => {
        ctx.fillStyle = "#12151c";
        ctx.beginPath();
        ctx.moveTo(tr.x, c.height);
        ctx.lineTo(tr.x + 18, c.height - tr.h);
        ctx.lineTo(tr.x + 36, c.height);
        ctx.fill();
      });
      moths.forEach((m) => {
        ctx.beginPath();
        ctx.arc(m.x, m.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(110,200,196,${0.35 + m.glow * 0.5})`;
        ctx.fill();
      });
      ctx.fillStyle = "#c5d0dc";
      ctx.beginPath();
      ctx.ellipse(owl.x, owl.y, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      const flap = Math.sin(wing) * 1.4;
      ctx.fillStyle = "#6ec8c4";
      ctx.beginPath();
      ctx.ellipse(owl.x - 10, owl.y, 14, 5 + flap, -0.4, 0, Math.PI * 2);
      ctx.ellipse(owl.x + 10, owl.y, 14, 5 + flap, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8e6e1";
      ctx.fillRect(owl.x + 10, owl.y - 2, 7, 3);
    }, 16);
    return () => {
      window.clearInterval(id);
      c.removeEventListener("pointermove", onMove);
    };
  }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-3">
      <p className="font-mono text-xs tabular-nums text-muted">Hunt {score} · move — stir the wind</p>
      <canvas ref={canvas} className="max-w-full rounded-md border border-border" />
    </div>
  );
}
