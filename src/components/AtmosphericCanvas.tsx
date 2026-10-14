import React, { useEffect, useRef } from 'react';

interface AtmosphericCanvasProps {
  isPlaying: boolean;
  lightningFlash: number;
  rainType: 'soft' | 'medium' | 'heavy' | 'window';
  rainIntensity: number;
}

interface Raindrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
  width: number;
  depth: number; // 0 = far mist, 1 = mid rain, 2 = near streak
}

interface Splash {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
}

export const AtmosphericCanvas: React.FC<AtmosphericCanvasProps> = ({
  isPlaying,
  lightningFlash,
  rainType,
  rainIntensity,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    // Drop count calibrated to rain type
    const baseCount = rainType === 'soft' ? 120 : rainType === 'heavy' ? 280 : 180;
    const dropCount = Math.floor(baseCount * Math.max(0.4, rainIntensity));

    const drops: Raindrop[] = [];
    for (let i = 0; i < dropCount; i++) {
      const depth = Math.random() < 0.45 ? 0 : Math.random() < 0.85 ? 1 : 2;
      let length = 14;
      let speed = 9;
      let opacity = 0.12;
      let strokeWidth = 0.75;

      if (depth === 0) {
        // Far mist layer
        length = 8 + Math.random() * 8;
        speed = 5.5 + Math.random() * 3.5;
        opacity = 0.07 + Math.random() * 0.08;
        strokeWidth = 0.55;
      } else if (depth === 1) {
        // Midground rain streaks
        length = 18 + Math.random() * 14;
        speed = 12 + Math.random() * 6;
        opacity = 0.16 + Math.random() * 0.12;
        strokeWidth = 0.95;
      } else {
        // Near streaks
        length = 28 + Math.random() * 20;
        speed = 18 + Math.random() * 8;
        opacity = 0.22 + Math.random() * 0.16;
        strokeWidth = 1.35;
      }

      drops.push({
        x: Math.random() * (width + 120) - 60,
        y: Math.random() * height,
        length,
        speed: speed * (rainType === 'heavy' ? 1.25 : rainType === 'soft' ? 0.8 : 1.0),
        opacity,
        width: strokeWidth,
        depth,
      });
    }

    const splashes: Splash[] = [];
    let flashAlpha = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Deep atmospheric night gradient
      const nightVignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.2,
        60,
        width * 0.5,
        height * 0.55,
        Math.max(width, height) * 0.85
      );
      nightVignette.addColorStop(0, 'rgba(10, 14, 24, 0.45)');
      nightVignette.addColorStop(1, 'rgba(5, 7, 12, 0.96)');
      ctx.fillStyle = nightVignette;
      ctx.fillRect(0, 0, width, height);

      // Atmospheric Thunder Lightning Diffusion
      if (lightningFlash > 0 && flashAlpha < lightningFlash) {
        flashAlpha = lightningFlash;
      }
      if (flashAlpha > 0.004) {
        const lightningGrad = ctx.createRadialGradient(
          width * 0.5,
          0,
          10,
          width * 0.5,
          0,
          Math.max(width, height)
        );
        lightningGrad.addColorStop(0, `rgba(180, 205, 255, ${flashAlpha * 0.18})`);
        lightningGrad.addColorStop(0.5, `rgba(120, 150, 220, ${flashAlpha * 0.08})`);
        lightningGrad.addColorStop(1, 'rgba(5, 7, 12, 0)');
        ctx.fillStyle = lightningGrad;
        ctx.fillRect(0, 0, width, height);
        flashAlpha *= 0.88;
      }

      const slant = rainType === 'heavy' ? 2.4 : 1.2;
      const speedMultiplier = isPlaying ? 1.0 : 0.35;

      ctx.lineCap = 'round';

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];

        ctx.lineWidth = d.width;
        ctx.strokeStyle = `rgba(190, 220, 255, ${d.opacity * (isPlaying ? 1.0 : 0.55)})`;

        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + slant, d.y + d.length);
        ctx.stroke();

        d.y += d.speed * speedMultiplier;
        d.x += slant * (d.speed / 12) * speedMultiplier;

        // Bottom rim splash trigger
        if (d.y > height - 8) {
          if (d.depth > 0 && Math.random() < (rainType === 'heavy' ? 0.35 : 0.15)) {
            splashes.push({
              x: d.x,
              y: height - 4 - Math.random() * 4,
              radius: 1,
              maxRadius: 4 + Math.random() * 5,
              opacity: 0.25,
            });
          }
          d.y = -d.length - Math.random() * 30;
          d.x = Math.random() * (width + 120) - 60;
        }

        if (d.x > width + 50) {
          d.x = -50;
        }
      }

      // Render & update bottom puddle splashes
      for (let s = splashes.length - 1; s >= 0; s--) {
        const sp = splashes[s];
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, sp.radius * 2, sp.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180, 215, 255, ${sp.opacity})`;
        ctx.lineWidth = 0.75;
        ctx.stroke();

        sp.radius += 0.45;
        sp.opacity *= 0.86;

        if (sp.radius >= sp.maxRadius || sp.opacity < 0.01) {
          splashes.splice(s, 1);
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, lightningFlash, rainType, rainIntensity]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ display: 'block' }}
    />
  );
};
