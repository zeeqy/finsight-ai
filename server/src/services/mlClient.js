/**
 * FinSight AI - ML Service Client
 * Thin fetch wrapper for the internal Python FastAPI ML service.
 * Never throws raw network errors: callers get an MlServiceError they can
 * turn into a clear 503 or a rule-based fallback.
 */

const DEFAULT_TIMEOUT_MS = 5000;

class MlServiceError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = 'MlServiceError';
    this.status = status;
  }
}

function baseUrl() {
  return (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
}

async function request(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new MlServiceError(data?.detail || `ML service responded with ${res.status}.`, 502);
    }
    return data;
  } catch (err) {
    if (err instanceof MlServiceError) throw err;
    if (err.name === 'AbortError') {
      throw new MlServiceError(`ML service timed out after ${timeoutMs}ms.`);
    }
    throw new MlServiceError(`ML service unavailable (${err.message}).`);
  } finally {
    clearTimeout(timer);
  }
}

const mlGet = (path, opts) => request(path, { ...opts, method: 'GET' });
const mlPost = (path, body, opts) => request(path, { ...opts, method: 'POST', body });

/** Returns { online: boolean, models_loaded?, error? } — never throws. */
async function checkMlHealth() {
  try {
    const data = await mlGet('/health', { timeoutMs: 1500 });
    return { online: true, models_loaded: data.models_loaded || {} };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

module.exports = { mlGet, mlPost, checkMlHealth, MlServiceError };
