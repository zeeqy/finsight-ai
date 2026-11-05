/**
 * FinSight AI - settings that matter once the app is on the public internet.
 *
 *   isProduction      NODE_ENV=production
 *   trustProxySetting how many reverse proxies sit in front of Express (Caddy = 1). Without it every
 *                     visitor has the proxy's IP, and the login and sign-up limits would block everyone at once.
 *   corsOptions       development: any localhost origin; production: only CORS_ORIGIN (comma-separated)
 *   securityHeaders   no-sniff, no framing, referrer and permissions policy, HSTS and a Content-Security-Policy
 *                     in production. The CSP allows the inline theme script in index.html by its hash.
 */

const crypto = require('crypto');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';

function trustProxySetting() {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === '') return isProduction ? 1 : false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  return Number.isInteger(n) ? n : raw; // a number of hops, or an Express preset such as 'loopback'
}

function allowedOrigins() {
  return String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // same-origin GETs, curl, server-to-server
    const allowed = allowedOrigins();
    if (allowed.includes(origin)) return callback(null, true);
    if (!isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    return callback(null, false); // no CORS headers: the browser blocks the other site's request
  },
};

/** sha256 hashes of the inline <script> blocks in the built index.html, for the CSP. */
function inlineScriptHashes(indexHtmlPath) {
  try {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    const hashes = [];
    for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      if (!match[1].trim()) continue;
      hashes.push(`'sha256-${crypto.createHash('sha256').update(match[1]).digest('base64')}'`);
    }
    return hashes;
  } catch {
    return [];
  }
}

function contentSecurityPolicy(indexHtmlPath) {
  const scripts = ["'self'", "'wasm-unsafe-eval'", ...inlineScriptHashes(indexHtmlPath)]; // wasm: the 3D model's mesh decoder
  return [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'", // motion and charts set inline styles
    "img-src 'self' data: blob:",
    "font-src 'self' data:", // Vite inlines small font files as data: URLs
    "connect-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function securityHeaders({ indexHtmlPath } = {}) {
  const csp = isProduction ? contentSecurityPolicy(indexHtmlPath) : null;
  return (req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    if (isProduction) {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.set('Content-Security-Policy', csp);
    }
    next();
  };
}

module.exports = { isProduction, trustProxySetting, corsOptions, securityHeaders, inlineScriptHashes };
