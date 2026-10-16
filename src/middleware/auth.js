const jwt = require('jsonwebtoken');
const pool = require('../db');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    SECRET(),
    { expiresIn: '7d' }
  );
}

// Must be logged in
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in.' });
  try {
    req.user = jwt.verify(token, SECRET());
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

// Logged in if a valid token is sent, otherwise carries on as a guest
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, SECRET()); } catch (err) { /* old token: treat as guest */ }
  }
  next();
}

// Must be logged in AND role = admin
async function requireAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    try {
      // Always check the current database role. This prevents an old JWT
      // from hiding/revealing admin access after a role change.
      const r = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id = $1',
        [req.user.id]
      );
      const user = r.rows[0];
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only.' });
      }
      req.user = user;
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not verify admin role.' });
    }
  });
}

module.exports = { signToken, requireAuth, optionalAuth, requireAdmin };
