import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

const TAU = Math.PI * 2;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const inkColour = (el) => getComputedStyle(el).getPropertyValue('--guilloche').trim() || '33 27 8';

/** Sizes the canvas to its box at up to 2x pixel density and redraws on resize. */
function useCanvas(ref, onResize) {
  useEffect(() => {
    const canvas = ref.current;
    const fit = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      onResize(box.width, box.height);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [ref, onResize]);
}

/**
 * The engraved rosette on the sign-in screens: closed curves like the fine-line
 * security printing on banknotes. It draws itself once, then drifts and leans toward the
 * cursor. It runs for longer than 5 seconds, so it carries a visible pause control.
 */
export function Rosette({ className = '' }) {
  const canvasRef = useRef(null);
  const size = useRef({ w: 0, h: 0 });
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const redraw = useRef(() => {});

  useCanvas(
    canvasRef,
    useCallback((w, h) => {
      size.current = { w, h };
      redraw.current();
    }, [])
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ink = inkColour(canvas);
    const still = reducedMotion();
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let raf = 0;
    let visible = true;
    let clock = 8;
    let last = performance.now();
    const start = last;

    const draw = (time, progress) => {
      const { w, h } = size.current;
      if (!w) return;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.3;
      const curves = w < 500 ? 30 : 44;
      const steps = w < 500 ? 480 : 720;
      ctx.lineWidth = 0.6;

      for (let c = 0; c < curves; c++) {
        const f = c / curves;
        const shown = Math.min(1, Math.max(0, progress * 1.5 - f * 0.5));
        if (shown <= 0) continue;
        const phase = f * TAU + time * 0.05;
        const swell = radius * (0.2 + 0.05 * Math.sin(time * 0.13 + f * TAU) + pointer.x * 0.04);
        const ripple = radius * (0.055 + pointer.y * 0.02);
        ctx.beginPath();
        for (let i = 0; i <= steps * shown; i++) {
          const t = (i / steps) * TAU;
          const r = radius * (0.72 + f * 0.95) + swell * Math.sin(12 * t + phase) + ripple * Math.sin(36 * t - phase * 3);
          const x = cx + r * Math.cos(t) + pointer.x * radius * 0.1 * f;
          const y = cy + r * Math.sin(t) + pointer.y * radius * 0.1 * f;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgb(${ink} / ${0.16 + 0.26 * (1 - f)})`;
        ctx.stroke();
      }
    };

    redraw.current = () => draw(clock, still ? 1 : Math.min(1, (performance.now() - start) / 2200));

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      if (now - last < 30) return;
      last = now;
      if (!visible || document.hidden || pausedRef.current) return;
      clock += dt;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      draw(clock, Math.min(1, (now - start) / 2200));
    };

    const onMove = (e) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(canvas);

    if (still) {
      draw(clock, 1);
    } else {
      window.addEventListener('pointermove', onMove, { passive: true });
      raf = requestAnimationFrame(frame);
    }
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className={className} />
      <button
        type="button"
        onClick={togglePause}
        className="btn btn-icon absolute right-3 bottom-3 z-20"
        aria-label={paused ? 'Play background animation' : 'Pause background animation'}
      >
        {paused ? <Play className="w-4 h-4" aria-hidden="true" /> : <Pause className="w-4 h-4" aria-hidden="true" />}
      </button>
    </>
  );
}

/**
 * The engraved band behind the main page heading. It only moves in answer to something:
 * the page opening, the pointer, scrolling, or `energy` (0 to 1) changing with the data.
 * On the Spend Analyser the swell follows the share of income spent.
 */
export function Band({ energy = 0.5, className = '' }) {
  const canvasRef = useRef(null);
  const size = useRef({ w: 0, h: 0 });
  const state = useRef({ amp: 0.2, targetAmp: energy, phase: 0, targetPhase: 0, drawn: 0, wake: () => {} });

  useEffect(() => {
    state.current.targetAmp = energy;
    state.current.wake();
  }, [energy]);

  useCanvas(
    canvasRef,
    useCallback((w, h) => {
      size.current = { w, h };
      // Resizing clears a canvas, so repaint straight away instead of waiting for the next frame
      state.current.paint?.();
      state.current.wake();
    }, [])
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ink = inkColour(canvas);
    const s = state.current;
    const still = reducedMotion();
    const start = performance.now();
    let raf = 0;

    const draw = () => {
      const { w, h } = size.current;
      if (!w) return;
      ctx.clearRect(0, 0, w, h);
      const lines = 24;
      const cy = h / 2;
      const gap = h / (lines * 1.5);
      const swell = h * (0.1 + 0.24 * s.amp);
      const reach = w * s.drawn;
      ctx.lineWidth = 0.7;
      for (let k = 0; k < lines; k++) {
        const f = k / (lines - 1) - 0.5;
        ctx.beginPath();
        for (let x = 0; x <= reach; x += 6) {
          const u = x / w;
          const pinch = 0.5 + 0.5 * Math.cos(u * 9 + s.phase * 0.5);
          const y =
            cy +
            f * gap * lines * (0.3 + pinch) +
            swell * Math.sin(u * 7.5 + s.phase + f * 1.4) +
            swell * 0.34 * Math.sin(u * 19 - s.phase * 1.3 - f * 2);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgb(${ink} / ${0.32 + 0.4 * (1 - Math.abs(f) * 2)})`;
        ctx.stroke();
      }
    };

    s.paint = draw;

    // Runs only until the band has settled, so an idle page costs nothing
    const frame = () => {
      s.amp += (s.targetAmp - s.amp) * 0.07;
      s.phase += (s.targetPhase - s.phase) * 0.1;
      // Clock-based, so the opening sweep takes the same time on a slow machine
      const sweep = Math.min(1, (performance.now() - start) / 1300);
      s.drawn = 1 - (1 - sweep) ** 3;
      draw();
      const settled = Math.abs(s.targetAmp - s.amp) < 0.002 && Math.abs(s.targetPhase - s.phase) < 0.002 && s.drawn >= 1;
      raf = settled ? 0 : requestAnimationFrame(frame);
    };

    s.wake = () => {
      if (still) {
        s.amp = s.targetAmp;
        s.drawn = 1;
        draw();
      } else if (!raf) {
        raf = requestAnimationFrame(frame);
      }
    };

    const onScroll = () => {
      s.targetPhase = window.scrollY * 0.004 + (s.pointer || 0);
      s.wake();
    };
    const onMove = (e) => {
      s.pointer = (e.clientX / window.innerWidth - 0.5) * 0.9;
      onScroll();
    };
    if (!still) {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('pointermove', onMove, { passive: true });
    }
    s.wake();
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      s.wake = () => {};
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
