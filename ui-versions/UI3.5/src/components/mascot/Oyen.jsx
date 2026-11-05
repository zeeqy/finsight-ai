import React, { Suspense, lazy, useEffect, useState } from 'react';
import { OYEN_HEAD, OYEN_NAME, OYEN_POSTER, oyen } from '../../lib/oyen';

// three.js and the model load only after the page has painted, in their own chunk
const Oyen3D = lazy(() => import('./Oyen3D'));

const canUseWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
};

/**
 * Oyen on his stage. The still image shows at once; the 3D Oyen fades in over it once loaded.
 * Without WebGL, or before loading, the still image stays, so the page never waits for him.
 */
// className must position the box (e.g. "absolute inset-0" or "relative h-80"): the canvas fills it
export default function Oyen({ greet = true, className = 'relative h-80' }) {
  const [load3D, setLoad3D] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!canUseWebGL()) return undefined;
    const start = () => setLoad3D(true);
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(start, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(start, 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={className}>
      <img
        src={OYEN_POSTER}
        alt=""
        width="360"
        height="774"
        decoding="async"
        className={`absolute inset-0 m-auto h-[92%] w-auto object-contain transition-opacity duration-500 ${ready && !failed ? 'opacity-0' : 'opacity-100'}`}
      />
      {load3D && !failed && (
        <Suspense fallback={null}>
          <div className={`absolute inset-0 transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}>
            <Oyen3D greet={greet} onReady={() => setReady(true)} onError={() => setFailed(true)} />
          </div>
        </Suspense>
      )}
      <button type="button" onClick={() => oyen(Math.random() < 0.5 ? 'wave' : 'hop')} className="sr-only focus:not-sr-only focus:absolute focus:bottom-2 focus:left-1/2 focus:-translate-x-1/2 btn btn-quiet btn-sm">
        Say hello to {OYEN_NAME}
      </button>
    </div>
  );
}

/** Oyen's face, for the advisor chat and small places where a 3D scene would be too much. */
export function OyenAvatar({ size = 'w-9 h-9', className = '' }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full stage overflow-hidden ${size} ${className}`}>
      <img src={OYEN_HEAD} alt="" className="w-[118%] max-w-none h-auto translate-y-[6%]" width="160" height="160" />
    </span>
  );
}
