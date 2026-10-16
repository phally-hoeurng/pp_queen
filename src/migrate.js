// Runs db/schema.sql every time the server starts. Every line in it is
// "IF NOT EXISTS", so it is safe to repeat and it adds new tables/columns
// to an existing database without touching your data.
const fs = require('fs');
const path = require('path');
const pool = require('./db');

module.exports = async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
};
