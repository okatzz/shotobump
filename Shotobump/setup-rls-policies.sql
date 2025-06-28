-- Shotobump RLS Policies Setup
-- This script sets up proper Row Level Security policies for development

-- First, enable RLS on all tables (if not already enabled)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_song_stacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE guesses ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for development
-- These allow all operations but can be made more restrictive later

-- Users table policies
CREATE POLICY "Allow all operations on users" ON users
FOR ALL USING (true) WITH CHECK (true);

-- Rooms table policies
CREATE POLICY "Allow all operations on rooms" ON rooms
FOR ALL USING (true) WITH CHECK (true);

-- Room members table policies
CREATE POLICY "Allow all operations on room_members" ON room_members
FOR ALL USING (true) WITH CHECK (true);

-- Songs table policies
CREATE POLICY "Allow all operations on songs" ON songs
FOR ALL USING (true) WITH CHECK (true);

-- User song stacks table policies
CREATE POLICY "Allow all operations on user_song_stacks" ON user_song_stacks
FOR ALL USING (true) WITH CHECK (true);

-- Turns table policies
CREATE POLICY "Allow all operations on turns" ON turns
FOR ALL USING (true) WITH CHECK (true);

-- Guesses table policies
CREATE POLICY "Allow all operations on guesses" ON guesses
FOR ALL USING (true) WITH CHECK (true);

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'rooms', 'room_members', 'songs', 'user_song_stacks', 'turns', 'guesses')
ORDER BY tablename, policyname;

-- Success message
SELECT 'RLS policies created successfully! Your app should now work with real database.' as message; 