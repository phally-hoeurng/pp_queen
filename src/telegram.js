require('dotenv').config();
const fs = require('fs');
const path = require('path');

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf'
};

// Sends a message to Telegram. Never throws.
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TG_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TG_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.ok !== true) {
      console.error('Telegram sendMessage error:', res.status, payload?.description || 'Unknown error');
      return false;
    }
    return true;
  } catch (err) {
    console.error('Telegram failed:', err.message);
    return false;
  }
}

// Sends the picture to Telegram with caption.
// Accepts either a local file path OR a remote public URL (e.g. Supabase Storage URL).
async function sendTelegramPhoto(target, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TG_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TG_CHAT_ID;
  if (!token || !chatId || !target) return false;

  // 1. If target is a remote Supabase URL, send via Telegram URL fetching (most reliable)
  if (typeof target === 'string' && (target.startsWith('http://') || target.startsWith('https://'))) {
    const isPdf = /\.pdf(?:$|[?#])/i.test(target);
    const method = isPdf ? 'sendDocument' : 'sendPhoto';
    const field = isPdf ? 'document' : 'photo';

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          [field]: target,
          caption,
          parse_mode: 'HTML'
        })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) return true;
      console.error(`Telegram remote URL ${method} failed:`, data?.description || res.status);
    } catch (e) {
      console.error('Telegram URL send error:', e.message);
    }
  }

  // 2. If target is a local file path on disk, send as multipart form-data
  try {
    if (typeof target === 'string' && fs.existsSync(target)) {
      const buf = await fs.promises.readFile(target);
      const name = path.basename(target);
      const ext = path.extname(name).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      const isPdf = ext === '.pdf';

      const attempts = isPdf
        ? [['sendDocument', 'document']]
        : [['sendPhoto', 'photo'], ['sendDocument', 'document']];

      for (const [method, field] of attempts) {
        const fd = new FormData();
        fd.append('chat_id', String(chatId));
        fd.append('caption', caption);
        fd.append('parse_mode', 'HTML');
        fd.append(field, new Blob([buf], { type }), name);

        const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
          method: 'POST',
          body: fd
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) return true;
        console.error(`Telegram file ${method} failed:`, data?.description || res.status);
      }
    }
  } catch (err) {
    console.error('Telegram local file send failed:', err.message);
  }

  // Fallback text if image could not be delivered
  return sendTelegram(caption);
}

// Escape user text for Telegram HTML mode
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { sendTelegram, sendTelegramPhoto, esc };