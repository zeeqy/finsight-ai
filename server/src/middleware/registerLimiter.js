/**
 * Limits how many accounts one IP address can create, so a script cannot fill the database with
 * sign-ups. Only successful sign-ups count. In memory, like the login limit (one server).
 *   REGISTER_MAX_PER_IP      accounts per window (default 5 in production, 0 = off in development,
 *                            where the test suites create many accounts from localhost)
 *   REGISTER_WINDOW_MINUTES  window length (default 60)
 */

const { isProduction } = require('./security');

const WINDOW_MS = (parseFloat(process.env.REGISTER_WINDOW_MINUTES) || 60) * 60 * 1000;
const envMax = parseInt(process.env.REGISTER_MAX_PER_IP, 10);
const MAX_PER_IP = Number.isInteger(envMax) ? envMax : isProduction ? 5 : 0;

const signups = new Map(); // ip -> array of sign-up times (ms)

const ipOf = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

function recent(ip, now) {
  const list = (signups.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) signups.set(ip, list);
  else signups.delete(ip);
  return list;
}

function registerLimiter(req, res, next) {
  if (!MAX_PER_IP) return next();
  const now = Date.now();
  const list = recent(ipOf(req), now);
  if (list.length >= MAX_PER_IP) {
    const waitMs = WINDOW_MS - (now - list[0]);
    const minutes = Math.max(1, Math.ceil(waitMs / 60000));
    res.set('Retry-After', String(Math.ceil(waitMs / 1000)));
    return res.status(429).json({
      success: false,
      code: 'TOO_MANY_SIGNUPS',
      message: `Too many new accounts from this network. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    });
  }
  next();
}

function recordSignup(req) {
  if (!MAX_PER_IP) return;
  const ip = ipOf(req);
  signups.set(ip, [...recent(ip, Date.now()), Date.now()]);
}

module.exports = { registerLimiter, recordSignup };
