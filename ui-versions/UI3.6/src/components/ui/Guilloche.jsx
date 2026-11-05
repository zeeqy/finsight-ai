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

/*
 * The engraved line drawings behind each module's heading. Every module has its own picture,
 * drawn in the same fine line as banknote security printing. Each takes the band's state:
 * `amp` (0 to 1, from the page's figures), `phase` (pointer and scroll) and `drawn` (the opening sweep).
 */
export const MOTIFS = {
  // Spend Analyser: a woven band that swells with the share of income spent
  wave(ctx, w, h, s, ink) {
    const lines = 24;
    const cy = h / 2;
    const gap = h / (lines * 1.5);
    const swell = h * (0.1 + 0.24 * s.amp);
    const reach = w * s.drawn;
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
      ink(0.32 + 0.4 * (1 - Math.abs(f) * 2));
      ctx.stroke();
    }
  },

  // AI Advisor: sound-wave arcs travelling out from the right edge, like a voice answering.
  // They ripple harder while Oyen is thinking.
  ripples(ctx, w, h, s, ink) {
    const arcs = 26;
    const cx = w * 1.02;
    const cy = h * 0.5;
    const gap = (w * 0.62) / arcs;
    const shown = arcs * s.drawn;
    for (let k = 1; k < shown; k++) {
      const base = k * gap + 8;
      const spread = Math.min(1.25, (h * 0.75) / base + 0.25);
      // Same wavelength along every arc, and calm near the source
      const wobble = gap * (0.08 + 0.32 * s.amp) * Math.min(1, k / 7);
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const t = Math.PI - spread + (i / 120) * spread * 2;
        const r = base + wobble * Math.sin((t * base) / 10 + s.phase * 1.5 - k * 0.7);
        const x = cx + r * Math.cos(t);
        const y = cy + r * Math.sin(t);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ink(0.72 - (k / arcs) * 0.42);
      ctx.stroke();
    }
  },

  // Loan: nested loan balances, each paid down to zero along the real amortisation curve.
  // Bigger loans start higher and take longer; `amp` sets how heavy the interest is.
  balances(ctx, w, h, s, ink) {
    const lines = 20;
    const n = 36;
    const r = 0.02 + 0.05 * s.amp;
    const grow = (1 + r) ** n - 1;
    const base = h * 0.96;
    const reach = w * s.drawn;
    for (let k = 0; k < lines; k++) {
      const f = k / (lines - 1);
      const top = h * (0.08 + 0.62 * f);
      const end = w * (1.02 - 0.5 * f) + s.phase * 14;
      ctx.beginPath();
      for (let x = 0; x <= Math.min(reach, end); x += 5) {
        const u = x / end;
        const balance = (grow - ((1 + r) ** (u * n) - 1)) / grow;
        const y = base - (base - top) * balance;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ink(0.62 - f * 0.34);
      ctx.stroke();
    }
  },

  // Life Goals: a contour map climbing to a summit
  contours(ctx, w, h, s, ink) {
    const loops = 18;
    const cx = w * 0.8 + s.phase * 6;
    const cy = h * 0.6;
    const gap = h * (0.05 + 0.025 * s.amp);
    const shown = loops * s.drawn;
    for (let k = 0; k < shown; k++) {
      const radius = (k + 1) * gap;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const t = (i / 200) * TAU;
        const shape = 1 + 0.18 * Math.sin(3 * t + 1.3) + 0.1 * Math.sin(5 * t + k * 0.25 + 0.4) + 0.05 * Math.sin(2 * t + s.phase);
        const x = cx + radius * shape * Math.cos(t) * 1.7;
        const y = cy + radius * shape * Math.sin(t);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ink(0.7 - (k / loops) * 0.45);
      ctx.stroke();
    }
  },

  // Insurance: a safety net hanging from the top, sagging under its load
  net(ctx, w, h, s, ink) {
    const spacing = 28;
    const sag = h * (0.35 + 0.2 * s.amp);
    const reach = w * s.drawn;
    // Hung from the top edge between the band's two ends, so the middle drops furthest
    const drop = (x, y) => {
      const xc = Math.min(Math.max(x, 0), w);
      return y * 0.75 + sag * Math.sin((Math.PI * xc) / w) * (0.15 + 0.85 * (y / h)) + Math.sin(x * 0.02 + s.phase) * 3 - h * 0.12;
    };
    ink(0.42);
    for (const dir of [1, -1]) {
      for (let x0 = -h; x0 <= w + h; x0 += spacing) {
        ctx.beginPath();
        let started = false;
        for (let y = -10; y <= h + 10; y += 6) {
          const x = x0 + dir * y;
          if (x > reach || x < -spacing) {
            started = false;
            continue;
          }
          if (!started) ctx.moveTo(x, drop(x, y));
          else ctx.lineTo(x, drop(x, y));
          started = true;
        }
        ctx.stroke();
      }
    }
  },

  // Health Check: stacked heartbeat traces, stronger as the health index rises
  pulse(ctx, w, h, s, ink) {
    const lines = 11;
    const scale = 14;
    const period = 190;
    const lift = h * 0.03 * (0.6 + s.amp);
    const bump = (d, at, width) => Math.exp(-(((d - at) / width) ** 2));
    const reach = w * s.drawn;
    for (let k = 0; k < lines; k++) {
      const f = k / (lines - 1);
      const cy = h * 0.1 + f * h * 0.8;
      // A steady rhythm on every trace, each line a little behind the one above
      const offset = f * period * 0.7 + s.phase * 24;
      ctx.beginPath();
      for (let x = 0; x <= reach; x += 2) {
        const d = ((((x - offset) % period) + period) % period - period / 2) / scale;
        const beat = 0.15 * bump(d, -2.2, 0.35) - 0.15 * bump(d, -0.35, 0.12) + bump(d, 0, 0.12) - 0.3 * bump(d, 0.3, 0.12) + 0.3 * bump(d, 1.6, 0.5);
        const y = cy - lift * 3 * beat;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ink(0.3 + 0.42 * (1 - Math.abs(f - 0.5) * 2));
      ctx.stroke();
    }
  },
};

/** Which drawing each module's heading uses */
export const MODULE_MOTIF = {
  dashboard: 'wave',
  advisor: 'ripples',
  loan: 'balances',
  goals: 'contours',
  insurance: 'net',
  health: 'pulse',
};

/**
 * The engraved band behind the main page heading. It only moves in answer to something:
 * the page opening, the pointer, scrolling, or `energy` (0 to 1) changing with the data.
 * On the Spend Analyser the swell follows the share of income spent.
 */
export function Band({ motif = 'wave', energy = 0.5, className = '' }) {
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
    const colour = inkColour(canvas);
    const ink = (alpha) => {
      ctx.strokeStyle = `rgb(${colour} / ${alpha})`;
    };
    const drawMotif = MOTIFS[motif] || MOTIFS.wave;
    const s = state.current;
    const still = reducedMotion();
    const start = performance.now();
    let raf = 0;

    const draw = () => {
      const { w, h } = size.current;
      if (!w) return;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 0.7;
      drawMotif(ctx, w, h, s, ink);
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
  }, [motif]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}

