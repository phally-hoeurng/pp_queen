require('dotenv').config();
const express = require('express');
const path = require('path');
const migrate = require('./src/migrate');
process.on('unhandledRejection', (e) => console.error('Unhandled error:', e && e.message ? e.message : e));

const app = express();
app.use(express.json());

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/products', require('./src/routes/products'));
app.use('/api/orders', require('./src/routes/orders'));
app.use('/api/chat', require('./src/routes/chat'));

// Shop info for the footer and currency symbol
app.get('/api/config', (req, res) => {
  res.json({
    name: process.env.SHOP_NAME || 'PP Queen',
    phone: process.env.SHOP_PHONE || '',
    email: process.env.SHOP_EMAIL || '',
    address: process.env.SHOP_ADDRESS || '',
    facebookUrl: process.env.SHOP_FACEBOOK_URL || '',
    telegramUrl: process.env.SHOP_TELEGRAM_URL || '',
    currency: process.env.CURRENCY || '$'
  });
});

// Uploaded files must always be treated as plain images by the browser
app.use('/uploads', (req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
app.use(express.static(path.join(__dirname, 'public')));

// API errors (for example wrong image type) as JSON
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let msg = err.message || 'Something went wrong.';
  if (err.code === 'LIMIT_FILE_SIZE') msg = 'Image is too big (max 5 MB).';
  res.status(400).json({ error: msg });
});

const PORT = process.env.PORT || 3000;

// Make sure the tables/columns exist, then start
migrate()
  .catch((err) => console.error('\nDatabase setup failed: ' + err.message + '\n'))
  .then(() => app.listen(PORT, () => console.log('PP Queen shop running on http://localhost:' + PORT)));
