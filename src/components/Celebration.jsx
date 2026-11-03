import React, { useEffect, useRef } from 'react';

// 对赌达成时的全屏礼花：三组抛物线爆点，颜色跟随当前主题色
function accentColor() {
  const el = document.querySelector('.app') || document.documentElement;
  const value = getComputedStyle(el).getPropertyValue('--accent').trim();
  return value || '#ffd75e';
}

export default function Celebration({ trigger, onDone }) {
  const canvasRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!trigger) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const dpr = window.devicePixelRatio || 1;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const accent = accentColor();
    const palette = [accent, accent, '#ffffff', '#ffe9a3', '#ff9ec4', '#8fd7ff'];
    const bursts = [
      { x: width * 0.22, y: height * 0.34, at: 0, fired: false },
      { x: width * 0.5, y: height * 0.24, at: 0.22, fired: false },
      { x: width * 0.78, y: height * 0.36, at: 0.44, fired: false }
    ];
    const particles = [];

    const spawn = (burst) => {
      for (let i = 0; i < 76; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.6 + Math.random() * 5.4;
        particles.push({
          x: burst.x,
          y: burst.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          life: 1.15 + Math.random() * 1.05,
          size: 1.4 + Math.random() * 2.2,
          color: palette[Math.floor(Math.random() * palette.length)]
        });
      }
    };

    let raf = 0;
    let started = 0;
    let last = 0;

    const frame = (now) => {
      if (!started) {
        started = now;
        last = now;
      }
      const elapsed = (now - started) / 1000;
      const dt = Math.min(2.4, (now - last) / 16.67);
      last = now;

      bursts.forEach((burst) => {
        if (!burst.fired && elapsed >= burst.at) {
          burst.fired = true;
          spawn(burst);
        }
      });

      ctx.clearRect(0, 0, width, height);
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.age += dt / 60;
        if (p.age >= p.life) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.055 * dt;
        p.vx *= 0.991;
        p.vy *= 0.991;
        const fade = 1 - p.age / p.life;
        ctx.globalAlpha = Math.max(0, fade);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.6, p.size * fade);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.6, p.y - p.vy * 2.6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (elapsed < 3.1) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
        if (doneRef.current) doneRef.current();
      }
    };

    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [trigger]);

  if (!trigger) return null;
  return <canvas ref={canvasRef} className="celebration-canvas" aria-hidden="true" />;
}
