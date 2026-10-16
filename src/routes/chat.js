const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sendTelegram, esc } = require('../telegram');
const { rateLimit } = require('../ratelimit');

const router = express.Router();
const TOKEN_RE = /^[a-f0-9]{32}$/;
const clip = (v, n) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, n);

// ---------- Customer (no login, identified by a random token in the browser) ----------

function chatToken(req, res, next) {
  const t = String(req.headers['x-chat-token'] || '');
  if (!TOKEN_RE.test(t)) return res.status(400).json({ error: 'Chat is not ready. Please reload the page.' });
  req.chatToken = t;
  next();
}

// Telegram alert for a customer message (at most once a minute per chat)
const notified = new Map();
function alertAdmin(chat, body) {
  const now = Date.now();
  if (!chat.created && now - (notified.get(chat.id) || 0) < 60 * 1000) return;
  notified.set(chat.id, now);
  sendTelegram(
    '💬 <b>New chat message</b>\nFrom: ' + esc(chat.customer_name || 'Guest') + '\n' +
    esc(body.slice(0, 300)) + '\n\nReply in Admin > Chat.'
  );
}

router.get('/messages', chatToken, async (req, res) => {
  try {
    const after = parseInt(req.query.after, 10) || 0;
    const c = await pool.query('SELECT id FROM chats WHERE token = $1', [req.chatToken]);
    if (!c.rowCount) return res.json({ messages: [] });
    const m = await pool.query(
      'SELECT id, sender, body, created_at FROM chat_messages WHERE chat_id = $1 AND id > $2 ORDER BY id LIMIT 200',
      [c.rows[0].id, after]
    );
    if (req.query.read === '1') await pool.query('UPDATE chats SET customer_unread = 0 WHERE id = $1', [c.rows[0].id]);
    res.json({ messages: m.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load messages.' });
  }
});

router.post(
  '/messages',
  chatToken,
  rateLimit({ windowMs: 60 * 1000, max: 20, key: (req) => 'chat:' + req.chatToken, message: 'Too many messages. Please wait a moment.' }),
  rateLimit({ windowMs: 60 * 1000, max: 60, key: (req) => 'chatip:' + req.ip, message: 'Too many messages. Please wait a moment.' }),
  async (req, res) => {
    try {
      const body = clip(req.body && req.body.body, 1000);
      const name = clip(req.body && req.body.name, 60);
      if (!body) return res.status(400).json({ error: 'Write a message first.' });

      const c = await pool.query(
        `INSERT INTO chats (token, customer_name, admin_unread, customer_unread, last_message_at)
         VALUES ($1, $2, 1, 0, NOW())
         ON CONFLICT (token) DO UPDATE SET
           admin_unread = chats.admin_unread + 1,
           customer_unread = 0,
           last_message_at = NOW(),
           customer_name = CASE WHEN EXCLUDED.customer_name <> '' THEN EXCLUDED.customer_name ELSE chats.customer_name END
         RETURNING id, customer_name, (xmax = 0) AS created`,
        [req.chatToken, name]
      );
      const chat = c.rows[0];
      const m = await pool.query(
        "INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1, 'customer', $2) RETURNING id, sender, body, created_at",
        [chat.id, body]
      );
      alertAdmin(chat, body);
      res.status(201).json(m.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not send message.' });
    }
  }
);

// Customer unread count is scoped to this browser's private chat token.
router.get('/unread', chatToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT customer_unread FROM chats WHERE token = $1', [req.chatToken]);
    res.json({ unread: r.rowCount ? r.rows[0].customer_unread : 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load unread messages.' });
  }
});

// ---------- Admin ----------

router.get('/admin/unread', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM chats WHERE admin_unread > 0');
    res.json({ unread: r.rows[0].n });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load chats.' });
  }
});

router.get('/admin/list', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.id, c.customer_name, c.admin_unread, c.last_message_at,
              (SELECT body FROM chat_messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body
       FROM chats c ORDER BY c.last_message_at DESC LIMIT 100`
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load chats.' });
  }
});

router.get('/admin/:id(\\d+)/messages', requireAdmin, async (req, res) => {
  try {
    const after = parseInt(req.query.after, 10) || 0;
    const c = await pool.query('SELECT id, customer_name FROM chats WHERE id = $1', [req.params.id]);
    if (!c.rowCount) return res.status(404).json({ error: 'Chat not found.' });
    const m = await pool.query(
      'SELECT id, sender, body, created_at FROM chat_messages WHERE chat_id = $1 AND id > $2 ORDER BY id LIMIT 500',
      [c.rows[0].id, after]
    );
    await pool.query('UPDATE chats SET admin_unread = 0 WHERE id = $1 AND admin_unread <> 0', [c.rows[0].id]);
    res.json({ customer_name: c.rows[0].customer_name, messages: m.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load messages.' });
  }
});

router.delete('/admin/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM chats WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Chat not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete chat.' });
  }
});

router.post('/admin/:id(\\d+)/messages', requireAdmin, async (req, res) => {
  try {
    const body = clip(req.body && req.body.body, 1000);
    if (!body) return res.status(400).json({ error: 'Write a message first.' });
    const c = await pool.query('SELECT id FROM chats WHERE id = $1', [req.params.id]);
    if (!c.rowCount) return res.status(404).json({ error: 'Chat not found.' });
    const m = await pool.query(
      "INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1, 'admin', $2) RETURNING id, sender, body, created_at",
      [c.rows[0].id, body]
    );
    await pool.query('UPDATE chats SET last_message_at = NOW(), customer_unread = customer_unread + 1 WHERE id = $1', [c.rows[0].id]);
    res.status(201).json(m.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send message.' });
  }
});

module.exports = router;
