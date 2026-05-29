-- ============================================================
--  EMTEK PERMISSIONS FIX
--  Run this in Supabase → SQL Editor → New Query → Run
--  Fixes: authenticated users being blocked from orders table
-- ============================================================

-- 1. Drop ALL existing policies on orders to start clean
DROP POLICY IF EXISTS "public_access"   ON orders;
DROP POLICY IF EXISTS "orders_policy"   ON orders;
DROP POLICY IF EXISTS "orders_all_access" ON orders;

-- 2. Single open policy for both anon + authenticated (internal tool)
CREATE POLICY "orders_open" ON orders FOR ALL USING (true) WITH CHECK (true);

-- 3. Grant table access to both roles
GRANT ALL ON TABLE orders TO anon;
GRANT ALL ON TABLE orders TO authenticated;

-- 4. Grant sequence access to both roles
GRANT USAGE, SELECT ON SEQUENCE order_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE order_seq TO authenticated;

-- 5. Recreate the order ID function as SECURITY DEFINER
--    (runs as DB owner regardless of who calls it)
CREATE OR REPLACE FUNCTION next_order_id()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'ORD-' || LPAD(nextval('order_seq')::text, 4, '0');
$$;

-- 6. Grant execute to both roles
GRANT EXECUTE ON FUNCTION next_order_id() TO anon;
GRANT EXECUTE ON FUNCTION next_order_id() TO authenticated;
