/** Shared motion values, so every transition in the app has the same feel. */
export const EASE = [0.22, 1, 0.36, 1];
export const SPRING = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 };

export const rise = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
};

export const stagger = (gap = 0.05, delay = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** Moves a new result into view, so pressing a button at the bottom of a form always shows what happened. */
export const bringIntoView = (ref, delay = 60) =>
  setTimeout(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  }, delay);
