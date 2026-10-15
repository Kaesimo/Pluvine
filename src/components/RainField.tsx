/**
 * RainField — the animated rain background.
 *
 * Three depth planes of falling streaks with bottom splashes and a lightning
 * diffusion on thunder strikes. One requestAnimationFrame loop for the whole
 * session: playback state and flashes are read through refs, so no React state
 * change ever re-seeds the rain. Respects prefers-reduced-motion by painting a
 * single static frame (no motion, no flashes).
 */

import { useEffect, useRef } from 'react';

export interface LightningFlash {
  seq: number; // increments per strike so repeated equal intensities register
  intensity: number;
}

interface Props {
  playing: boolean;
  flash: LightningFlash;
}

interface Drop {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
  width: number;
  depth: 0 | 1 | 2;
}

interface Splash {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
}

export function RainField({ playing, flash }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playingRef = useRef(playing);
  const flashRef = useRef(flash);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    flashRef.current = flash;
  }, [flash]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let drops: Drop[] = [];
    let splashes: Splash[] = [];
    let flashAlpha = 0;
    let lastFlashSeq = flashRef.current.seq;
    let animId = 0;

    const seed = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;

      const count = Math.round(240 * Math.min(1, Math.max(0.5, width / 1280)));
      drops = [];
      for (let i = 0; i < count; i++) {
        const depth: Drop['depth'] =
          Math.random() < 0.45 ? 0 : Math.random() < 0.85 ? 1 : 2;
        let length: number;
        let speed: number;
        let opacity: number;
        let strokeWidth: number;

        if (depth === 0) {
          length = 8 + Math.random() * 8;
          speed = 5.5 + Math.random() * 3.5;
          opacity = 0.06 + Math.random() * 0.07;
          strokeWidth = 0.6;
        } else if (depth === 1) {
          length = 18 + Math.random() * 14;
          speed = 12 + Math.random() * 6;
          opacity = 0.13 + Math.random() * 0.1;
          strokeWidth = 0.9;
        } else {
          length = 28 + Math.random() * 20;
          speed = 18 + Math.random() * 8;
          opacity = 0.18 + Math.random() * 0.13;
          strokeWidth = 1.3;
        }

        drops.push({
          x: Math.random() * (width + 120) - 60,
          y: Math.random() * height,
          length,
          speed,
          opacity,
          width: strokeWidth,
          depth,
        });
      }
      splashes = [];
    };

    const paintBackdrop = () => {
      const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.18,
        60,
        width * 0.5,
        height * 0.55,
        Math.max(width, height) * 0.85
      );
      vignette.addColorStop(0, 'rgba(10, 15, 24, 0.42)');
      vignette.addColorStop(1, 'rgba(5, 7, 12, 0.97)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    const paintFlash = () => {
      if (flashAlpha <= 0.004) return;
      const grad = ctx.createRadialGradient(
        width * 0.5,
        0,
        10,
        width * 0.5,
        0,
        Math.max(width, height)
      );
      grad.addColorStop(0, `rgba(180, 205, 255, ${flashAlpha * 0.18})`);
      grad.addColorStop(0.5, `rgba(120, 150, 220, ${flashAlpha * 0.08})`);
      grad.addColorStop(1, 'rgba(5, 7, 12, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      flashAlpha *= 0.9;
    };

    const step = (advance: boolean) => {
      const active = playingRef.current;
      const slant = 1.6;
      const speedFactor = active ? 1 : 0.35;
      const opacityFactor = active ? 1 : 0.6;

      ctx.clearRect(0, 0, width, height);
      paintBackdrop();

      // adopt a new strike
      const f = flashRef.current;
      if (f.seq !== lastFlashSeq) {
        lastFlashSeq = f.seq;
        flashAlpha = Math.max(flashAlpha, f.intensity);
      }
      paintFlash();

      ctx.lineCap = 'round';
      for (const d of drops) {
        ctx.lineWidth = d.width;
        ctx.strokeStyle = `rgba(190, 220, 255, ${d.opacity * opacityFactor})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + slant, d.y + d.length);
        ctx.stroke();

        if (!advance) continue;

        d.y += d.speed * speedFactor;
        d.x += slant * (d.speed / 12) * speedFactor;

        if (d.y > height - 8) {
          if (d.depth > 0 && Math.random() < 0.18 && splashes.length < 60) {
            splashes.push({
              x: d.x,
              y: height - 4 - Math.random() * 4,
              radius: 1,
              maxRadius: 4 + Math.random() * 5,
              opacity: 0.22,
            });
          }
          d.y = -d.length - Math.random() * 30;
          d.x = Math.random() * (width + 120) - 60;
        }
        if (d.x > width + 50) d.x = -50;
      }

      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.radius * 2, s.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180, 215, 255, ${s.opacity})`;
        ctx.lineWidth = 0.75;
        ctx.stroke();

        if (advance) {
          s.radius += 0.45;
          s.opacity *= 0.86;
          if (s.radius >= s.maxRadius || s.opacity < 0.01) splashes.splice(i, 1);
        }
      }
    };

    const render = () => {
      step(true);
      animId = requestAnimationFrame(render);
    };

    const onResize = () => {
      seed();
      if (reduceMotion) step(false);
    };

    seed();

    if (reduceMotion) {
      step(false); // one static frame, no loop, no flash animation
    } else {
      render();
    }

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 block pointer-events-none"
    />
  );
}
