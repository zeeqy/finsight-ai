import React, { useEffect, useRef } from 'react';
import { MOTIFS, MODULE_MOTIF } from './ui/Guilloche';
import { useTheme } from '../context/ThemeContext';

// Drawn bigger than the header bands, so the lines read as texture behind the glass, not as detail
const SCALE = 1.7;

/**
 * The page background behind the glass cards: soft colour light (CSS, in index.css) and a large,
 * faint copy of the current module's line drawing. The drawing is painted once per module, theme or
 * window size and never animates, so an open page costs nothing and scrolling stays smooth.
 */
export default function Backdrop({ module }) {
  const canvasRef = useRef(null);
  const { resolved, glass } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !glass) return undefined;
    const motif = MOTIFS[MODULE_MOTIF[module] || 'wave'];
    let frame = 0;

    const paint = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr * SCALE, 0, 0, dpr * SCALE, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      const colour = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1D5FC4';
      ctx.strokeStyle = colour;
      const ink = (alpha) => {
        ctx.globalAlpha = Math.min(1, alpha * 1.3);
      };
      motif(ctx, w / SCALE, h / SCALE, { amp: 0.5, phase: 0, drawn: 1 }, ink);
    };

    // After the module's accent colour has been applied to the page
    frame = requestAnimationFrame(paint);
    let timer = 0;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(paint, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [module, resolved, glass]);

  return (
    <div className="backdrop" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
