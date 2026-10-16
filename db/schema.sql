CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin','customer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  category    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_images (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  is_main    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS orders (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name      TEXT NOT NULL,
  phone              TEXT NOT NULL,
  address            TEXT NOT NULL,
  note               TEXT NOT NULL DEFAULT '',
  total              NUMERIC(12,2) NOT NULL,
  status             TEXT NOT NULL DEFAULT 'waiting_pay'
                     CHECK (status IN ('waiting_pay','paid','success')),
  payment_screenshot TEXT,
  order_code         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  price      NUMERIC(12,2) NOT NULL,
  qty        INTEGER NOT NULL CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user    ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_items_order    ON order_items(order_id);

-- PP Queen v3 order workflow: stable customer-facing order codes and final statuses.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
UPDATE orders SET status = CASE status
  WHEN 'pending' THEN 'waiting_pay'
  WHEN 'waiting_pay' THEN 'waiting_pay'
  WHEN 'paid' THEN 'paid'
  WHEN 'shipped' THEN 'success'
  WHEN 'success' THEN 'success'
  WHEN 'done' THEN 'success'
  WHEN 'reject' THEN 'success'
  WHEN 'cancelled' THEN 'waiting_pay'
  ELSE 'waiting_pay' END;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('waiting_pay','paid','success'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_code TEXT;
UPDATE orders SET order_code = 'PP' || LPAD(id::text, 3, '0') WHERE order_code IS NULL OR order_code = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_code ON orders(order_code);
ALTER TABLE orders ALTER COLUMN order_code SET NOT NULL;

-- Guest checkout: every order gets a secret link token (customers do not need to log in)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_public_token ON orders(public_token) WHERE public_token IS NOT NULL;

-- Customer <-> admin chat (customers are guests identified by a random token kept in their browser)
CREATE TABLE IF NOT EXISTS chats (
  id              SERIAL PRIMARY KEY,
  token           TEXT NOT NULL UNIQUE,
  customer_name   TEXT NOT NULL DEFAULT '',
  admin_unread    INTEGER NOT NULL DEFAULT 0,
  customer_unread INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS customer_unread INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS chat_messages (
  id         SERIAL PRIMARY KEY,
  chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender     TEXT NOT NULL CHECK (sender IN ('customer','admin')),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_msgs ON chat_messages(chat_id, id);
CREATE INDEX IF NOT EXISTS idx_chats_last ON chats(last_message_at DESC);


-- PP Queen v2: multilingual catalog and manageable categories.
CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name_en    TEXT NOT NULL UNIQUE,
  name_km    TEXT NOT NULL DEFAULT '',
  name_zh    TEXT NOT NULL DEFAULT '',
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS name_km TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_km TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_zh TEXT NOT NULL DEFAULT '';

-- Preserve existing products: every existing category becomes a managed category.
INSERT INTO categories (name_en, name_km, name_zh)
SELECT DISTINCT TRIM(category), TRIM(category), TRIM(category)
FROM products
WHERE TRIM(category) <> ''
ON CONFLICT (name_en) DO NOTHING;

INSERT INTO categories (name_en, name_km, name_zh, sort_order)
VALUES
  ('Shampoo', 'សាប៊ូកក់សក់', '洗发水', 10),
  ('Bags', 'កាបូប', '包包', 20)
ON CONFLICT (name_en) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_categories_active_order ON categories(active, sort_order, name_en);


-- PP Queen catalog identifiers and audience metadata. Safe for existing records.
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT '';
UPDATE products SET product_code = 'PP' || LPAD(id::text, 2, '0') WHERE product_code IS NULL OR product_code = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
ALTER TABLE products ALTER COLUMN product_code SET NOT NULL;


CREATE OR REPLACE FUNCTION pp_products_assign_code() RETURNS trigger AS $$
BEGIN
  IF NEW.product_code IS NULL OR NEW.product_code = '' THEN
    NEW.product_code := 'PP' || LPAD(NEW.id::text, 2, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_products_assign_code ON products;
CREATE TRIGGER trg_products_assign_code BEFORE INSERT ON products
FOR EACH ROW EXECUTE FUNCTION pp_products_assign_code();
