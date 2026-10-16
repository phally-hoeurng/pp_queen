require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Tables are ready.');

    const email = (process.env.ADMIN_EMAIL || 'admin@ppqueen.com').toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!password) throw new Error('Set ADMIN_PASSWORD in your .env file first.');
    const name = process.env.ADMIN_NAME || 'PP Queen Admin';

    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rowCount === 0) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
        [name, email, hash]
      );
      console.log('Admin created: ' + email);
    } else {
      // Always repair the configured admin account so the credentials in .env
      // are guaranteed to work. This also promotes an existing customer account.
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        "UPDATE users SET role = 'admin', name = $1, password_hash = $2 WHERE email = $3",
        [name, hash, email]
      );
      console.log('Admin verified/promoted and password synchronized: ' + email);
    }
  } catch (err) {
    console.error('Init failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
