/* Customer chat box. No login: the browser keeps a random chat id.
   Messages appear in Admin > Chat. New messages are checked every few seconds. */
(function () {
  if (window.PP_CHAT_LOADED) return;
  window.PP_CHAT_LOADED = true;

  var K_TOKEN = 'pp_chat', K_STARTED = 'pp_chat_started', K_SEEN = 'pp_chat_seen';

  function newToken() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  var token = localStorage.getItem(K_TOKEN);
  if (!/^[a-f0-9]{32}$/.test(token || '')) { token = newToken(); localStorage.setItem(K_TOKEN, token); }

  var started = localStorage.getItem(K_STARTED) === '1';   // has this visitor ever sent a message?
  var seenId = Number(localStorage.getItem(K_SEEN)) || 0;
  var lastId = 0, unread = 0, isOpen = false, sending = false, polling = false, timer = null;
  var shown = {};

  var root = document.createElement('div');
  root.id = 'chat-root';
  root.innerHTML =
    '<button type="button" class="chat-fab" id="chat-fab" aria-label="Chat with us">' +
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' +
      '<span class="chat-dot hidden" id="chat-dot">0</span>' +
    '</button>' +
    '<section class="chat-panel hidden" id="chat-panel" role="dialog" aria-label="Chat with us">' +
      '<header class="chat-head">' +
        '<img src="/images/logo-mark.png" alt="">' +
        '<div><b>Chat with us</b><small>We usually reply within a few minutes.</small></div>' +
        '<button type="button" class="chat-close" id="chat-close" aria-label="Close">×</button>' +
      '</header>' +
      '<div class="chat-body" id="chat-body">' +
        '<div class="msg admin"><div class="bubble">Hi! 👋 Ask us anything about products, delivery or your payment.</div></div>' +
        '<div class="chat-chips" id="chat-chips">' +
          '<button type="button">Where is my order?</button>' +
          '<button type="button">I need help with payment</button>' +
          '<button type="button">Is this item in stock?</button>' +
          '<button type="button">How much is delivery?</button><button type="button">I want to check my order</button>' +
        '</div>' +
      '</div>' +
      '<div class="chat-err hidden" id="chat-err"></div>' +
      '<div class="chat-name" id="chat-name-row"><input id="chat-name" maxlength="60" placeholder="Your name (optional)" autocomplete="name"></div>' +
      '<form class="chat-form" id="chat-form">' +
        '<input id="chat-input" maxlength="1000" placeholder="Type your message" autocomplete="off" aria-label="Type your message">' +
        '<button class="chat-send" id="chat-send" aria-label="Send"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>' +
      '</form>' +
    '</section>';
  document.body.appendChild(root);

  var $ = function (id) { return document.getElementById(id); };
  var fab = $('chat-fab'), panel = $('chat-panel'), body = $('chat-body'), input = $('chat-input'),
      form = $('chat-form'), sendBtn = $('chat-send'), dot = $('chat-dot'), err = $('chat-err'),
      nameRow = $('chat-name-row'), nameInput = $('chat-name'), chips = $('chat-chips');

  try { nameInput.value = (PP.customer().name || ''); } catch (e) { /* ignore */ }
  if (started) { nameRow.classList.add('hidden'); chips.classList.add('hidden'); }

  function timeText(d) { try { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function scrollDown() { body.scrollTop = body.scrollHeight; }

  function showError(text) {
    err.textContent = text; err.classList.remove('hidden');
    clearTimeout(showError.t); showError.t = setTimeout(function () { err.classList.add('hidden'); }, 4500);
  }

  function updateDot() {
    dot.textContent = unread > 9 ? '9+' : unread;
    dot.classList.toggle('hidden', !(unread > 0 && !isOpen));
    fab.classList.toggle('has-new', unread > 0 && !isOpen);
  }

  function addMsg(m) {
    if (shown[m.id]) return;
    shown[m.id] = true;
    if (m.id > lastId) lastId = m.id;
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + (m.sender === 'admin' ? 'admin' : 'me');
    var b = document.createElement('div'); b.className = 'bubble'; b.textContent = m.body;
    var t = document.createElement('small'); t.textContent = timeText(m.created_at);
    wrap.appendChild(b); wrap.appendChild(t);
    body.appendChild(wrap);
    if (m.sender === 'admin' && m.id > seenId && !isOpen) unread++;
    if (isOpen) { seenId = Math.max(seenId, m.id); localStorage.setItem(K_SEEN, seenId); scrollDown(); }
    updateDot();
  }

  function refreshServerUnread(markRead) {
    if (!started) return;
    var url = '/api/chat/' + (markRead ? 'messages?after=' + lastId + '&read=1' : 'unread');
    fetch(url, { headers: { 'X-Chat-Token': token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        if (markRead) { unread = 0; seenId = Math.max(seenId, lastId); localStorage.setItem(K_SEEN, seenId); }
        else unread = Number(d.unread) || 0;
        updateDot();
      }).catch(function () { /* retry on the next poll */ });
  }

  function poll() {
    if (polling || !started || document.hidden) { schedule(); return; }
    polling = true;
    fetch('/api/chat/messages?after=' + lastId + (isOpen ? '&read=1' : ''), { headers: { 'X-Chat-Token': token } })
      .then(function (r) { return r.ok ? r.json() : { messages: [] }; })
      .then(function (d) { (d.messages || []).forEach(addMsg); if (isOpen) { unread = 0; updateDot(); } else refreshServerUnread(false); })
      .catch(function () { /* try again next time */ })
      .then(function () { polling = false; schedule(); });
  }
  function schedule() {
    clearTimeout(timer);
    if (!started) return;
    timer = setTimeout(poll, isOpen ? 3500 : 15000);
  }

  function setOpen(open) {
    isOpen = open;
    panel.classList.toggle('hidden', !open);
    fab.classList.toggle('on', open);
    if (open) {
      unread = 0; seenId = Math.max(seenId, lastId); localStorage.setItem(K_SEEN, seenId);
      updateDot(); scrollDown(); setTimeout(function () { input.focus(); }, 120);
      if (started) { refreshServerUnread(true); poll(); }
    } else { updateDot(); }
    schedule();
  }

  function send(text) {
    text = (text || '').trim();
    if (!text || sending) return;
    sending = true; sendBtn.disabled = true;
    fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chat-Token': token },
      body: JSON.stringify({ body: text, name: nameInput.value.trim() })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Message could not be sent. Try again.');
        input.value = '';
        if (nameInput.value.trim()) {
          try { var c = PP.customer(); c.name = c.name || nameInput.value.trim(); PP.saveCustomer(c); } catch (e) { /* ignore */ }
        }
        started = true; localStorage.setItem(K_STARTED, '1');
        nameRow.classList.add('hidden'); chips.classList.add('hidden');
        addMsg(res.d); unread = 0; updateDot(); scrollDown(); refreshServerUnread(true); schedule();
      })
      .catch(function (e) { showError(e.message || 'Message could not be sent. Try again.'); })
      .then(function () { sending = false; sendBtn.disabled = false; input.focus(); });
  }

  fab.onclick = function () { setOpen(!isOpen); };
  $('chat-close').onclick = function () { setOpen(false); };
  form.onsubmit = function (e) { e.preventDefault(); send(input.value); };
  chips.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) send(b.textContent);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) setOpen(false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && started) poll(); });

  PP._openChat = function () { setOpen(true); };
  if (PP._wantChat) { PP._wantChat = false; setOpen(true); }
  if (started) { refreshServerUnread(false); poll(); }   // load history and server-side unread count
})();
