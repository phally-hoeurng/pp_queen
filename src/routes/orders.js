const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { requireAuth, optionalAuth, requireAdmin } = require('../middleware/auth');
const { upload, paymentProofUpload, UPLOAD_DIR } = require('../upload');
const { sendTelegram, sendTelegramPhoto, esc } = require('../telegram');
const { rateLimit } = require('../ratelimit');

const router = express.Router();
const CUR = () => process.env.CURRENCY || '$';
const money = (n) => CUR() + Number(n).toFixed(2);
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

async function loadOrder(id, lang = 'en') {
  const o = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  if (!o.rowCount) return null;
  const items = await pool.query(
    `SELECT oi.product_id, p.product_code, COALESCE(NULLIF(CASE WHEN $2 = 'km' THEN p.name_km WHEN $2 = 'zh' THEN p.name_zh ELSE p.name END, ''), oi.name) AS name, oi.price, oi.qty, pi.filename AS product_image
     FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN LATERAL (
       SELECT filename FROM product_images WHERE product_id = oi.product_id
       ORDER BY is_main DESC, id LIMIT 1
     ) pi ON TRUE
     WHERE oi.order_id = $1 ORDER BY oi.id`, [id, ['km','zh'].includes(lang) ? lang : 'en']
  );
  const order = o.rows[0];
  order.total = Number(order.total);
  order.items = items.rows.map((i) => ({ ...i, price: Number(i.price), product_image: i.product_image ? '/uploads/' + i.product_image : null }));
  order.payment_screenshot_url = order.payment_screenshot ? '/uploads/' + order.payment_screenshot : null;
  return order;
}

// Guests do not log in. Each order has a secret token; whoever holds the
// token (the customer's browser) can see and pay that order.
function sameToken(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const tokenFrom = (req) => String(req.headers['x-order-token'] || req.query.t || '');

// Admin, the logged-in owner, or anyone holding the order's secret token
function canAccess(order, req) {
  const u = req.user;
  if (u && (u.role === 'admin' || (order.user_id && order.user_id === u.id))) return true;
  return sameToken(order.public_token, tokenFrom(req));
}

// ---------- Customer (no login needed) ----------

// Create order. Server calculates the price, the browser is never trusted.
router.post(
  '/',
  optionalAuth,
  rateLimit({ windowMs: 10 * 60 * 1000, max: 15, key: (req) => 'order:' + req.ip, message: 'Too many orders. Please wait a few minutes.' }),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const b = req.body || {};
      const customer_name = clip(b.customer_name, 100);
      const phone = clip(b.phone, 40);
      const address = clip(b.address, 400);
      const note = clip(b.note, 400);
      const items = b.items;
      if (!customer_name || !phone || !address) {
        return res.status(400).json({ error: 'Enter name, phone and address.' });
      }
      if (!Array.isArray(items) || !items.length) {
        return res.status(400).json({ error: 'Your cart is empty.' });
      }
      if (items.length > 50) {
        return res.status(400).json({ error: 'Too many different items in one order.' });
      }

      await client.query('BEGIN');
      let total = 0;
      const lines = [];
      for (const it of items) {
        const qty = parseInt(it.qty, 10);
        const pr = await client.query('SELECT * FROM products WHERE id = $1 AND active = TRUE FOR UPDATE', [parseInt(it.id, 10)]);
        if (!pr.rowCount || !qty || qty < 1) throw new Error('A product in your cart is no longer available.');
        const p = pr.rows[0];
        if (p.stock < qty) throw new Error('Not enough stock for "' + p.name + '" (left: ' + p.stock + ').');
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [qty, p.id]);
        total += Number(p.price) * qty;
        lines.push({ product_id: p.id, name: p.name, price: Number(p.price), qty });
      }
      const token = crypto.randomBytes(16).toString('hex');

      // order_code is NOT NULL in the production database, so it must be
      // supplied in the INSERT itself. We reserve the PostgreSQL order id
      // first, then use that same id to create the customer-facing code.
      // This also keeps codes stable (PP001, PP002, ...) and avoids a
      // temporary NULL value that would violate the database constraint.
      const nextId = await client.query(
        "SELECT nextval(pg_get_serial_sequence('orders', 'id')) AS id"
      );
      const orderId = Number(nextId.rows[0].id);
      const orderCode = 'PP' + String(orderId).padStart(3, '0');
      const o = await client.query(
        `INSERT INTO orders (id, order_code, user_id, customer_name, phone, address, note, total, status, public_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'waiting_pay',$9) RETURNING id, order_code`,
        [orderId, orderCode, req.user ? req.user.id : null, customer_name, phone, address, note, total, token]
      );
      for (const l of lines) {
        await client.query(
          'INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES ($1,$2,$3,$4,$5)',
          [orderId, l.product_id, l.name, l.price, l.qty]
        );
      }
      await client.query('COMMIT');

      sendTelegram(
        '🛍 <b>New order ' + orderCode + '</b>\n' +
        'Customer: ' + esc(customer_name) + '\nPhone: ' + esc(phone) + '\nAddress: ' + esc(address) + '\n' +
        lines.map((l) => '• ' + esc(l.name) + ' x' + l.qty).join('\n') +
        '\n<b>Total: ' + money(total) + '</b>\nStatus: waiting for payment'
      );
      res.status(201).json({ id: orderId, order_code: orderCode, total, status: 'waiting_pay', token });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(400).json({ error: err.message || 'Could not create order.' });
    } finally {
      client.release();
    }
  }
);

// Orders of a logged-in account (admin/old customer accounts)
router.get('/mine', requireAuth, async (req, res) => {
  const r = await pool.query(
    `SELECT o.id, o.order_code, o.total, o.status, o.created_at,
            (SELECT oi.name FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.id LIMIT 1) AS product_name,
            (SELECT pi.filename FROM order_items oi JOIN product_images pi ON pi.product_id = oi.product_id
             WHERE oi.order_id = o.id ORDER BY oi.id, pi.is_main DESC, pi.id LIMIT 1) AS product_image,
            (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
            (SELECT COALESCE(json_agg(json_build_object('product_id',oi.product_id,'product_code',p.product_code,'name',COALESCE(NULLIF(CASE WHEN $2='km' THEN p.name_km WHEN $2='zh' THEN p.name_zh ELSE p.name END,''),oi.name),'qty',oi.qty,'price',oi.price,'product_image',im.filename) ORDER BY oi.id), '[]'::json)
             FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN LATERAL (SELECT filename FROM product_images WHERE product_id = oi.product_id ORDER BY is_main DESC, id LIMIT 1) im ON TRUE
             WHERE oi.order_id = o.id) AS items
     FROM orders o WHERE o.user_id = $1 ORDER BY o.created_at DESC`, [req.user.id, ['km','zh'].includes(req.query.lang) ? req.query.lang : 'en']
  );
  res.json(r.rows.map((o) => ({ ...o, total: Number(o.total), product_image: o.product_image ? '/uploads/' + o.product_image : null, items: (o.items || []).map((i) => ({ ...i, price: Number(i.price), product_image: i.product_image ? '/uploads/' + i.product_image : null })) })));
});

// "My orders" for guests: the browser sends the orders it remembers
// ([{id, token}]) and gets back their current status.
router.post(
  '/lookup',
  rateLimit({ windowMs: 60 * 1000, max: 30, key: (req) => 'lookup:' + req.ip }),
  async (req, res) => {
    try {
      const list = Array.isArray(req.body && req.body.orders) ? req.body.orders.slice(0, 30) : [];
      const tokens = new Map();
      list.forEach((o) => { const id = parseInt(o && o.id, 10); if (id > 0) tokens.set(id, o.token); });
      if (!tokens.size) return res.json([]);
      const r = await pool.query(
        `SELECT o.id, o.order_code, o.total, o.status, o.created_at, o.public_token,
                (SELECT oi.name FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.id LIMIT 1) AS product_name,
                (SELECT pi.filename FROM order_items oi JOIN product_images pi ON pi.product_id = oi.product_id
                 WHERE oi.order_id = o.id ORDER BY oi.id, pi.is_main DESC, pi.id LIMIT 1) AS product_image,
                (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
                (SELECT COALESCE(json_agg(json_build_object('product_id',oi.product_id,'product_code',p.product_code,'name',COALESCE(NULLIF(CASE WHEN $2='km' THEN p.name_km WHEN $2='zh' THEN p.name_zh ELSE p.name END,''),oi.name),'qty',oi.qty,'price',oi.price,'product_image',im.filename) ORDER BY oi.id), '[]'::json)
                 FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN LATERAL (SELECT filename FROM product_images WHERE product_id = oi.product_id ORDER BY is_main DESC, id LIMIT 1) im ON TRUE
                 WHERE oi.order_id = o.id) AS items
         FROM orders o WHERE o.id = ANY($1::int[]) ORDER BY o.id DESC`,
        [[...tokens.keys()], ['km','zh'].includes(req.query.lang) ? req.query.lang : 'en']
      );
      res.json(
        r.rows
          .filter((o) => sameToken(o.public_token, tokens.get(o.id)))
          .map((o) => ({ id: o.id, order_code: o.order_code, total: Number(o.total), status: o.status, created_at: o.created_at, product_name: o.product_name, product_image: o.product_image ? '/uploads/' + o.product_image : null, item_count: o.item_count, items: (o.items || []).map((i) => ({ ...i, price: Number(i.price), product_image: i.product_image ? '/uploads/' + i.product_image : null })) }))
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not load orders.' });
    }
  }
);

router.get('/:id(\\d+)', optionalAuth, async (req, res) => {
  try {
    const order = await loadOrder(req.params.id, req.query.lang || 'en');
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!canAccess(order, req)) return res.status(403).json({ error: 'This is not your order.' });
    delete order.public_token;
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load order.' });
  }
});

// Check the order BEFORE saving the file, so strangers can not fill the disk
async function guardOrder(req, res, next) {
  try {
    const order = await loadOrder(req.params.id, req.query.lang || 'en');
    if (!order || !canAccess(order, req)) return res.status(404).json({ error: 'Order not found.' });
    if (order.status !== 'waiting_pay') return res.status(400).json({ error: 'This order is not waiting for payment.' });
    req.order = order;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not upload payment proof.' });
  }
}

// Customer uploads the payment screenshot. The picture is sent to the
// shop's Telegram bot straight away.
router.post(
  '/:id(\\d+)/screenshot',
  optionalAuth,
  rateLimit({ windowMs: 10 * 60 * 1000, max: 15, key: (req) => 'shot:' + req.ip, message: 'Too many uploads. Please wait a few minutes.' }),
  guardOrder,
  paymentProofUpload.single('screenshot'),
  async (req, res, next) => {
    if (req.file) {
      try {
        const b = await fs.promises.readFile(req.file.path);
        const ext = path.extname(req.file.filename).toLowerCase();
        const valid = ext === '.pdf' ? b.subarray(0, 5).toString() === '%PDF-'
          : ext === '.jpg' ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
          : ext === '.png' ? b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : ext === '.webp' ? b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'
          : false;
        if (!valid) { await fs.promises.unlink(req.file.path).catch(() => {}); return res.status(400).json({ error: 'The uploaded file content does not match an allowed image or PDF format.' }); }
      } catch (e) { return next(e); }
    }
    return (async () => {
    try {
      const order = req.order;
      if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, WebP image or PDF payment proof.' });
      await pool.query("UPDATE orders SET payment_screenshot = $1, status = 'paid' WHERE id = $2", [req.file.filename, order.id]);

      // remove the previous screenshot file if the customer sent a new one
      const again = !!order.payment_screenshot;
      if (again) fs.unlink(path.join(UPLOAD_DIR, path.basename(order.payment_screenshot)), () => {});

      // Wait for Telegram so the UI can accurately report whether the shop was alerted.
      // The upload itself remains successful even if Telegram is temporarily unavailable.
      const telegramSent = await sendTelegramPhoto(
        req.file.path,
        '📸 <b>Payment proof' + (again ? ' (new one)' : '') + '</b>\n' +
        'Order ' + (order.order_code || ('PP' + String(order.id).padStart(3, '0'))) + '  •  <b>' + money(order.total) + '</b>\n' +
        'Customer: ' + esc(order.customer_name) + '\nPhone: ' + esc(order.phone) + '\n' +
        'Please check it and press “Confirm order” in Admin > Waiting Confirm.'
      );
      res.json({ ok: true, url: '/uploads/' + req.file.filename, telegramSent });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not upload payment proof.' });
    }
    })();
  }
);

// ---------- Admin ----------

router.get('/admin/all', requireAdmin, async (req, res) => {
  const { status } = req.query;
  const r = status
    ? await pool.query('SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC', [status])
    : await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  res.json(r.rows.map((o) => ({ ...o, total: Number(o.total) })));
});

router.get('/admin/stats', requireAdmin, async (req, res) => {
  const today = await pool.query(
    "SELECT COUNT(*)::int AS orders, COALESCE(SUM(total) FILTER (WHERE status = 'success'),0) AS sales FROM orders WHERE created_at >= date_trunc('day', NOW())"
  );
  const pending = await pool.query("SELECT COUNT(*)::int AS n FROM orders WHERE status = 'waiting_pay'");
  const paid = await pool.query("SELECT COUNT(*)::int AS n FROM orders WHERE status = 'paid'");
  const low = await pool.query(`SELECT p.id,p.product_code,p.name,p.stock, (SELECT filename FROM product_images WHERE product_id=p.id ORDER BY is_main DESC,id LIMIT 1) AS image FROM products p WHERE p.active=TRUE AND p.stock<=3 ORDER BY p.stock ASC LIMIT 10`);
  const days = await pool.query(
    `SELECT to_char(d, 'MM-DD') AS day,
            COALESCE((SELECT SUM(total) FROM orders WHERE status = 'success' AND created_at::date = d), 0) AS sales
     FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day') AS d ORDER BY d`
  );
  res.json({
    todayOrders: today.rows[0].orders,
    todaySales: Number(today.rows[0].sales),
    pendingOrders: pending.rows[0].n,
    paidOrders: paid.rows[0].n,
    lowStock: low.rows,
    last7: days.rows.map((d) => ({ day: d.day, sales: Number(d.sales) }))
  });
});

// Admin order workflow: waiting_pay -> paid (customer screenshot), paid -> success (admin confirmation). Confirmed is final.
router.patch('/admin/:id(\\d+)/status', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const status = String(req.body.status || '');
    if (status !== 'success') {
      return res.status(400).json({ error: 'Admin may set only Confirmed.' });
    }
    await client.query('BEGIN');
    const cur = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found.' }); }
    const o = cur.rows[0];
    const allowed = {
      waiting_pay: [],
      paid: ['success'],
      success: []
    };
    if (!(allowed[o.status] || []).includes(status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Invalid order status transition: ' + o.status + ' → ' + status + '.' });
    }
        await client.query('UPDATE orders SET status = $1 WHERE id = $2', [status, o.id]);
    await client.query('COMMIT');
    const code = o.order_code || ('PP' + String(o.id).padStart(3, '0'));
    const label = { success: '🟢 CONFIRMED' }[status];
    sendTelegram('<b>Order ' + code + '</b> ' + label + '\nAmount: ' + money(o.total));
    if (status === 'success') {
      const low = await pool.query(
        `SELECT p.name, p.stock FROM products p JOIN order_items i ON i.product_id = p.id WHERE i.order_id = $1 AND p.stock <= 3`, [o.id]
      );
      low.rows.forEach((p) => sendTelegram('⚠️ <b>Low stock:</b> ' + esc(p.name) + ' (left: ' + p.stock + ')'));
    }
    res.json(await loadOrder(o.id, req.query.lang || 'en'));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Could not change status.' });
  } finally { client.release(); }
});

module.exports = router;
