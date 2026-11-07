/**
 * Per-user limits on the heavy requests (statement uploads, model checks), so one account cannot keep
 * a small server busy for everyone else. Counted per signed-in user over a rolling hour, in memory like
 * the login and sign-up limits (one server). Use after authenticateToken.
 *   UPLOAD_HOURLY_LIMIT  uploads and PDF previews per user per hour (default 30 in production)
 *   CHECK_HOURLY_LIMIT   loan, insurance, protection, quote, debt-plan and decision checks together
 *                        (default 120 in production)
 * Both are off (0) outside production unless set, because the test suites make many requests.
 */

const { isProduction } = require('./security');

const WINDOW_MS = 60 * 60 * 1000;

function makeUserLimiter({ envVar, productionMax, code, what }) {
  const envMax = parseInt(process.env[envVar], 10);
  const max = Number.isInteger(envMax) ? envMax : isProduction ? productionMax : 0;
  const hits = new Map(); // user id -> request times (ms), oldest first

  return function userLimiter(req, res, next) {
    if (!max || !req.user) return next();
    const now = Date.now();
    const key = String(req.user.id);
    const list = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
    if (list.length >= max) {
      hits.set(key, list);
      const waitMs = WINDOW_MS - (now - list[0]);
      const minutes = Math.max(1, Math.ceil(waitMs / 60000));
      res.set('Retry-After', String(Math.ceil(waitMs / 1000)));
      return res.status(429).json({
        success: false,
        code,
        message: `You have reached the limit of ${max} ${what} an hour. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      });
    }
    list.push(now);
    hits.set(key, list);
    // Drop users with no recent requests now and then, so the map does not grow forever
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= WINDOW_MS) hits.delete(k);
    next();
  };
}

const uploadLimiter = makeUserLimiter({ envVar: 'UPLOAD_HOURLY_LIMIT', productionMax: 30, code: 'UPLOAD_LIMIT', what: 'statement uploads' });
const checkLimiter = makeUserLimiter({ envVar: 'CHECK_HOURLY_LIMIT', productionMax: 120, code: 'CHECK_LIMIT', what: 'checks' });

module.exports = { uploadLimiter, checkLimiter, makeUserLimiter };
