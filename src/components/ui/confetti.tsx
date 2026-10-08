"use client";

import * as React from "react";

/**
 * Milestone confetti, ported from HackMatrix. A single canvas listens for a
 * window event so any component can celebrate without prop-drilling. Skipped
 * entirely under prefers-reduced-motion, and the animation loop only runs
 * while particles exist.
 */

const EVENT = "fee-nance:confetti";

// Brand orange, violet, green, amber, blue — the chart palette.
const COLORS = ["#fc5000", "#524ae9", "#067a5e", "#fdb022", "#175cd3", "#3ccb9a"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  round: boolean;
  alpha: number;
}

export function celebrate(count = 80) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { count } }));
}

export function ConfettiCanvas() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let particles: Particle[] = [];
    let frame = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles = particles.filter((p) => p.alpha > 0 && p.y < canvas.height + 20);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.22;
        p.vx *= 0.98;
        p.rotation += p.spin;
        p.alpha -= 0.008;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
        }
        ctx.restore();
      }

      frame = particles.length ? requestAnimationFrame(render) : 0;
    };

    const onCelebrate = (event: Event) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const count = (event as CustomEvent<{ count: number }>).detail?.count ?? 80;
      const originX = canvas.width / 2;
      const originY = canvas.height * 0.35;

      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 9 + 4;
        particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 5,
          size: Math.random() * 6 + 4,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
          rotation: Math.random() * 360,
          spin: (Math.random() - 0.5) * 15,
          round: Math.random() < 0.4,
          alpha: 1,
        });
      }

      if (!frame) render();
    };

    window.addEventListener("resize", resize);
    window.addEventListener(EVENT, onCelebrate);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener(EVENT, onCelebrate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full print:hidden"
    />
  );
}
