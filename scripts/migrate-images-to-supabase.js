require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');
const { isSupabaseRef, uploadLocalFile } = require('../src/storage');
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

(async () => {
  let migrated = 0, skipped = 0, failed = 0;
  try {
    const rows = await pool.query('SELECT id, filename FROM product_images ORDER BY id');
    for (const row of rows.rows) {
      if (!row.filename || isSupabaseRef(row.filename)) { skipped++; continue; }
      const filename = path.basename(row.filename);
      const filePath = path.join(UPLOAD_DIR, filename);
      if (!fs.existsSync(filePath)) {
        console.error(`Missing local image for product_images.id=${row.id}: ${filename}`);
        failed++;
        continue;
      }
      try {
        const ext = path.extname(filename).toLowerCase();
        const storedRef = await uploadLocalFile({
          path: filePath,
          filename,
          originalname: filename,
          mimetype: MIME[ext] || 'application/octet-stream'
        }, 'products');
        await pool.query('UPDATE product_images SET filename=$1 WHERE id=$2', [storedRef, row.id]);
        console.log(`Migrated image record ${row.id}`);
        migrated++;
      } catch (err) {
        console.error(`Failed image record ${row.id}: ${err.message}`);
        failed++;
      }
    }
    console.log(`Image migration finished. Migrated: ${migrated}; skipped: ${skipped}; failed: ${failed}. Local originals were kept as backup.`);
    if (failed) process.exitCode = 1;
  } catch (err) {
    console.error('Image migration could not run:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
