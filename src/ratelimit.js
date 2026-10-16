// Tiny in-memory rate limiter (no extra packages). Protects the public
// endpoints (guest orders, chat, uploads) from spam.
const hits = new Map();

function rateLimit({ windowMs, max, key, message }) {
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const recent = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: message || 'Too many requests. Please wait a moment.' });
    }
    recent.push(now);
    hits.set(k, recent);
    next();
  };
}

// forget old entries now and then so memory does not grow
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) {
    if (!arr.length || now - arr[arr.length - 1] > 60 * 60 * 1000) hits.delete(k);
  }
}, 10 * 60 * 1000).unref();

module.exports = { rateLimit };
