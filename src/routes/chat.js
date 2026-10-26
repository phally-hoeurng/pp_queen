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

// Send an alert for every customer message. The previous one-minute
// throttle silently suppressed later messages in active conversations.
async function alertAdmin(chat, body, imageUrl, productId) {
  const base = String(process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://pp-queen-shop.onrender.com').replace(/\/$/, '');
  const actualBody = imageUrl ? (body ? body.slice(0, 850) + '\n[Image attached]\n' + imageUrl : 'Image message\n' + imageUrl) : (body || (productId ? 'Product ID: ' + productId : 'New message'));
  const message =
    '💬 <b>New chat message</b>\n' +
    'From: ' + esc(chat.customer_name || 'Customer') + '\n' +
    'Message: ' + esc(actualBody.slice(0, 1000)) + (productId && !actualBody.includes(productId) ? '\nProduct ID: ' + esc(productId) : '') + '\n\n' +
    '<a href="' + esc(base + '/admin/index.html?tab=chat&chatId=' + chat.id) + '">Reply in Admin &gt; Chat</a>';
  const sent = await sendTelegram(message);
  if (!sent) console.error('Telegram customer chat alert was not delivered. Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID and the Telegram API response.');
  return sent;
}

router.get('/messages', chatToken, async (req, res) => {
  try {
    const after = parseInt(req.query.after, 10) || 0;
    const c = await pool.query('SELECT id FROM chats WHERE token = $1', [req.chatToken]);
    if (!c.rowCount) return res.json({ messages: [] });
    const m = await pool.query(
      'SELECT id, sender, body, image_url, created_at FROM chat_messages WHERE chat_id = $1 AND id > $2 ORDER BY id LIMIT 200',
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
      if (!body) return res.status(400).json({ error: 'Please type a message before sending.' });
      const existing = await pool.query('SELECT id, customer_name FROM chats WHERE token = $1', [req.chatToken]);
      if (!name && (!existing.rowCount || !String(existing.rows[0].customer_name || '').trim())) {
        return res.status(400).json({ error: 'Please enter your name before starting the chat.' });
      }

      const productId = clip((req.body && req.body.productId) || ((req.get('referer') || '').match(/\bPP\d{2,}/i) || [])[0] || (body.match(/\bPP\d{2,}/i) || [])[0] || '', 32);
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
      // Save and acknowledge the message first. Telegram outages must never
      // make the customer composer appear to fail after the message is stored.
      res.status(201).json(m.rows[0]);
      alertAdmin(chat, body, null, productId).catch((err) => console.error('Telegram chat alert failed:', err.message));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not send message.' });
    }
  }
);

// Customers can edit/delete only their own messages, verified by their private chat token.
router.put('/messages/:messageId(\\d+)', chatToken, async (req, res) => {
  try {
    const body = clip(req.body && req.body.body, 1000);
    if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
    const r = await pool.query(`UPDATE chat_messages m SET body = $1 FROM chats c WHERE m.chat_id = c.id AND c.token = $2 AND m.id = $3 AND m.sender = 'customer' RETURNING m.id, m.sender, m.body, m.created_at`, [body, req.chatToken, req.params.messageId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Message not found or cannot be edited.' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not edit message.' }); }
});

router.delete('/messages/:messageId(\\d+)', chatToken, async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM chat_messages m USING chats c WHERE m.chat_id = c.id AND c.token = $1 AND m.id = $2 AND m.sender = 'customer' RETURNING m.id`, [req.chatToken, req.params.messageId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Message not found or cannot be deleted.' });
    res.json({ ok: true, id: Number(req.params.messageId) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not delete message.' }); }
});

// Customer deletion clears only chat messages and preserves the customer/chat record.
router.delete('/conversation', chatToken, async (req, res) => {
  try {
    const c = await pool.query('SELECT id FROM chats WHERE token = $1', [req.chatToken]);
    if (!c.rowCount) return res.json({ ok: true });
    await pool.query('DELETE FROM chat_messages WHERE chat_id = $1', [c.rows[0].id]);
    await pool.query('UPDATE chats SET admin_unread = 0, customer_unread = 0, last_message_at = NOW() WHERE id = $1', [c.rows[0].id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not clear conversation.' }); }
});

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
      'SELECT id, sender, body, image_url, created_at FROM chat_messages WHERE chat_id = $1 AND id > $2 ORDER BY id LIMIT 500',
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

router.put('/admin/:id(\\d+)/messages/:messageId(\\d+)', requireAdmin, async (req, res) => {
  try {
    const body = clip(req.body && req.body.body, 1000);
    if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
    const r = await pool.query(`UPDATE chat_messages SET body = $1 WHERE chat_id = $2 AND id = $3 AND sender = 'admin' RETURNING id, sender, body, created_at`, [body, req.params.id, req.params.messageId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Admin message not found.' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not edit message.' }); }
});

router.delete('/admin/:id(\\d+)/messages/:messageId(\\d+)', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM chat_messages WHERE chat_id = $1 AND id = $2 AND sender = 'admin' RETURNING id`, [req.params.id, req.params.messageId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Admin message not found.' });
    res.json({ ok: true, id: Number(req.params.messageId) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not delete message.' }); }
});

router.post('/admin/:id(\\d+)/messages', requireAdmin, async (req, res) => {
  try {
    const body = clip(req.body && req.body.body, 1000);
    if (!body) return res.status(400).json({ error: 'Please type a reply before sending.' });
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
