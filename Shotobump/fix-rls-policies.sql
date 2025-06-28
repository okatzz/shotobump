-- Fix Row Level Security (RLS) Policies for Shotobump
-- Run this in your Supabase SQL Editor to resolve 406 errors

-- Option 1: Disable RLS for Development (Easiest)
-- This allows all operations on these tables
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE songs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_song_stacks DISABLE ROW LEVEL SECURITY;
ALTER TABLE turns DISABLE ROW LEVEL SECURITY;
ALTER TABLE guesses DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'rooms', 'room_members', 'songs', 'user_song_stacks', 'turns', 'guesses');

-- Success message
SELECT 'RLS disabled on all tables. Your app should work now!' as message; 