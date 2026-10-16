from pathlib import Path

root=Path('/tmp/ppq')

# Force English UI and simplify the header: logo is not a link; Shop/Bags/Shampoo are underlined nav links.
p=root/'public/js/app.js'
s=p.read_text()
s=s.replace("  lang: (window.I18N && window.I18N.lang) || 'en',", "  lang: 'en',")
start=s.index("    if (header) {\n      header.className = 'site-header';")
end=s.index("\n    const footer =", start)
new_header=r'''    if (header) {
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
        link('/', 'home', 'Shop') +
        categoryLink('Bags', 'Bags') +
        categoryLink('Shampoo', 'Shampoo') +
        link('/orders.html', 'orders', 'My orders' + (unpaid ? '<span class="nav-badge" title="Waiting for payment">' + unpaid + '</span>' : '')) +
        (u && u.role === 'admin' ? link('/admin/index.html', 'admin', 'Admin') : '') +
        '</nav>' +
        '<div class="header-right">' +
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
      const lo = document.getElementById('logout-btn');
      if (lo) lo.onclick = PP.logout;
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 6);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
'''
s=s[:start]+new_header+s[end:]
p.write_text(s)

# English-only UI: no language script needed.
for f in ['index.html','product.html','cart.html','checkout.html','payment.html','orders.html','login.html','admin/index.html']:
    p=root/'public'/f
    s=p.read_text()
    s=s.replace('  <script src="/js/i18n.js"></script>\n','')
    p.write_text(s)

# Home product cards: exactly two actions.
p=root/'public/index.html'; s=p.read_text()
old="""        grid.innerHTML = list.map((p) =>
          '<a class=\"card\" href=\"/product.html?id=' + p.id + '\">' +
          '<div class=\"thumb\">' + (p.image ? '<img loading=\"lazy\" src=\"' + p.image + '\" alt=\"' + PP.esc(p.name) + '\">' : PP.placeholder) + '</div>' +
          '<div class=\"info\">' +
          '<span class=\"name\">' + PP.esc(p.name) + '</span>' +
          '<span class=\"price\">' + PP.money(p.price) + '</span>' +
          (p.stock <= 0 ? '<span class=\"badge bad\">Sold out</span>' : p.stock <= 3 ? '<span class=\"badge warn\">Only ' + p.stock + ' left</span>' : '') +
          (p.stock > 0 ? '<button type=\"button\" class=\"quick-add\" data-add=\"' + p.id + '\"><span aria-hidden=\"true\">+</span> Add to cart</button>' : '') +
          '</div></a>').join('');
        grid.querySelectorAll('[data-add]').forEach((b) => b.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          PP.addToCart(+b.dataset.add, 1); PP.toast('Added to cart');
          b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 900);
        });"""
new="""        grid.innerHTML = list.map((p) =>
          '<article class=\"card\">' +
          '<div class=\"thumb\">' + (p.image ? '<img loading=\"lazy\" src=\"' + p.image + '\" alt=\"' + PP.esc(p.name) + '\">' : PP.placeholder) + '</div>' +
          '<div class=\"info\">' +
          '<span class=\"name\">' + PP.esc(p.name) + '</span>' +
          '<span class=\"price\">' + PP.money(p.price) + '</span>' +
          (p.stock <= 0 ? '<span class=\"badge bad\">Sold out</span>' : p.stock <= 3 ? '<span class=\"badge warn\">Only ' + p.stock + ' left</span>' : '') +
          '<div class=\"card-actions\">' +
          (p.stock > 0 ? '<button type=\"button\" class=\"quick-add\" data-add=\"' + p.id + '\"><span aria-hidden=\"true\">+</span> Add to cart</button>' : '<button type=\"button\" class=\"quick-add\" disabled>Sold out</button>') +
          '<a class=\"btn ghost card-view\" href=\"/product.html?id=' + p.id + '\">View product</a>' +
          '</div></div></article>').join('');
        grid.querySelectorAll('[data-add]').forEach((b) => b.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          PP.addToCart(+b.dataset.add, 1); PP.toast('Added to cart');
          b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 900);
        });"""
if old not in s: raise SystemExit('home card block not found')
s=s.replace(old,new)
p.write_text(s)

# Product detail recommendations use the same two-button card pattern.
p=root/'public/product.html'; s=p.read_text()
old="""          (p.related.length ? '<h2 style=\"margin-top:48px\">You may also like</h2><div class=\"grid\">' + p.related.map((r) =>
            '<a class=\"card\" href=\"/product.html?id=' + r.id + '\"><div class=\"thumb\">' + (r.image ? '<img loading=\"lazy\" src=\"' + r.image + '\" alt=\"\">' : PP.placeholder) +
            '</div><div class=\"info\"><span class=\"name\">' + PP.esc(r.name) + '</span><span class=\"price\">' + PP.money(r.price) + '</span></div></a>').join('') + '</div>' : '');"""
new="""          (p.related.length ? '<h2 style=\"margin-top:48px\">Recommended from the same category</h2><div class=\"grid\">' + p.related.map((r) =>
            '<article class=\"card\"><div class=\"thumb\">' + (r.image ? '<img loading=\"lazy\" src=\"' + r.image + '\" alt=\"' + PP.esc(r.name) + '\">' : PP.placeholder) +
            '</div><div class=\"info\"><span class=\"name\">' + PP.esc(r.name) + '</span><span class=\"price\">' + PP.money(r.price) + '</span><div class=\"card-actions\"><button type=\"button\" class=\"quick-add\" data-related-add=\"' + r.id + '\"' + (r.stock <= 0 ? ' disabled' : '') + '>' + (r.stock <= 0 ? 'Sold out' : '+ Add to cart') + '</button><a class=\"btn ghost card-view\" href=\"/product.html?id=' + r.id + '\">View product</a></div></div></article>').join('') + '</div>' : '');"""
if old not in s: raise SystemExit('product related block not found')
s=s.replace(old,new)
old2="""        if (!soldOut) {
          const q = document.getElementById('q');"""
new2="""        document.querySelectorAll('[data-related-add]').forEach((b) => b.onclick = () => {
          if (b.disabled) return;
          PP.addToCart(+b.dataset.relatedAdd, 1); PP.toast('Added to cart');
          b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 900);
        });
        if (!soldOut) {
          const q = document.getElementById('q');"""
s=s.replace(old2,new2)
p.write_text(s)

# CSS for explicit two-button cards and narrower forms/modals.
p=root/'public/css/style.css'; s=p.read_text()
s += r'''

/* PP Queen shop flow refinements */
.brand-static { cursor: default; }
.brand-static img { pointer-events: none; }
.card-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.card-actions .quick-add, .card-actions .card-view { margin-top: 0; width: 100%; min-height: 42px; }
.card-view { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
.quick-add:disabled { opacity: .55; cursor: not-allowed; }
.modal { width: min(560px, calc(100vw - 28px)); max-height: 90vh; overflow-y: auto; }
.modal .row > div { min-width: 0; flex: 1 1 0; }
.auth-box { width: min(480px, 100%); margin-left: auto; margin-right: auto; }
.two-col > .panel:first-child { width: min(560px, 100%); }
.form-narrow { width: min(560px, 100%); margin-left: auto; margin-right: auto; }
'''
p.write_text(s)

# Schema: only customer-facing statuses waiting_pay, paid, success. Existing terminal statuses become success to keep old orders visible and complete.
p=root/'db/schema.sql'; s=p.read_text()
old="""ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
UPDATE orders SET status = CASE status
  WHEN 'pending' THEN 'waiting_pay'
  WHEN 'paid' THEN 'paid'
  WHEN 'shipped' THEN 'success'
  WHEN 'done' THEN 'done'
  WHEN 'cancelled' THEN 'reject'
  ELSE 'waiting_pay' END;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('waiting_pay','paid','success','done','reject'));"""
new="""ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
UPDATE orders SET status = CASE status
  WHEN 'pending' THEN 'waiting_pay'
  WHEN 'waiting_pay' THEN 'waiting_pay'
  WHEN 'paid' THEN 'paid'
  WHEN 'shipped' THEN 'success'
  WHEN 'success' THEN 'success'
  WHEN 'done' THEN 'success'
  WHEN 'reject' THEN 'waiting_pay'
  WHEN 'cancelled' THEN 'waiting_pay'
  ELSE 'waiting_pay' END;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('waiting_pay','paid','success'));"""
if old not in s: raise SystemExit('schema status block not found')
s=s.replace(old,new)
p.write_text(s)

# Orders backend: final success; admin can only transition paid -> success.
p=root/'src/routes/orders.js'; s=p.read_text()
s=s.replace("const allowed = {\n      paid: ['success', 'reject'],\n      success: ['done'],\n      waiting_pay: ['reject'],\n      reject: [],\n      done: []\n    };", "const allowed = {\n      waiting_pay: [],\n      paid: ['success'],\n      success: []\n    };")
s=s.replace("if (status === 'reject' && o.status !== 'reject') {\n      await client.query('UPDATE products p SET stock = p.stock + i.qty FROM order_items i WHERE i.order_id = $1 AND i.product_id = p.id', [o.id]);\n    }\n", "")
s=s.replace("const label = { success: '✅ SUCCESS', done: '🎉 DONE', reject: '❌ REJECT' }[status];", "const label = { success: '✅ SUCCESS' }[status];")
s=s.replace("if (status === 'success') {", "if (status === 'success') {")
p.write_text(s)

# Admin: three statuses only, two product add category buttons, English-only product form.
p=root/'public/admin/index.html'; s=p.read_text()
s=s.replace('<button data-tab="categories">Categories</button>\n','')
s=s.replace("['dash', 'products', 'categories', 'orders', 'waiting-pay', 'waiting-confirm', 'chat']", "['dash', 'products', 'orders', 'waiting-pay', 'waiting-confirm', 'chat']")
s=s.replace("({ dash: loadDash, products: loadProducts, categories: loadCategories, orders: loadOrders, 'waiting-pay': () => loadOrders('waiting_pay', 'Waiting Payment'), 'waiting-confirm': () => loadOrders('paid', 'Waiting Confirm'), chat: loadChat })[name]();", "({ dash: loadDash, products: loadProducts, orders: loadOrders, 'waiting-pay': () => loadOrders('waiting_pay', 'Waiting Payment'), 'waiting-confirm': () => loadOrders('paid', 'Waiting Confirm'), chat: loadChat })[name]();")
s=s.replace("const STATUS = { waiting_pay: 'Waiting Pay', paid: 'Paid', success: 'Success', done: 'Done', reject: 'Reject' };\n    const statusClass = { waiting_pay: 'warn', paid: 'ok', success: 'ok', done: 'dark', reject: 'bad' };", "const STATUS = { waiting_pay: 'Waiting Payment', paid: 'Paid', success: 'Success' };\n    const statusClass = { waiting_pay: 'warn', paid: 'ok', success: 'dark' };")
s=s.replace("'<div class=\"row\" style=\"margin-bottom:14px\"><input id=\"p-search\" type=\"search\" placeholder=\"Search products\" style=\"flex:1 1 240px\">' +\n          '<button class=\"btn\" id=\"p-add-shampoo\" style=\"flex:0 0 auto\">Add Shampoo</button><button class=\"btn ghost\" id=\"p-add-bag\" style=\"flex:0 0 auto\">Add Bag</button></div><div id=\"p-table\"></div>';", "'<div class=\"row\" style=\"margin-bottom:14px\"><input id=\"p-search\" type=\"search\" placeholder=\"Search products\" style=\"flex:1 1 240px\">' +\n          '<button class=\"btn\" id=\"p-add-bag\" style=\"flex:0 0 auto\">Add Bag</button><button class=\"btn ghost\" id=\"p-add-shampoo\" style=\"flex:0 0 auto\">Add Shampoo</button></div><div id=\"p-table\"></div>';" )
# Replace productForm wholesale between its start and Categories marker.
start=s.index('    async function productForm(p, viewOnly, forcedCategory) {')
end=s.index('    /* ---------- Categories ---------- */', start)
new_pf=r'''    async function productForm(p, viewOnly, forcedCategory) {
      const edit = !!p;
      const category = forcedCategory || (p && p.category) || 'Bags';
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      const ro = viewOnly ? ' readonly' : '';
      const dis = viewOnly ? ' disabled' : '';
      bg.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">' +
        '<h2 id="product-modal-title">' + (viewOnly ? 'View product' : edit ? 'Edit product' : 'Add ' + category) + '</h2><div id="f-msg"></div>' +
        '<label for="f-name">Product name</label><input id="f-name" maxlength="180" value="' + PP.esc(edit ? p.name : '') + '"' + ro + ' required>' +
        '<div class="row"><div><label for="f-price">Price</label><input id="f-price" type="number" min="0" step="0.01" value="' + (edit ? p.price : '') + '"' + ro + ' required></div>' +
        '<div><label for="f-stock">Stock</label><input id="f-stock" type="number" min="0" step="1" value="' + (edit ? p.stock : 0) + '"' + ro + ' required></div></div>' +
        '<label for="f-cat">Category</label><select id="f-cat"' + dis + '><option value="Bags"' + (category === 'Bags' ? ' selected' : '') + '>Bags</option><option value="Shampoo"' + (category === 'Shampoo' ? ' selected' : '') + '>Shampoo</option></select>' +
        '<label for="f-desc">Description</label><textarea id="f-desc" maxlength="5000"' + ro + '></textarea>' +
        (edit && p.images.length ? '<label>Current images</label><div class="img-edit">' + p.images.map((im) =>
          '<div class="it' + (im.is_main ? ' main' : '') + '"><img src="' + im.url + '" alt=""><label style="margin:4px 0;font-weight:600"><input type="radio" name="main" value="' + im.id + '"' + (im.is_main ? ' checked' : '') + (viewOnly ? ' disabled' : '') + ' style="width:auto"> Main</label>' +
          (!viewOnly ? '<label style="margin:0;font-weight:600"><input type="checkbox" class="rm" value="' + im.id + '" style="width:auto"> Remove</label>' : '') +
          '</div>').join('') + '</div>' : '') +
        (!viewOnly ? '<label for="f-files">Product images (up to 8)</label><input id="f-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple><div class="img-edit" id="f-preview"></div>' : '') +
        '<div class="row" style="margin-top:18px">' +
        (!viewOnly ? '<button class="btn" id="f-save">Save</button>' : '<button class="btn" id="f-edit">Edit</button>') +
        '<button class="btn ghost" id="f-cancel">Close</button></div></div>';
      document.body.appendChild(bg);
      const close = () => bg.remove();
      bg.querySelector('#f-cancel').onclick = close;
      bg.onclick = (e) => { if (e.target === bg) close(); };
      if (viewOnly) bg.querySelector('#f-edit').onclick = () => { close(); productForm(p, false, p.category); };
      if (!viewOnly) {
        bg.querySelector('#f-files').onchange = (e) => {
          bg.querySelector('#f-preview').innerHTML = [...e.target.files].map((f) => '<div class="it"><img src="' + URL.createObjectURL(f) + '" alt=""></div>').join('');
        };
        bg.querySelector('#f-desc').value = edit ? (p.description || '') : '';
        bg.querySelector('#f-save').onclick = async (ev) => {
          const btn = ev.target, m = bg.querySelector('#f-msg'); m.innerHTML = '';
          const fd = new FormData();
          fd.append('name', bg.querySelector('#f-name').value);
          fd.append('name_km', ''); fd.append('name_zh', '');
          fd.append('price', bg.querySelector('#f-price').value);
          fd.append('stock', bg.querySelector('#f-stock').value);
          fd.append('category', bg.querySelector('#f-cat').value);
          fd.append('description', bg.querySelector('#f-desc').value);
          fd.append('description_km', ''); fd.append('description_zh', '');
          fd.append('active', 'true');
          if (edit) {
            fd.append('removeImages', JSON.stringify([...bg.querySelectorAll('.rm:checked')].map((c) => c.value)));
            const main = bg.querySelector('input[name=main]:checked'); if (main) fd.append('mainImageId', main.value);
          }
          [...bg.querySelector('#f-files').files].forEach((f) => fd.append('images', f));
          btn.disabled = true;
          try {
            await PP.api(edit ? '/products/' + p.id : '/products', { method: edit ? 'PUT' : 'POST', body: fd });
            close(); flash(edit ? 'Product updated.' : 'Product added.', true); loadProducts();
          } catch (e) { m.innerHTML = '<div class="alert error">' + PP.esc(e.message) + '</div>'; btn.disabled = false; }
        };
      }
    }

'''
s=s[:start]+new_pf+s[end:]
# Remove Categories section through Orders marker.
start=s.index('    /* ---------- Categories ---------- */')
end=s.index('    /* ---------- Orders ---------- */', start)
s=s[:start]+s[end:]
# Order filter statuses and detail actions.
s=s.replace("['waiting_pay', 'paid', 'success', 'done', 'reject']", "['waiting_pay', 'paid', 'success']")
old="""        const btns = [];
        if (o.status === 'paid') btns.push(['success', 'Confirm order', '']);
        if (o.status === 'success') btns.push(['done', 'Mark as done', '']);
        if (o.status === 'paid' || o.status === 'waiting_pay') btns.push(['reject', 'Reject', 'danger']);"""
new="""        const btns = [];
        if (o.status === 'paid') btns.push(['success', 'Complete order', '']);"""
if old not in s: raise SystemExit('admin status button block not found')
s=s.replace(old,new)
s=s.replace("          if (b.dataset.st === 'reject' && !confirm('Reject this order? The stock will be returned.')) return;\n", '')
s=s.replace("loadOrders('paid', 'Waiting Confirm')", "loadOrders('paid', 'Waiting Confirm')")
p.write_text(s)

# Orders customer page: only three statuses, no reject/done.
p=root/'public/orders.html'; s=p.read_text()
s=s.replace("const STATUS = { waiting_pay:'Waiting Pay', paid:'Paid', success:'Success', done:'Done', reject:'Reject' };", "const STATUS = { waiting_pay:'Waiting Payment', paid:'Paid', success:'Success' };")
s=s.replace("const badge = (s) => '<span class=\"badge ' + ({ waiting_pay: 'warn', paid: 'ok', success:'ok', done: 'dark', reject: 'bad' }[s] || '') + '\">' + (STATUS[s] || s) + '</span>';", "const badge = (s) => '<span class=\"badge ' + ({ waiting_pay: 'warn', paid: 'ok', success:'dark' }[s] || '') + '\">' + (STATUS[s] || s) + '</span>';" )
s=s.replace("const track = (s) => s === 'reject' ? '<div class=\"order-track rejected\"><span class=\"track-step active\">Reject</span></div>' : '<div class=\"order-track\">' + ['waiting_pay','paid','success','done'].map((x,i) => '<span class=\"track-step ' + (['waiting_pay','paid','success','done'].indexOf(s) >= i ? 'active' : '') + '\">' + STATUS[x] + '</span>').join('') + '</div>';", "const track = (s) => '<div class=\"order-track\">' + ['waiting_pay','paid','success'].map((x,i) => '<span class=\"track-step ' + (['waiting_pay','paid','success'].indexOf(s) >= i ? 'active' : '') + '\">' + STATUS[x] + '</span>').join('') + '</div>';" )
p.write_text(s)

# Payment page: only three-step status display and English wording.
p=root/'public/payment.html'; s=p.read_text()
s=s.replace("const STATUS_STEPS = ['waiting_pay','paid','success','done'];", "const STATUS_STEPS = ['waiting_pay','paid','success'];")
s=s.replace("const STATUS_LABELS = { waiting_pay: 'Waiting Pay', paid: 'Paid', success: 'Success', done: 'Done', reject: 'Reject' };", "const STATUS_LABELS = { waiting_pay: 'Waiting Payment', paid: 'Paid', success: 'Success' };")
s=s.replace("const rejected = o.status === 'reject';\n      view.innerHTML = '<div class=\"panel auth-box\"><img src=\"/images/logo-en.png\" data-lang-logo alt=\"\"><h2>' + (rejected ? 'Order rejected' : 'Order status') + '</h2>' +", "view.innerHTML = '<div class=\"panel auth-box\"><img src=\"/images/logo-en.png\" data-lang-logo alt=\"\"><h2>Order status</h2>' +")
s=s.replace("'<p><span class=\"badge ' + (rejected ? 'bad' : 'ok') + '\">' + PP.esc(STATUS_LABELS[o.status] || o.status) + '</span></p>'", "'<p><span class=\"badge ok\">' + PP.esc(STATUS_LABELS[o.status] || o.status) + '</span></p>'")
p.write_text(s)

# Remove old multilingual script file usage completely; keep file harmlessly present for compatibility.

print('patched')
