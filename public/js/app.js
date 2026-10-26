/* Shared helpers: API, login state, cart, header and footer */
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('[data-open-chat]');
  if (a) { e.preventDefault(); PP.openChat(); }
});

const PP = {
  lang: (window.I18N && window.I18N.lang) || (localStorage.getItem('pp_lang') || 'en'),
  config: { name: 'PP Queen', currency: '$', phone: '', email: '', address: '' },

  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // Helper to safely format image URLs whether they are Supabase links, relative paths, or filenames
  imgUrl(src) {
    if (!src) return '';
    const s = String(src).trim();
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) {
      return s;
    }
    return '/uploads/' + encodeURIComponent(s);
  },

  // product id shown to customers, e.g. PP05
  code(p) {
    return (p && p.product_code) || ('PP' + String((p && (p.product_id || p.id)) || 0).padStart(2, '0'));
  },

  inCart(id) {
    return PP.cart().some((i) => Number(i.id) === Number(id));
  },

  // "Add to cart" button label/state. Turns into a different colour once the product is already in the cart.
  addBtnHtml(id) {
    return PP.inCart(id)
      ? '<span aria-hidden="true">✓</span> ' + 'In cart'
      : '<span aria-hidden="true">+</span> ' + 'Add to cart';
  },
  markAdded(btn, id) {
    btn.classList.toggle('in-cart', PP.inCart(id));
    btn.innerHTML = PP.addBtnHtml(id);
  },

  flags: {
    en: '<svg viewBox="0 0 60 40" aria-hidden="true"><clipPath id="fgb"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#fgb)"><rect width="60" height="40" fill="#012169"/><path d="M0 0l60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0l60 40M60 0L0 40" stroke="#C8102E" stroke-width="3"/><path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="13"/><path d="M30 0v40M0 20h60" stroke="#C8102E" stroke-width="8"/></g></svg>',
    km: '<svg viewBox="0 0 60 40" aria-hidden="true"><clipPath id="fkh"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#fkh)"><rect width="60" height="40" fill="#032EA1"/><rect y="10" width="60" height="20" fill="#E00025"/><g fill="#fff"><rect x="19" y="24" width="22" height="2.4"/><rect x="21" y="21.6" width="18" height="2.4"/><rect x="24" y="19.2" width="12" height="2.4"/><rect x="21" y="16.2" width="3" height="3"/><rect x="28.5" y="14" width="3" height="5.2"/><rect x="36" y="16.2" width="3" height="3"/></g></g></svg>',
    zh: '<svg viewBox="0 0 60 40" aria-hidden="true"><clipPath id="fcn"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#fcn)"><rect width="60" height="40" fill="#DE2910"/><g fill="#FFDE00"><polygon points="10,5 12.4,12 6.4,7.7 13.6,7.7 7.6,12"/><polygon points="20,3 20.8,5 23,5 21.2,6.3 21.9,8.4 20,7.1 18.1,8.4 18.8,6.3 17,5 19.2,5" transform="scale(.7) translate(10 1)"/><polygon points="20,3 20.8,5 23,5 21.2,6.3 21.9,8.4 20,7.1 18.1,8.4 18.8,6.3 17,5 19.2,5" transform="scale(.7) translate(15 9)"/><polygon points="20,3 20.8,5 23,5 21.2,6.3 21.9,8.4 20,7.1 18.1,8.4 18.8,6.3 17,5 19.2,5" transform="scale(.7) translate(15 18)"/><polygon points="20,3 20.8,5 23,5 21.2,6.3 21.9,8.4 20,7.1 18.1,8.4 18.8,6.3 17,5 19.2,5" transform="scale(.7) translate(10 26)"/></g></g></svg>'
  },
  langNames: { en: 'English', km: 'ខ្មែរ', zh: '中文' },

  icons: {
    bags: '<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l1 12H4L5 8z"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8"/></svg>',
    shampoo: '<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2h4v3h-4z"/><path d="M12 5v2"/><path d="M8 9a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9z"/><path d="M8 13h8"/></svg>'
  },

  // One ordered product: image (hover shows image only), name, product id, qty.
  orderItemHtml(i, opts) {
    opts = opts || {};
    const code = PP.esc(PP.code(i));
    const url = PP.imgUrl(i.product_image || i.image);
    const img = url
      ? '<span class="oi-img"><img loading="lazy" src="' + PP.esc(url) + '" alt="' + PP.esc(i.name || 'Product') + '" onerror="this.onerror=null;this.parentElement.className=\'oi-img oi-none\';this.parentElement.innerHTML=\'PP\';"></span>'
      : '<span class="oi-img oi-none">PP</span>';
    return '<div class="oi' + (opts.cls ? ' ' + opts.cls : '') + '">' + img +
      '<div class="oi-text"><b>' + PP.esc(i.name || 'Product') + '</b>' +
      '<span class="oi-meta"><span class="oi-id">Product ID: ' + code + '</span><span class="oi-qty">Qty: ' + Number(i.qty || 1) + '</span></span></div>' +
      (opts.price ? '<strong class="oi-price">' + PP.money(Number(i.price || 0) * Number(i.qty || 1)) + '</strong>' : '') + '</div>';
  },

  money(n) {
    return PP.config.currency + Number(n).toFixed(2);
  },

  date(d) {
    return new Date(d).toLocaleString(PP.lang === 'km' ? 'km-KH' : PP.lang === 'zh' ? 'zh-CN' : 'en-US');
  },

  // ----- login state -----
  token() {
    return localStorage.getItem('pp_token');
  },

  user() {
    try {
      return JSON.parse(localStorage.getItem('pp_user'));
    } catch (e) {
      return null;
    }
  },

  setAuth(token, user) {
    localStorage.setItem('pp_token', token);
    localStorage.setItem('pp_user', JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem('pp_token');
    localStorage.removeItem('pp_user');
    location.href = '/';
  },

  // Use on pages that need a login. Sends the visitor to /login.html and back.
  requireLogin(adminOnly) {
    const u = PP.user();

    if (!PP.token() || !u) {
      location.href = '/login.html?next=' +
        encodeURIComponent(location.pathname + location.search);
      return false;
    }

    if (adminOnly && u.role !== 'admin') {
      location.href = '/';
      return false;
    }

    return true;
  },

  // ----- API -----
  async api(path, opts) {
    opts = opts || {};
    const headers = opts.headers || {};

    if (PP.token()) {
      headers.Authorization = 'Bearer ' + PP.token();
    }

    let body = opts.body;

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    let requestPath = path;

    const method = (opts.method || 'GET').toUpperCase();
    const pathOnly = path.split('?')[0];
    const productCatalogPath = method === 'GET' && (
      pathOnly === '/products' ||
      pathOnly === '/products/categories' ||
      /^\/products\/\d+$/.test(pathOnly)
    );
    const customerOrderPath = (
      pathOnly === '/orders/mine' && method === 'GET' ||
      pathOnly === '/orders/lookup' && method === 'POST' ||
      /^\/orders\/\d+$/.test(pathOnly) && method === 'GET'
    );
    if ((productCatalogPath || customerOrderPath) && !/[?&]lang=/.test(path)) {
      requestPath +=
        (path.includes('?') ? '&' : '?') +
        'lang=' +
        encodeURIComponent(PP.lang);
    }

    const res = await fetch('/api' + requestPath, {
      method: opts.method || 'GET',
      headers,
      body
    });

    let data = {};

    try {
      data = await res.json();
    } catch (e) {
      /* no body */
    }

    if (res.status === 401 && PP.token()) {
      localStorage.removeItem('pp_token');
      localStorage.removeItem('pp_user');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }

    return data;
  },

  // ----- cart (saved in the browser: [{id, qty}]) -----
  cart() {
    try {
      return JSON.parse(localStorage.getItem('pp_cart')) || [];
    } catch (e) {
      return [];
    }
  },

  saveCart(c) {
    localStorage.setItem('pp_cart', JSON.stringify(c));
    PP.updateCount();
  },

  addToCart(id, qty) {
    const c = PP.cart();
    const f = c.find((i) => i.id === id);

    if (f) {
      f.qty += qty;
    } else {
      c.push({ id, qty });
    }

    PP.saveCart(c);
  },

  cartCount() {
    return PP.cart().reduce((n, i) => n + i.qty, 0);
  },

  updateCount() {
    const n = PP.cartCount();

    document.querySelectorAll('.cart-count').forEach((e) => {
      const old = e.textContent;

      e.textContent = n;

      if (old !== '' && String(old) !== String(n)) {
        e.classList.remove('bump');
        void e.offsetWidth;
        e.classList.add('bump');
      }
    });
  },

  // ----- guest orders (no login: the browser remembers {id, token, total, status}) -----
  myOrders() {
    try {
      return JSON.parse(localStorage.getItem('pp_orders')) || [];
    } catch (e) {
      return [];
    }
  },

  saveOrder(o) {
    const all = PP.myOrders();
    const old = all.find((x) => x.id === o.id) || {};
    const list = all.filter((x) => x.id !== o.id);

    list.unshift(Object.assign({}, old, o));

    localStorage.setItem(
      'pp_orders',
      JSON.stringify(list.slice(0, 30))
    );
  },

  orderToken(id) {
    const f = PP.myOrders().find(
      (x) => String(x.id) === String(id)
    );

    return f ? f.token : '';
  },

  // remembers the delivery details so the next order is quicker
  customer() {
    try {
      return JSON.parse(localStorage.getItem('pp_cust')) || {};
    } catch (e) {
      return {};
    }
  },

  saveCustomer(c) {
    localStorage.setItem('pp_cust', JSON.stringify(c));
  },

  // Shrinks big phone screenshots before upload (faster, and avoids the 5 MB limit).
  // Falls back to the original file if anything goes wrong.
  async compressImage(file, maxSide, quality) {
    maxSide = maxSide || 2200;
    quality = quality || 0.86;

    try {
      if (
        !/^image\/(jpeg|png|webp)$/.test(file.type) ||
        file.size < 600 * 1024
      ) {
        return file;
      }

      const url = URL.createObjectURL(file);

      const img = await new Promise((ok, bad) => {
        const i = new Image();

        i.onload = () => ok(i);
        i.onerror = bad;
        i.src = url;
      });

      URL.revokeObjectURL(url);

      const scale = Math.min(
        1,
        maxSide / Math.max(
          img.naturalWidth,
          img.naturalHeight
        )
      );

      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement('canvas');

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);

      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise((r) =>
        canvas.toBlob(r, 'image/jpeg', quality)
      );

      if (!blob || blob.size >= file.size) {
        return file;
      }

      return new File(
        [blob],
        file.name.replace(/\.\w+$/, '') + '.jpg',
        {
          type: 'image/jpeg'
        }
      );

    } catch (e) {
      return file;
    }
  },

  // ----- chat box (code is in /js/chat.js) -----
  loadChat() {
    if (PP._chatLoading) return;

    PP._chatLoading = true;

    const s = document.createElement('script');

    s.src = '/js/chat.js';

    document.body.appendChild(s);
  },

  openChat() {
    if (PP._noChat) return;

    if (PP._openChat) {
      PP._openChat();
    } else {
      PP._wantChat = true;
      PP.loadChat();
    }
  },

  toast(msg) {
    const t = document.createElement('div');

    t.className = 'toast';
    t.textContent = msg;

    document.body.appendChild(t);

    setTimeout(() => t.classList.add('out'), 2100);
    setTimeout(() => t.remove(), 2500);
  },

  placeholder:
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',

  // ----- header + footer -----
  async layout(active) {
    try {
      PP.config = await (await fetch('/api/config')).json();
    } catch (e) {
      /* keep defaults */
    }

    // Refresh the logged-in user from the database before drawing the header.
    // This keeps the Admin link correct after an account is promoted/demoted.
    if (PP.token()) {
      try {
        const r = await fetch('/api/auth/me', {
          headers: {
            Authorization: 'Bearer ' + PP.token()
          }
        });

        if (r.ok) {
          const data = await r.json();

          localStorage.setItem(
            'pp_user',
            JSON.stringify(data.user)
          );

        } else if (r.status === 401) {
          localStorage.removeItem('pp_token');
          localStorage.removeItem('pp_user');
        }

      } catch (e) {
        /* keep existing session state */
      }
    }

    document
      .querySelectorAll('[data-lang-logo]')
      .forEach((img) => {
        img.src = '/images/logo-' + PP.lang + '.png';
      });

    document.title =
      (document.title ? document.title + ' | ' : '') +
      PP.config.name;

    const u = PP.user();

    const header = document.getElementById('site-header');

    if (header) {
      header.className = 'site-header';
      const logoFile = '/images/logo-en.png';
      const catUrl = (name) => '/?category=' + encodeURIComponent(name);
      const selectedCategory = new URLSearchParams(location.search).get('category');
      const link = (href, key, text) => '<a href="' + href + '"' + (active === key ? ' class="active"' : '') + '>' + text + '</a>';
      const categoryLink = (name, label) => '<a href="' + catUrl(name) + '"' + (selectedCategory === name ? ' class="active"' : '') + '>' + label + '</a>';
      const unpaid = PP.myOrders().filter((o) => o.status === 'waiting_pay').length;

      const bagIcon = '<svg class="ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';

      header.innerHTML =
        '<div class="container bar">' +
        '<div class="brand brand-static"><img src="' + logoFile + '" alt="' + PP.esc(PP.config.name) + '"></div>' +
        '<nav class="nav" id="nav">' +
        '<a class="shop-nav-link' + (!selectedCategory && active === 'home' ? ' active' : '') + '" href="/">PP Queen Shop</a>' +
        categoryLink('Bags', PP.icons.bags + '<span>Bags</span>') +
        categoryLink('Shampoo', PP.icons.shampoo + '<span>Shampoo</span>') +
        link('/orders.html', 'orders', 'My orders' + (unpaid ? '<span class="nav-badge" title="Waiting for payment">' + unpaid + '</span>' : '')) +
        (u && u.role === 'admin' ? link('/admin/index.html', 'admin', 'Admin') : '') +
        '</nav>' +
        '<div class="header-right">' +
        '<div class="lang-menu" id="lang-menu"><button type="button" class="lang-btn" id="lang-btn" aria-haspopup="true" aria-expanded="false" aria-label="Language: ' + PP.langNames[PP.lang] + '" title="' + PP.langNames[PP.lang] + '">' + PP.flags[PP.lang] + '</button><div class="lang-list" id="lang-list" role="menu">' + ['en', 'km', 'zh'].map((l) => '<button type="button" role="menuitem" class="lang-opt' + (l === PP.lang ? ' on' : '') + '" data-lang="' + l + '" aria-label="' + PP.langNames[l] + '" title="' + PP.langNames[l] + '">' + PP.flags[l] + '</button>').join('') + '</div></div>' +
        '<a class="cart-link' + (active === 'cart' ? ' active' : '') + '" href="/cart.html" aria-label="Cart">' +
        bagIcon + '<span class="cart-text">Cart</span> <span class="cart-count">' + PP.cartCount() + '</span></a>' +
        (u ? '<button class="btn ghost small" id="logout-btn">Log out</button>' : '') +
        '<button class="menu-btn" id="menu-btn" aria-label="Menu" aria-expanded="false">☰</button>' +
        '</div></div>';

      const nav = document.getElementById('nav');
      const mb = document.getElementById('menu-btn');
      const setMenu = (open) => { nav.classList.toggle('open', open); mb.setAttribute('aria-expanded', open ? 'true' : 'false'); mb.textContent = open ? '✕' : '☰'; };
      mb.onclick = (e) => { e.stopPropagation(); setMenu(!nav.classList.contains('open')); };
      nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
      document.addEventListener('click', (e) => { if (!e.target.closest('.site-header')) setMenu(false); });
      const setLang = (l) => { if (window.I18N) window.I18N.set(l); else { localStorage.setItem('pp_lang', l); location.reload(); } };
      const lm = document.getElementById('lang-menu'), lb = document.getElementById('lang-btn');
      if (lb) {
        lb.onclick = (e) => { e.stopPropagation(); const o = lm.classList.toggle('open'); lb.setAttribute('aria-expanded', o ? 'true' : 'false'); };
        lm.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => { if (b.dataset.lang === PP.lang) { lm.classList.remove('open'); return; } setLang(b.dataset.lang); });
        document.addEventListener('click', (e) => { if (!e.target.closest('#lang-menu')) lm.classList.remove('open'); });
      }
      const lo = document.getElementById('logout-btn');
      if (lo) lo.onclick = PP.logout;
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 6);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    const footer =
      document.getElementById('site-footer');

    if (footer) {
      footer.className = 'site-footer';

      footer.innerHTML =
        '<div class="container">' +
        '<div class="footer-grid">' +

        '<div>' +
        '<img class="footer-logo" src="/images/logo-' +
        PP.lang +
        '.png" alt="' +
        PP.esc(PP.config.name) +
        '">' +
        '<p style="margin-top:12px">Pretty things for every queen.</p>' +
        '</div>' +

        '<div>' +
        '<h4>Quick links</h4>' +
        '<a href="/"><span class="footer-link-icon" aria-hidden="true">⌂</span> Shop</a>' +
        '<a href="/cart.html"><span class="footer-link-icon" aria-hidden="true">▣</span> Cart</a>' +
        '<a href="/orders.html"><span class="footer-link-icon" aria-hidden="true">▤</span> My orders</a>' +
        '<a href="#chat" data-open-chat><span class="footer-link-icon" aria-hidden="true">✉</span> Chat with us</a>' +
        '</div>' +

        '<div>' +
        '<h4>Contact</h4>' +

        (
          PP.config.phone
            ? '<p><span class="footer-link-icon" aria-hidden="true">☎</span> Phone: ' +
            PP.esc(PP.config.phone) +
            '</p>'
            : ''
        ) +

        (PP.config.facebookUrl ? '<p><a href="' + PP.esc(PP.config.facebookUrl) + '" target="_blank" rel="noopener noreferrer"><span class="footer-link-icon" aria-hidden="true">f</span> Facebook Page</a></p>' : '') +
        (PP.config.telegramUrl ? '<p><a href="' + PP.esc(PP.config.telegramUrl) + '" target="_blank" rel="noopener noreferrer"><span class="footer-link-icon" aria-hidden="true">➤</span> Telegram Group</a></p>' : '') +
        (PP.config.address ? '<p><span class="footer-link-icon" aria-hidden="true">⌖</span> ' + PP.esc(PP.config.address) + '</p>' : '') +

        '<p>Pay by QR. Order updates come to you fast.</p>' +

        '</div>' +

        '</div>' +

        '<div class="copyright">© ' +
        new Date().getFullYear() +
        ' ' +
        PP.esc(PP.config.name) +
        '. All rights reserved.</div>' +

        '</div>';
    }

    PP._noChat = active === 'admin';

    if (!PP._noChat) {
      PP.loadChat();
    }

    PP.updateCount();
  }
};