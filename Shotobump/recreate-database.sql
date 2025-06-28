-- ============================================================================
-- SHOTOBUMP DATABASE RECREATION SCRIPT
-- ============================================================================
-- This script completely deletes and recreates the Shotobump database
-- Run this in your Supabase SQL Editor when you need a fresh start
-- ⚠️  WARNING: This will delete ALL existing data!
-- ============================================================================

-- ============================================================================
-- 1. CLEANUP - Drop all existing tables and policies
-- ============================================================================

-- Drop tables in reverse dependency order to avoid foreign key constraints
DROP TABLE IF EXISTS game_guesses CASCADE;
DROP TABLE IF EXISTS game_turns CASCADE;
DROP TABLE IF EXISTS game_sessions CASCADE;
DROP TABLE IF EXISTS user_song_stacks CASCADE;
DROP TABLE IF EXISTS guesses CASCADE;
DROP TABLE IF EXISTS turns CASCADE;
DROP TABLE IF EXISTS songs CASCADE;
DROP TABLE IF EXISTS room_members CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop any existing policies (in case they exist)
DROP POLICY IF EXISTS "Allow all operations on users" ON users;
DROP POLICY IF EXISTS "Allow all operations on rooms" ON rooms;
DROP POLICY IF EXISTS "Allow all operations on room_members" ON room_members;
DROP POLICY IF EXISTS "Allow all operations on songs" ON songs;
DROP POLICY IF EXISTS "Allow all operations on user_song_stacks" ON user_song_stacks;
DROP POLICY IF EXISTS "Allow all operations on turns" ON turns;
DROP POLICY IF EXISTS "Allow all operations on guesses" ON guesses;
DROP POLICY IF EXISTS "Allow all operations on game_sessions" ON game_sessions;
DROP POLICY IF EXISTS "Allow all operations on game_turns" ON game_turns;
DROP POLICY IF EXISTS "Allow all operations on game_guesses" ON game_guesses;

-- ============================================================================
-- 2. EXTENSIONS - Enable required PostgreSQL extensions
-- ============================================================================

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 3. CORE TABLES - Create all database tables
-- ============================================================================

-- Users table - Store Spotify user information
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    spotify_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rooms table - Game rooms where players gather
CREATE TABLE rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state TEXT DEFAULT 'waiting' CHECK (state IN ('waiting', 'playing', 'finished')),
    settings JSONB DEFAULT '{
        "guess_time_limit": 15,
        "max_repeats": 3,
        "votes_needed": 2
    }',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Room members table - Track who's in each room
CREATE TABLE room_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    socket_id TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

-- Songs table - Individual song records
CREATE TABLE songs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    spotify_track_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    preview_url TEXT,
    album_art_url TEXT,
    duration_ms INTEGER,
    added_by UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User song stacks table - Each user's song collection per room
CREATE TABLE user_song_stacks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    spotify_track_id TEXT NOT NULL,
    track_data JSONB NOT NULL, -- Store complete Spotify track data
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, spotify_track_id, room_id)
);

-- Game sessions table - Active game sessions with host control
CREATE TABLE game_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('waiting', 'playing', 'paused', 'finished')),
    current_turn_id UUID,
    settings JSONB NOT NULL DEFAULT '{
        "guess_time_limit": 15,
        "max_repeats": 3,
        "votes_needed": 2
    }',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE
);

-- Game turns table - Individual turns with audio control
CREATE TABLE game_turns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    challenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES user_song_stacks(id) ON DELETE CASCADE,
    song_data JSONB NOT NULL, -- Cached song data for performance
    state TEXT NOT NULL CHECK (state IN ('playing_audio', 'guessing', 'voting', 'results', 'completed')),
    audio_control JSONB NOT NULL DEFAULT '{
        "is_playing": false,
        "play_count": 0,
        "max_plays": 3,
        "current_position": 0
    }',
    guesses JSONB DEFAULT '[]',
    voting_results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(game_session_id, turn_number)
);

-- Game guesses table - Player guesses for each turn
CREATE TABLE game_guesses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    turn_id UUID NOT NULL REFERENCES game_turns(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guess_text TEXT NOT NULL,
    confidence_level TEXT NOT NULL CHECK (confidence_level IN ('low', 'medium', 'high')),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(turn_id, player_id) -- One guess per player per turn
);

-- Legacy tables for backwards compatibility
CREATE TABLE turns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    challenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'timeout')),
    repeats_left INTEGER DEFAULT 3,
    time_limit INTEGER DEFAULT 15
);

CREATE TABLE guesses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    turn_id UUID NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
    by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    accepted BOOLEAN,
    guessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraint for current_turn_id
ALTER TABLE game_sessions 
ADD CONSTRAINT fk_game_sessions_current_turn 
FOREIGN KEY (current_turn_id) REFERENCES game_turns(id) ON DELETE SET NULL;

-- ============================================================================
-- 4. INDEXES - Create indexes for performance
-- ============================================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_spotify_id ON users(spotify_id);
CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);

-- Rooms table indexes
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_created_by ON rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_rooms_state ON rooms(state);

-- Room members table indexes
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_active ON room_members(is_active) WHERE is_active = true;

-- Songs table indexes
CREATE INDEX IF NOT EXISTS idx_songs_spotify_track_id ON songs(spotify_track_id);
CREATE INDEX IF NOT EXISTS idx_songs_added_by ON songs(added_by);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);

-- User song stacks table indexes
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_user_id ON user_song_stacks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_room_id ON user_song_stacks(room_id);
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_active ON user_song_stacks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_spotify_track ON user_song_stacks(spotify_track_id);

-- Game sessions table indexes
CREATE INDEX IF NOT EXISTS idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_host_id ON game_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_state ON game_sessions(state);

-- Game turns table indexes
CREATE INDEX IF NOT EXISTS idx_game_turns_session_id ON game_turns(game_session_id);
CREATE INDEX IF NOT EXISTS idx_game_turns_challenger_id ON game_turns(challenger_id);
CREATE INDEX IF NOT EXISTS idx_game_turns_state ON game_turns(state);

-- Game guesses table indexes
CREATE INDEX IF NOT EXISTS idx_game_guesses_turn_id ON game_guesses(turn_id);
CREATE INDEX IF NOT EXISTS idx_game_guesses_player_id ON game_guesses(player_id);

-- Legacy table indexes
CREATE INDEX IF NOT EXISTS idx_turns_room_id ON turns(room_id);
CREATE INDEX IF NOT EXISTS idx_guesses_turn_id ON guesses(turn_id);

-- ============================================================================
-- 5. ROW LEVEL SECURITY - Disable RLS for development
-- ============================================================================

-- Disable RLS on all tables for development (prevents 406 errors)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE songs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_song_stacks DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_turns DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_guesses DISABLE ROW LEVEL SECURITY;
ALTER TABLE turns DISABLE ROW LEVEL SECURITY;
ALTER TABLE guesses DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. TEST DATA - Insert development/testing data
-- ============================================================================

-- Insert test users for development
INSERT INTO users (id, spotify_id, display_name, avatar_url) VALUES
('11111111-1111-1111-1111-111111111111', 'mock_player_1', 'Player 1', 'https://via.placeholder.com/150/FF6B6B/FFFFFF?text=P1'),
('22222222-2222-2222-2222-222222222222', 'mock_player_2', 'Player 2', 'https://via.placeholder.com/150/4ECDC4/FFFFFF?text=P2'),
('33333333-3333-3333-3333-333333333333', 'mock_player_3', 'Player 3', 'https://via.placeholder.com/150/45B7D1/FFFFFF?text=P3'),
('44444444-4444-4444-4444-444444444444', 'mock_host', 'Host Player', 'https://via.placeholder.com/150/96CEB4/FFFFFF?text=H');

-- Insert sample songs for testing
INSERT INTO songs (id, spotify_track_id, title, artist, album, preview_url, album_art_url, duration_ms, added_by) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '4u7EnebtmKWzUH433cf1Qv', 'Bohemian Rhapsody', 'Queen', 'A Night at the Opera', 'https://p.scdn.co/mp3-preview/9a591dfc7e6ec8e96b3b5f2c213b78a8c0f6f8b0', 'https://i.scdn.co/image/ab67616d0000b2734ce8b4e42588bf18182dcde2', 355000, '11111111-1111-1111-1111-111111111111'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '7tFiyTwD0nx5a1eklYtX2J', 'Somebody to Love', 'Queen', 'A Day at the Races', 'https://p.scdn.co/mp3-preview/2a191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0', 'https://i.scdn.co/image/ab67616d0000b273ce4f1737bc8a646c8c4bd25a', 296000, '22222222-2222-2222-2222-222222222222'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '0SCwNOTBArKewcSOXyJCsA', 'Hotel California', 'Eagles', 'Hotel California', 'https://p.scdn.co/mp3-preview/3c191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0', 'https://i.scdn.co/image/ab67616d0000b273b5c0c0b0a0b0c0b0a0b0c0b0', 391000, '33333333-3333-3333-3333-333333333333');

-- Insert sample room for testing
INSERT INTO rooms (id, code, created_by, host_id, state) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'TEST123', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'waiting');

-- Insert room members for testing
INSERT INTO room_members (room_id, user_id, score, is_active) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 0, true),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 0, true),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', 0, true);

-- Insert sample user song stacks for testing
INSERT INTO user_song_stacks (user_id, room_id, spotify_track_id, track_data, is_active) VALUES
('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '4u7EnebtmKWzUH433cf1Qv', 
 '{"id": "4u7EnebtmKWzUH433cf1Qv", "name": "Bohemian Rhapsody", "artists": [{"name": "Queen"}], "album": {"name": "A Night at the Opera", "images": [{"url": "https://i.scdn.co/image/ab67616d0000b2734ce8b4e42588bf18182dcde2"}]}, "duration_ms": 355000, "preview_url": "https://p.scdn.co/mp3-preview/9a591dfc7e6ec8e96b3b5f2c213b78a8c0f6f8b0"}', 
 true),
('22222222-2222-2222-2222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '7tFiyTwD0nx5a1eklYtX2J', 
 '{"id": "7tFiyTwD0nx5a1eklYtX2J", "name": "Somebody to Love", "artists": [{"name": "Queen"}], "album": {"name": "A Day at the Races", "images": [{"url": "https://i.scdn.co/image/ab67616d0000b273ce4f1737bc8a646c8c4bd25a"}]}, "duration_ms": 296000, "preview_url": "https://p.scdn.co/mp3-preview/2a191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0"}', 
 true),
('33333333-3333-3333-3333-333333333333', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '0SCwNOTBArKewcSOXyJCsA', 
 '{"id": "0SCwNOTBArKewcSOXyJCsA", "name": "Hotel California", "artists": [{"name": "Eagles"}], "album": {"name": "Hotel California", "images": [{"url": "https://i.scdn.co/image/ab67616d0000b273b5c0c0b0a0b0c0b0a0b0c0b0"}]}, "duration_ms": 391000, "preview_url": "https://p.scdn.co/mp3-preview/3c191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0"}', 
 true);

-- ============================================================================
-- 7. COMMENTS - Document the schema
-- ============================================================================

-- Table comments
COMMENT ON TABLE users IS 'Spotify users who can join games';
COMMENT ON TABLE rooms IS 'Game rooms where players gather';
COMMENT ON TABLE room_members IS 'Track which users are in which rooms';
COMMENT ON TABLE songs IS 'Individual song records from Spotify';
COMMENT ON TABLE user_song_stacks IS 'Each user''s song collection per room';
COMMENT ON TABLE game_sessions IS 'Active game sessions with host-controlled audio';
COMMENT ON TABLE game_turns IS 'Individual turns with audio control and guessing phases';
COMMENT ON TABLE game_guesses IS 'Player guesses for each turn';
COMMENT ON TABLE turns IS 'Legacy turns table for backwards compatibility';
COMMENT ON TABLE guesses IS 'Legacy guesses table for backwards compatibility';

-- Column comments
COMMENT ON COLUMN rooms.created_by IS 'User who created the room (same as host_id for now)';
COMMENT ON COLUMN rooms.host_id IS 'Current host of the room (can control audio)';
COMMENT ON COLUMN room_members.is_active IS 'Whether the member is currently active in the room';
COMMENT ON COLUMN user_song_stacks.track_data IS 'Full Spotify track data cached for performance';
COMMENT ON COLUMN game_sessions.host_id IS 'Only the host can control audio playback';
COMMENT ON COLUMN game_turns.audio_control IS 'JSON object controlling audio state - only host can modify';

-- ============================================================================
-- 8. VERIFICATION - Check that everything was created successfully
-- ============================================================================

-- Verify all tables exist
SELECT 
    schemaname, 
    tablename, 
    rowsecurity as "RLS_Enabled",
    hasindexes as "Has_Indexes"
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'rooms', 'room_members', 'songs', 'user_song_stacks', 
                   'game_sessions', 'game_turns', 'game_guesses', 'turns', 'guesses')
ORDER BY tablename;

-- Count test data
SELECT 'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL
SELECT 'rooms', COUNT(*) FROM rooms
UNION ALL
SELECT 'room_members', COUNT(*) FROM room_members
UNION ALL
SELECT 'songs', COUNT(*) FROM songs
UNION ALL
SELECT 'user_song_stacks', COUNT(*) FROM user_song_stacks
ORDER BY table_name;

-- Success message
SELECT '🎉 Database recreation completed successfully!' as message,
       '✅ All tables created' as tables_status,
       '✅ Test data inserted' as data_status,
       '✅ RLS disabled for development' as security_status,
       '✅ Indexes created for performance' as performance_status;

-- ============================================================================
-- SCRIPT COMPLETE
-- ============================================================================
-- Your Shotobump database is now ready for development!
-- 
-- What was created:
-- - 10 tables with proper relationships and constraints
-- - Performance indexes on all key columns
-- - Test users, room, and songs for development
-- - RLS disabled to prevent 406 errors
-- - Full backwards compatibility with existing code
-- 
-- Next steps:
-- 1. Update your .env file with Supabase credentials
-- 2. Run your app - it should work immediately
-- 3. Test room creation, joining, and song management
-- ============================================================================