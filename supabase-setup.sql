-- Run this entire file in Supabase → SQL Editor → New Query

-- 1. Orders table
CREATE TABLE orders (
  id               TEXT PRIMARY KEY,
  customer_name    TEXT NOT NULL,
  contact_number   TEXT,
  delivery_address TEXT NOT NULL,
  items            JSONB NOT NULL DEFAULT '[]',
  required_date    DATE,
  priority         TEXT DEFAULT 'Normal',
  notes            TEXT,
  sales_rep        TEXT NOT NULL,
  status           TEXT DEFAULT 'Pending',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sequence for human-readable order IDs (ORD-0001, ORD-0002, ...)
CREATE SEQUENCE order_seq START 1;

-- 3. Function the app calls to get the next order ID
CREATE OR REPLACE FUNCTION next_order_id()
RETURNS TEXT AS $$
  SELECT 'ORD-' || LPAD(nextval('order_seq')::text, 4, '0');
$$ LANGUAGE SQL;

-- 4. Row Level Security — allow full access (internal tool, no user auth)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_access" ON orders FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. Enable real-time so the dashboard updates live across devices
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
