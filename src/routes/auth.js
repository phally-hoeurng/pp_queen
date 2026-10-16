const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../ratelimit');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name || !email || password.length < 6) {
      return res.status(400).json({ error: 'Enter name, email and a password of at least 6 characters.' });
    }
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rowCount) return res.status(409).json({ error: 'This email is already registered.' });

    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'customer') RETURNING id,name,email,role",
      [name, email, hash]
    );
    const user = r.rows[0];
    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not register.' });
  }
});

router.post('/login', rateLimit({ windowMs: 10 * 60 * 1000, max: 10, key: (req) => req.ip, message: 'Too many login attempts. Please wait a few minutes.' }), async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash))) {
      return res.status(401).json({ error: 'Wrong email or password.' });
    }
    const user = { id: u.id, name: u.name, email: u.email, role: u.role };
    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not log in.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!r.rowCount) return res.status(401).json({ error: 'Account not found.' });
    res.json({ user: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load account.' });
  }
});

module.exports = router;
