/**
 * Intelligent Oyen, FinSight's mascot and the face of the AI advisor. Any page can make him react
 * without importing three.js: oyen('hop') sends a window event that the 3D Oyen (if on screen) plays.
 *   wave  - hello (sign-in, a click)
 *   hop   - something good happened (import done, goal on track, a healthy result)
 *   think - the advisor is writing a reply
 *   worry - a result needs care (risky verdict, overspending)
 *   idle  - back to normal
 */
export const OYEN_EVENT = 'finsight:oyen';

export function oyen(action) {
  window.dispatchEvent(new CustomEvent(OYEN_EVENT, { detail: { action } }));
}

export const OYEN_NAME = 'Intelligent Oyen';
export const OYEN_HEAD = '/mascot/oyen-head.webp';
export const OYEN_POSTER = '/mascot/oyen-poster.webp';
