-- Simple RLS Disable Script for Shotobump
-- This will immediately fix all 406 errors

-- Disable RLS on all tables
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE songs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_song_stacks DISABLE ROW LEVEL SECURITY;
ALTER TABLE turns DISABLE ROW LEVEL SECURITY;
ALTER TABLE guesses DISABLE ROW LEVEL SECURITY;

-- Drop any existing policies that might interfere
DROP POLICY IF EXISTS "Allow all operations on users" ON users;
DROP POLICY IF EXISTS "Allow all operations on rooms" ON rooms;
DROP POLICY IF EXISTS "Allow all operations on room_members" ON room_members;
DROP POLICY IF EXISTS "Allow all operations on songs" ON songs;
DROP POLICY IF EXISTS "Allow all operations on user_song_stacks" ON user_song_stacks;
DROP POLICY IF EXISTS "Allow all operations on turns" ON turns;
DROP POLICY IF EXISTS "Allow all operations on guesses" ON guesses;

-- Verify RLS is disabled
SELECT 
  schemaname, 
  tablename, 
  rowsecurity as "RLS_Enabled"
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'rooms', 'room_members', 'songs', 'user_song_stacks', 'turns', 'guesses')
ORDER BY tablename;

-- Success message
SELECT 'RLS completely disabled! Your app should work now.' as message; 