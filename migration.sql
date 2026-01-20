-- Run this in your Supabase SQL Editor to add the missing column and permissions

-- 1. Add created_by column to link sessions to interviewers
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 2. Update RLS Policies (Optional but recommended)
-- Allow authenticated users to insert sessions linked to themselves
CREATE POLICY "Users can create sessions" ON sessions
    FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = created_by);

-- Allow users to view their own sessions
CREATE POLICY "Users can view their own sessions" ON sessions
    FOR SELECT 
    TO authenticated 
    USING (auth.uid() = created_by OR created_by IS NULL); 
    -- (OR created_by IS NULL allows viewing legacy sessions if needed, adjust as desired)
