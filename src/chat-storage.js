const crypto = require('crypto');

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

function verifyImage(buffer, mime) {
  if (!buffer || !buffer.length || !EXT[mime]) return false;
  if (mime === 'image/jpeg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/gif') return ['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString('ascii'));
  if (mime === 'image/webp') return buffer.subarray(0,4).toString('ascii') === 'RIFF' && buffer.subarray(8,12).toString('ascii') === 'WEBP';
  return false;
}

async function uploadChatImage(file) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bucket = process.env.CHAT_IMAGE_BUCKET || 'ppqueen-chat-images';
  if (!base || !key) throw new Error('Persistent image storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  if (!file || !verifyImage(file.buffer, file.mimetype)) throw new Error('The uploaded file is not a valid JPG, PNG, WEBP or GIF image.');
  const name = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${EXT[file.mimetype]}`;
  const endpoint = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${name}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': file.mimetype, 'x-upsert': 'false' },
    body: file.buffer
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 400);
    console.error('Supabase chat image upload failed:', response.status, detail);
    throw new Error('Could not save the image to persistent storage. Please try again.');
  }
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${name}`;
}

module.exports = { uploadChatImage, verifyImage };
