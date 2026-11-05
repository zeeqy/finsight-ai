/**
 * Slows down password guessing on /api/auth/login. Only failed sign-ins count, so a user who signs
 * in correctly is never blocked. Two limits over a sliding window (default 15 minutes):
 *   - per email address from one IP (default 5 failures), and
 *   - per IP across all emails (default 30 failures), so one machine cannot try many accounts.
 * In memory: enough for one server; a cluster would need a shared store such as Redis.
 */

const WINDOW_MS = (parseFloat(process.env.LOGIN_WINDOW_MINUTES) || 15) * 60 * 1000;
const MAX_PER_ACCOUNT = parseInt(process.env.LOGIN_MAX_FAILURES, 10) || 5;
const MAX_PER_IP = parseInt(process.env.LOGIN_MAX_FAILURES_PER_IP, 10) || 30;

const failures = new Map(); // key -> array of failure times (ms)

function recent(key, now) {
  const list = (failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

const keysFor = (req) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const email = String(req.body?.email || '').trim().toLowerCase();
  return { account: `acct|${ip}|${email}`, ip: `ip|${ip}` };
};

/** Middleware: refuses the request with 429 while either limit is reached. */
function loginLimiter(req, res, next) {
  const now = Date.now();
  const { account, ip } = keysFor(req);
  const acct = recent(account, now);
  const all = recent(ip, now);
  const blocked = acct.length >= MAX_PER_ACCOUNT ? acct : all.length >= MAX_PER_IP ? all : null;
  if (blocked) {
    const waitMs = WINDOW_MS - (now - blocked[0]);
    const minutes = Math.max(1, Math.ceil(waitMs / 60000));
    res.set('Retry-After', String(Math.ceil(waitMs / 1000)));
    return res.status(429).json({
      success: false,
      code: 'TOO_MANY_ATTEMPTS',
      message: `Too many sign-in attempts. Wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
    });
  }
  next();
}

/** Call after a wrong email or password. */
function recordLoginFailure(req) {
  const now = Date.now();
  const { account, ip } = keysFor(req);
  for (const key of [account, ip]) failures.set(key, [...recent(key, now), now]);
}

/** Call after a successful sign-in: that account's failures are forgotten. */
function clearLoginFailures(req) {
  failures.delete(keysFor(req).account);
}

module.exports = { loginLimiter, recordLoginFailure, clearLoginFailures, _failures: failures };
