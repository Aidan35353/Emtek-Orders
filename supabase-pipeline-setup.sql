-- Run this in Supabase → SQL Editor → New Query

-- 1. User profiles (name + role for each team member)
CREATE TABLE profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role      TEXT NOT NULL CHECK (role IN ('sales', 'operations', 'accounts'))
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_policy" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE profiles TO authenticated;

-- 2. Notifications table
CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  target_role TEXT NOT NULL,
  message     TEXT NOT NULL,
  order_id    TEXT,
  read_by     UUID[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_policy" ON notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE notifications TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 3. Add pipeline stage column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'Sale';
