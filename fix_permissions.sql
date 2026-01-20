-- 1. Ensure the table is in the publication (ignore error if already exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'proctoring_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE proctoring_logs;
    END IF;
END $$;

-- 2. Ensure RLS is enabled
ALTER TABLE proctoring_logs ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies to avoid "already exists" errors
DROP POLICY IF EXISTS "Allow anon insert logs" ON proctoring_logs;
DROP POLICY IF EXISTS "Allow anon select logs" ON proctoring_logs;
DROP POLICY IF EXISTS "Allow anon select sessions" ON sessions;
DROP POLICY IF EXISTS "Allow anon update answers" ON answers;
DROP POLICY IF EXISTS "Allow anon insert answers" ON answers;

-- 4. Create fresh, permissive policies for Dev
CREATE POLICY "Allow anon insert logs" ON proctoring_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon select logs" ON proctoring_logs FOR SELECT USING (true);
CREATE POLICY "Allow anon select sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Allow anon update answers" ON answers FOR UPDATE USING (true);
CREATE POLICY "Allow anon insert answers" ON answers FOR INSERT WITH CHECK (true);

-- 5. Force Realtime to send all columns (helps with filtering)
ALTER TABLE proctoring_logs REPLICA IDENTITY FULL;
