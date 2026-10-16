require('dotenv').config();
const { Pool } = require('pg');

// Use separate DB_* lines if present (no special-character problems),
// otherwise fall back to DATABASE_URL.
const config = process.env.DB_NAME
  ? {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD
    }
  : {
      connectionString: (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '')
    };

const pool = new Pool(config);

pool.on('error', (err) => console.error('Database error:', err.message));

// Show a clear message at start if the database is not reachable
pool.query('SELECT 1').catch((err) => {
  console.error('\nCannot connect to the database: ' + err.message);
  console.error('Check the DB_* lines (or DATABASE_URL) in your .env file and make sure PostgreSQL is running.\n');
});

module.exports = pool;
