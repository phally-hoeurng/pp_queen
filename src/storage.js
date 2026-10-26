const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
const REF_PREFIX = 'sb:';

function config() {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!base || !key) {
    const err = new Error('Permanent image storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server, then create the public Storage bucket "' + BUCKET + '".');
    err.code = 'SUPABASE_STORAGE_NOT_CONFIGURED';
    throw err;
  }
  return { base, key };
}
function isSupabaseRef(value) {
  return typeof value === 'string' && value.startsWith(REF_PREFIX);
}

function parseRef(value) {
  if (!isSupabaseRef(value)) return null;
  const raw = value.slice(REF_PREFIX.length);
  const slash = raw.indexOf('/');
  if (slash < 1 || slash === raw.length - 1) return null;
  return { bucket: raw.slice(0, slash), objectPath: raw.slice(slash + 1) };
}

function encodePath(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

async function uploadLocalFile(file, folder = 'products') {
  const { base, key } = config();
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase();
  const allowed = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  const finalExt = allowed[file.mimetype] || (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg');
  const objectPath = `${String(folder).replace(/^\/+|\/+$/g, '')}/${crypto.randomUUID()}${finalExt}`;
  const body = await fs.promises.readFile(file.path);
  const response = await fetch(`${base}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodePath(objectPath)}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': file.mimetype || 'application/octet-stream',
      'x-upsert': 'false'
    },
    body
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase Storage upload failed (${response.status}): ${detail.slice(0, 240)}`);
  }
  return `${REF_PREFIX}${BUCKET}/${objectPath}`;
}

function storedFileUrl(value) {
  if (!value) return null;
  const ref = parseRef(value);
  if (!ref) {
    return '/uploads/' + encodeURIComponent(path.basename(String(value)));
  }
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base) {
    return null;
  }
  return `${base}/storage/v1/object/public/${encodeURIComponent(ref.bucket)}/${encodePath(ref.objectPath)}`;
}

async function deleteStoredFile(value) {
  if (!value) return;
  const ref = parseRef(value);
  if (!ref) {
    const localPath = path.join(__dirname, '..', 'public', 'uploads', path.basename(String(value)));
    await fs.promises.unlink(localPath).catch((err) => { if (err.code !== 'ENOENT') throw err; });
    return;
  }
  const { base, key } = config();
  const response = await fetch(`${base}/storage/v1/object/${encodeURIComponent(ref.bucket)}/${encodePath(ref.objectPath)}`, {
    method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase Storage delete failed (${response.status}): ${detail.slice(0, 240)}`);
  }
}

async function persistUploadedFiles(files, folder = 'products') {
  const completed = [];
  try {
    for (const file of files || []) {
      const oldPath = file.path;
      const ref = await uploadLocalFile(file, folder);
      file.filename = ref;
      completed.push(ref);
      await fs.promises.unlink(oldPath).catch(() => { });
      file.path = null;
    }
    return completed;
  } catch (err) {
    await Promise.all(completed.map((ref) => deleteStoredFile(ref).catch(() => { })));
    for (const file of files || []) if (file.path) await fs.promises.unlink(file.path).catch(() => { });
    throw err;
  }
}

async function removeIfUnreferenced(pool, filename) {
  if (!filename) return;
  try {
    const found = await pool.query('SELECT 1 FROM product_images WHERE filename=$1 LIMIT 1', [filename]);
    if (!found.rowCount) await deleteStoredFile(filename);
  } catch (err) {
    console.error('Image cleanup failed:', err.message);
  }
}

module.exports = { BUCKET, isSupabaseRef, storedFileUrl, uploadLocalFile, persistUploadedFiles, deleteStoredFile, removeIfUnreferenced };
