CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  sku VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0 AND quantity <= 10000),
  reorder_point INTEGER NOT NULL DEFAULT 0 CHECK (reorder_point >= 0 AND reorder_point <= 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(trim(name)) >= 3),
  CHECK (sku ~ '^ORB-[A-Z0-9]{4,12}$')
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(3) NOT NULL CHECK (type IN ('IN', 'OUT')),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  resulting_quantity INTEGER NOT NULL CHECK (resulting_quantity >= 0 AND resulting_quantity <= 10000),
  note VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(trim(note)) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created
  ON stock_movements(product_id, created_at DESC);
