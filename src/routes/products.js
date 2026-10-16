const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../upload');

const router = express.Router();
const importUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = file.fieldname === 'file' && ['.xlsx', '.xls'].includes(ext) ? ext
        : ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype] || '');
      if (!safeExt) return cb(new Error(file.fieldname === 'file' ? 'Please choose an .xlsx or .xls workbook.' : 'Only JPG, PNG, WEBP, or GIF product images are allowed.'));
      cb(null, Date.now() + '-' + require('crypto').randomBytes(6).toString('hex') + safeExt);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'file') return cb(null, /\\.xlsx?$/i.test(file.originalname));
    if (['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP, or GIF product images are allowed.'));
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 51 }
});
const LANGS = new Set(['en', 'km', 'zh']);

function langOf(req) {
  const lang = String(req.query.lang || req.headers['accept-language'] || 'en').toLowerCase();
  if (lang.startsWith('km')) return 'km';
  if (lang.startsWith('zh')) return 'zh';
  return 'en';
}

async function withImages(products) {
  if (!products.length) return products;
  const ids = products.map((p) => p.id);
  const imgs = await pool.query(
    'SELECT id, product_id, filename, is_main FROM product_images WHERE product_id = ANY($1) ORDER BY is_main DESC, sort_order ASC, id ASC',
    [ids]
  );
  const map = {};
  imgs.rows.forEach((i) => {
    (map[i.product_id] = map[i.product_id] || []).push({
      id: i.id, url: '/uploads/' + i.filename, is_main: i.is_main
    });
  });
  return products.map((p) => ({
    ...p,
    price: Number(p.price),
    images: map[p.id] || [],
    image: (map[p.id] && map[p.id][0] && map[p.id][0].url) || null
  }));
}

function localizeProduct(p, lang) {
  const name = lang === 'km' ? p.name_km : lang === 'zh' ? p.name_zh : p.name;
  const description = lang === 'km' ? p.description_km : lang === 'zh' ? p.description_zh : p.description;
  const category = p.category_info
    ? (lang === 'km' ? p.category_info.name_km : lang === 'zh' ? p.category_info.name_zh : p.category_info.name_en)
    : p.category;
  return {
    ...p,
    name: String(name || '').trim() || p.name,
    description: String(description || '').trim() || p.description,
    category: String(category || '').trim(),
    category_en: p.category_info ? p.category_info.name_en : p.category,
    category_info: undefined
  };
}

function removeFile(filename) {
  if (!filename) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(filename)), () => {});
}

function cleanText(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function parseNonNegativeInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function parsePrice(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// ---------- Public ----------

router.get('/', async (req, res) => {
  try {
    const lang = langOf(req);
    const { search, category, sort } = req.query;
    const where = ['p.active = TRUE'];
    const params = [];
    if (search) {
      params.push('%' + String(search).slice(0, 80) + '%');
      where.push('(p.name ILIKE $' + params.length + ' OR p.name_km ILIKE $' + params.length + ' OR p.name_zh ILIKE $' + params.length + ' OR p.product_code ILIKE $' + params.length + ')');
    }
    if (category) {
      params.push(String(category).slice(0, 120));
      where.push('p.category = $' + params.length);
    }
    const order = sort === 'price_asc' ? 'p.price ASC'
      : sort === 'price_desc' ? 'p.price DESC'
      : 'p.created_at DESC';
    const r = await pool.query(
      `SELECT p.*, json_build_object('name_en',c.name_en,'name_km',c.name_km,'name_zh',c.name_zh) AS category_info
       FROM products p LEFT JOIN categories c ON c.name_en = p.category
       WHERE ${where.join(' AND ')} ORDER BY ${order}`,
      params
    );
    const full = await withImages(r.rows);
    res.json(full.map((p) => localizeProduct(p, lang)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load products.' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const lang = langOf(req);
    const r = await pool.query(
      `SELECT id, name_en, name_km, name_zh
       FROM categories WHERE active = TRUE
       ORDER BY sort_order ASC, name_en ASC`
    );
    res.json(r.rows.map((c) => ({
      id: c.id,
      slug: c.name_en,
      name: lang === 'km' ? (c.name_km || c.name_en) : lang === 'zh' ? (c.name_zh || c.name_en) : c.name_en,
      name_en: c.name_en,
      name_km: c.name_km,
      name_zh: c.name_zh
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load categories.' });
  }
});

router.get('/:id(\\d+)', async (req, res) => {
  try {
    const lang = langOf(req);
    const r = await pool.query(
      `SELECT p.*, json_build_object('name_en',c.name_en,'name_km',c.name_km,'name_zh',c.name_zh) AS category_info
       FROM products p LEFT JOIN categories c ON c.name_en=p.category
       WHERE p.id=$1 AND p.active=TRUE`,
      [req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Product not found.' });
    const [p] = await withImages(r.rows);
    const related = await pool.query(
      `SELECT p.*, json_build_object('name_en',c.name_en,'name_km',c.name_km,'name_zh',c.name_zh) AS category_info
       FROM products p LEFT JOIN categories c ON c.name_en=p.category
       WHERE p.active=TRUE AND p.id<>$1 AND p.category=$2
       ORDER BY ABS(p.price-$3), p.created_at DESC LIMIT 4`,
      [p.id, p.category, p.price]
    );
    const relatedFull = await withImages(related.rows);
    const localized = localizeProduct(p, lang);
    localized.related = relatedFull.map((x) => localizeProduct(x, lang));
    res.json(localized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load product.' });
  }
});

// ---------- Admin ----------

router.get('/admin/categories', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.*, COUNT(p.id)::int AS product_count
       FROM categories c LEFT JOIN products p ON p.category=c.name_en
       GROUP BY c.id ORDER BY c.sort_order, c.name_en`
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load categories.' });
  }
});

router.post('/admin/categories', requireAdmin, async (req, res) => {
  try {
    const name_en = cleanText(req.body.name_en, 100);
    const name_km = cleanText(req.body.name_km, 150);
    const name_zh = cleanText(req.body.name_zh, 100);
    const sort_order = parseNonNegativeInt(req.body.sort_order, 0);
    if (!name_en) return res.status(400).json({ error: 'English category name is required.' });
    const r = await pool.query(
      `INSERT INTO categories (name_en,name_km,name_zh,sort_order) VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [name_en, name_km, name_zh, sort_order]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That category already exists.' });
    console.error(err);
    res.status(500).json({ error: 'Could not save category.' });
  }
});

router.put('/admin/categories/:id(\\d+)', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const old = await client.query('SELECT * FROM categories WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!old.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Category not found.' });
    }
    const oldName = old.rows[0].name_en;
    const name_en = cleanText(req.body.name_en, 100);
    const name_km = cleanText(req.body.name_km, 150);
    const name_zh = cleanText(req.body.name_zh, 100);
    const sort_order = parseNonNegativeInt(req.body.sort_order, 0);
    const active = req.body.active !== false && req.body.active !== 'false';
    if (!name_en) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'English category name is required.' });
    }
    await client.query(
      `UPDATE categories SET name_en=$1,name_km=$2,name_zh=$3,sort_order=$4,active=$5 WHERE id=$6`,
      [name_en,name_km,name_zh,sort_order,active,req.params.id]
    );
    if (oldName !== name_en) {
      await client.query('UPDATE products SET category=$1 WHERE category=$2', [name_en, oldName]);
    }
    await client.query('COMMIT');
    const r = await pool.query('SELECT * FROM categories WHERE id=$1', [req.params.id]);
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'That category already exists.' });
    console.error(err);
    res.status(500).json({ error: 'Could not update category.' });
  } finally { client.release(); }
});

router.delete('/admin/categories/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const c = await pool.query('SELECT * FROM categories WHERE id=$1', [req.params.id]);
    if (!c.rowCount) return res.status(404).json({ error: 'Category not found.' });
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM products WHERE category=$1', [c.rows[0].name_en]);
    if (count.rows[0].n > 0) return res.status(409).json({ error: 'Category has products. Move or remove those products first.' });
    await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete category.' });
  }
});


router.post('/admin/import', requireAdmin, importUpload.fields([{ name: 'file', maxCount: 1 }, { name: 'images', maxCount: 50 }]), async (req, res) => {
  const saved = [];
  const uploadedImages = (req.files && req.files.images) || [];
  const workbookFile = (req.files && req.files.file && req.files.file[0]) || null;
  if (workbookFile) saved.push(workbookFile.path);
  uploadedImages.forEach(f => saved.push(f.path));
  const imageByName = new Map();
  for (const f of uploadedImages) imageByName.set(path.basename(f.originalname).toLowerCase(), f);
  let created = 0, skipped = 0, imagesAttached = 0;
  try {
    if (!workbookFile) return res.status(400).json({ error: 'Choose an Excel .xlsx or .xls file to import.' });
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(workbookFile.path, { cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return res.status(400).json({ error: 'The workbook has no worksheet.' });
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'The worksheet contains no product rows.' });
    const keyOf = (row, aliases) => {
      const keys = Object.keys(row);
      for (const alias of aliases) {
        const found = keys.find(k => String(k).trim().toLowerCase() === alias.toLowerCase());
        if (found !== undefined && String(row[found] ?? '').trim() !== '') return row[found];
      }
      return '';
    };
    const normalizeCategory = value => {
      const c = String(value || '').trim().toLowerCase();
      if (['bag','bags'].includes(c)) return 'Bags';
      if (['shampoo','shampoos'].includes(c)) return 'Shampoo';
      return String(value || '').trim();
    };
    for (const row of rows) {
      const name = keyOf(row, ['Product Name','Product name','name','Name']);
      const category = normalizeCategory(keyOf(row, ['Category','category']));
      const price = keyOf(row, ['Price','price','Selling Price']);
      const stock = keyOf(row, ['Stock Quantity','Stock','stock','Quantity']);
      const description = keyOf(row, ['Description','description','Product Description']);
      const statusRaw = String(keyOf(row, ['Status','status','Active']) || 'Active').trim().toLowerCase();
      const imageName = String(keyOf(row, ['Image Filename (optional)','Image Filename','Image Filename (Optional)','Image','Image Name','Filename']) || '').trim();
      const v = validateProduct({
        name, price, stock, category, description,
        name_km: keyOf(row, ['Khmer name','Name Khmer','name_km']),
        name_zh: keyOf(row, ['Chinese name','Name Chinese','name_zh']),
        description_km: keyOf(row, ['Khmer description','description_km']),
        description_zh: keyOf(row, ['Chinese description','description_zh']),
        active: !['inactive','hidden','false','no','0','disabled'].includes(statusRaw)
      });
      if (!v || !['Bags','Shampoo'].includes(v.category) || !(await verifyCategory(v.category))) { skipped++; continue; }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const r = await client.query(
          `INSERT INTO products (name,name_km,name_zh,price,stock,category,description,description_km,description_zh,active,audience)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'') RETURNING id`,
          [v.name,v.name_km,v.name_zh,v.price,v.stock,v.category,v.description,v.description_km,v.description_zh,v.active]
        );
        const productId = r.rows[0].id;
        await client.query("UPDATE products SET product_code='PP' || LPAD(id::text, 2, '0') WHERE id=$1", [productId]);
        if (imageName) {
          const image = imageByName.get(path.basename(imageName).toLowerCase());
          if (image) {
            const destName = image.filename;
            await client.query('INSERT INTO product_images (product_id,filename,is_main,sort_order) VALUES ($1,$2,TRUE,0)', [productId, destName]);
            imageByName.delete(path.basename(image.originalname).toLowerCase());
            imagesAttached++;
          }
        }
        await client.query('COMMIT');
        created++;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally { client.release(); }
    }
    // Images not matched to a row are not needed; remove them to avoid orphaned uploads.
    for (const f of uploadedImages) {
      if (imageByName.get(path.basename(f.originalname).toLowerCase()) === f) {
        try { fs.unlinkSync(f.path); } catch (_) {}
      }
    }
    res.json({ created, skipped, imagesAttached, imagesUploaded: uploadedImages.length, unmatchedImages: Math.max(0, uploadedImages.length - imagesAttached) });
  } catch (err) {
    console.error('Product import failed:', err);
    res.status(400).json({ error: err.message && /Excel|workbook|image|file|worksheet/i.test(err.message) ? err.message : 'Could not import this workbook. Check the template columns, prices, stock quantities, and category names.' });
  } finally {
    for (const f of saved) {
      if (f === workbookFile?.path) { try { fs.unlinkSync(f); } catch (_) {} }
    }
  }
});

router.get('/admin/all', requireAdmin, async (req, res) => {
  const r = await pool.query(
    `SELECT p.*, json_build_object('name_en',c.name_en,'name_km',c.name_km,'name_zh',c.name_zh) AS category_info
     FROM products p LEFT JOIN categories c ON c.name_en=p.category ORDER BY p.created_at DESC`
  );
  res.json(await withImages(r.rows));
});

function validateProduct(body) {
  const name = cleanText(body.name, 180);
  const price = parsePrice(body.price);
  const stock = parseNonNegativeInt(body.stock, -1);
  if (!name || price === null || stock < 0) return null;
  return {
    name, price, stock,
    audience: '',
    category: cleanText(body.category, 100),
    name_km: cleanText(body.name_km, 180),
    name_zh: cleanText(body.name_zh, 180),
    description: cleanText(body.description, 5000),
    description_km: cleanText(body.description_km, 5000),
    description_zh: cleanText(body.description_zh, 5000),
    active: !(body.active === false || body.active === 'false')
  };
}

async function verifyCategory(category) {
  if (!category) return true;
  const r = await pool.query('SELECT 1 FROM categories WHERE name_en=$1 AND active=TRUE', [category]);
  return r.rowCount > 0;
}

router.post('/', requireAdmin, upload.array('images', 10), async (req, res) => {
  const files = req.files || [];
  try {
    const v = validateProduct(req.body);
    if (!v) {
      files.forEach((f) => removeFile(f.filename));
      return res.status(400).json({ error: 'Name, price and stock are required and must be valid.' });
    }
    if (!(await verifyCategory(v.category))) {
      files.forEach((f) => removeFile(f.filename));
      return res.status(400).json({ error: 'Please select a valid category.' });
    }
    const r = await pool.query(
      `INSERT INTO products (name,name_km,name_zh,price,stock,category,description,description_km,description_zh,active,audience)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [v.name,v.name_km,v.name_zh,v.price,v.stock,v.category,v.description,v.description_km,v.description_zh,v.active,v.audience]
    );
    let p = r.rows[0];
    p = (await pool.query("UPDATE products SET product_code='PP' || LPAD(id::text, 2, '0') WHERE id=$1 RETURNING *", [p.id])).rows[0];
    let mainIndex = parseInt(req.body.mainIndex, 10);
    if (!(mainIndex >= 0 && mainIndex < files.length)) mainIndex = 0;
    for (let i=0;i<files.length;i++) {
      await pool.query('INSERT INTO product_images (product_id,filename,is_main,sort_order) VALUES ($1,$2,$3,$4)', [p.id,files[i].filename,i===mainIndex,i]);
    }
    const [full] = await withImages([p]);
    res.status(201).json(full);
  } catch (err) {
    files.forEach((f) => removeFile(f.filename));
    console.error(err);
    res.status(500).json({ error: 'Could not save product.' });
  }
});

router.put('/:id(\\d+)', requireAdmin, upload.array('images', 10), async (req, res) => {
  const files = req.files || [];
  try {
    const id = req.params.id;
    const cur = await pool.query('SELECT * FROM products WHERE id=$1', [id]);
    if (!cur.rowCount) {
      files.forEach((f) => removeFile(f.filename));
      return res.status(404).json({ error: 'Product not found.' });
    }
    const v = validateProduct(req.body);
    if (!v) {
      files.forEach((f) => removeFile(f.filename));
      return res.status(400).json({ error: 'Name, price and stock are required and must be valid.' });
    }
    if (!(await verifyCategory(v.category))) {
      files.forEach((f) => removeFile(f.filename));
      return res.status(400).json({ error: 'Please select a valid category.' });
    }
    let toRemove = [];
    try { toRemove = JSON.parse(req.body.removeImages || '[]').map(Number).filter(Number.isInteger); } catch (_) {}
    const existing = await pool.query('SELECT id,filename FROM product_images WHERE product_id=$1', [id]);
    const remaining = existing.rows.filter((x) => !toRemove.includes(x.id)).length + files.length;
    if (remaining > 10) {
      files.forEach((f) => removeFile(f.filename));
      return res.status(400).json({ error: 'A product can have at most 10 images.' });
    }

    await pool.query(
      `UPDATE products SET name=$1,name_km=$2,name_zh=$3,price=$4,stock=$5,category=$6,description=$7,
       description_km=$8,description_zh=$9,active=$10,audience=$11 WHERE id=$12`,
      [v.name,v.name_km,v.name_zh,v.price,v.stock,v.category,v.description,v.description_km,v.description_zh,v.active,v.audience,id]
    );

    if (toRemove.length) {
      const del = await pool.query(
        'DELETE FROM product_images WHERE product_id=$1 AND id=ANY($2) RETURNING filename',
        [id,toRemove]
      );
      del.rows.forEach((d) => removeFile(d.filename));
    }
    for (const f of files) await pool.query(
      'INSERT INTO product_images (product_id,filename,is_main,sort_order) VALUES ($1,$2,FALSE,$3)',
      [id,f.filename,existing.rows.length + files.indexOf(f)]
    );

    let layout = null; try { const l = JSON.parse(req.body.layout || 'null'); if (Array.isArray(l)) layout = l.map(String); } catch (_) {}
    if (layout) {
      const rows = await pool.query('SELECT id FROM product_images WHERE product_id=$1 ORDER BY id DESC LIMIT $2', [id, files.length]);
      const newIds = rows.rows.map((r) => r.id).reverse(); // same order as the uploaded files
      const resolve = (key) => key.startsWith('old:') ? Number(key.slice(4)) : key.startsWith('new:') ? newIds[Number(key.slice(4))] : NaN;
      let pos = 0;
      for (const key of layout) {
        const imgId = resolve(key);
        if (Number.isInteger(imgId)) await pool.query('UPDATE product_images SET sort_order=$1 WHERE id=$2 AND product_id=$3', [pos++, imgId, id]);
      }
      const mainId = resolve(String(req.body.main || ''));
      if (Number.isInteger(mainId)) await pool.query('UPDATE product_images SET is_main=(id=$1) WHERE product_id=$2', [mainId, id]);
    }
    let imageOrder = []; if (!layout) try { imageOrder = JSON.parse(req.body.imageOrder || '[]').map(Number).filter(Number.isInteger); } catch (_) {}
    for (let i=0;i<imageOrder.length;i++) await pool.query('UPDATE product_images SET sort_order=$1 WHERE id=$2 AND product_id=$3', [i,imageOrder[i],id]);
    const mainNewImageIndex = layout ? NaN : Number(req.body.mainNewImageIndex);
    if (Number.isInteger(mainNewImageIndex) && mainNewImageIndex >= 0 && files[mainNewImageIndex]) { const newest = await pool.query('SELECT id FROM product_images WHERE product_id=$1 ORDER BY id DESC OFFSET $2 LIMIT 1', [id, files.length - 1 - mainNewImageIndex]); if (newest.rowCount) await pool.query('UPDATE product_images SET is_main=(id=$1) WHERE product_id=$2',[newest.rows[0].id,id]); }
    const mainImageId = layout ? 0 : Number(req.body.mainImageId);
    if (Number.isInteger(mainImageId) && mainImageId > 0) {
      await pool.query('UPDATE product_images SET is_main=(id=$1) WHERE product_id=$2',[mainImageId,id]);
    }
    const main = await pool.query('SELECT id FROM product_images WHERE product_id=$1 AND is_main=TRUE',[id]);
    if (!main.rowCount) {
      await pool.query(
        'UPDATE product_images SET is_main=TRUE WHERE id=(SELECT id FROM product_images WHERE product_id=$1 ORDER BY id LIMIT 1)',
        [id]
      );
    }
    const r = await pool.query('SELECT * FROM products WHERE id=$1',[id]);
    const [full] = await withImages(r.rows);
    res.json(full);
  } catch (err) {
    files.forEach((f) => removeFile(f.filename));
    console.error(err);
    res.status(500).json({ error: 'Could not update product.' });
  }
});

router.delete('/:id(\\d+)', requireAdmin, async (req,res) => {
  try {
    const imgs = await pool.query('SELECT filename FROM product_images WHERE product_id=$1',[req.params.id]);
    const r = await pool.query('DELETE FROM products WHERE id=$1',[req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error:'Product not found.' });
    imgs.rows.forEach((i)=>removeFile(i.filename));
    res.json({ok:true});
  } catch(err) {
    console.error(err);
    res.status(500).json({error:'Could not delete product.'});
  }
});

module.exports = router;
