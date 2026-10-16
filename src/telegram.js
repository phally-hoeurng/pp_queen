require('dotenv').config();
const fs = require('fs');
const path = require('path');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' };

// Sends a message to Telegram. It never throws, so a Telegram problem
// can not break an order.
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TG_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TG_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    if (!res.ok) console.error('Telegram error:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('Telegram failed:', err.message);
    return false;
  }
}

// Sends the picture itself to Telegram with a caption (used for payment
// screenshots). If Telegram refuses it as a photo (very tall/large image)
// it is sent as a file instead; if that fails too, a text alert is sent.
// It never throws.
async function sendTelegramPhoto(filePath, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TG_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TG_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const buf = await fs.promises.readFile(filePath);
    const name = path.basename(filePath);
    const type = MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';
    const attempts = [['sendPhoto', 'photo'], ['sendDocument', 'document']];
    for (const [method, field] of attempts) {
      const fd = new FormData();
      fd.append('chat_id', String(chatId));
      fd.append('caption', caption);
      fd.append('parse_mode', 'HTML');
      fd.append(field, new Blob([buf], { type }), name);
      const res = await fetch('https://api.telegram.org/bot' + token + '/' + method, { method: 'POST', body: fd });
      if (res.ok) return true;
      console.error('Telegram ' + method + ' error:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Telegram photo failed:', err.message);
  }
  return sendTelegram(caption + '\n(The image could not be attached. Open it in Admin > Orders.)');
}

// Escape user text for Telegram HTML mode
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { sendTelegram, sendTelegramPhoto, esc };
