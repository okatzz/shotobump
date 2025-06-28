-- ============================================================================
-- SHOTOBUMP DATA RESET SCRIPT
-- ============================================================================
-- This script only clears and reinserts test data without recreating tables
-- Use this when you want to reset data but keep the existing table structure
-- Much faster than the full recreation script
-- ============================================================================

-- ============================================================================
-- 1. CLEAR EXISTING DATA - Delete all data from tables
-- ============================================================================

-- Delete in reverse dependency order to avoid foreign key constraint errors
DELETE FROM game_guesses;
DELETE FROM game_turns;
DELETE FROM game_sessions;
DELETE FROM user_song_stacks;
DELETE FROM guesses;
DELETE FROM turns;
DELETE FROM songs;
DELETE FROM room_members;
DELETE FROM rooms;
DELETE FROM users;

-- ============================================================================
-- 2. RESET SEQUENCES - Reset auto-increment counters (if any)
-- ============================================================================

-- No sequences to reset since we use UUIDs

-- ============================================================================
-- 3. INSERT TEST DATA - Add fresh development data
-- ============================================================================

-- Insert test users for development
INSERT INTO users (id, spotify_id, display_name, avatar_url) VALUES
('11111111-1111-1111-1111-111111111111', 'mock_player_1', 'Player 1', 'https://via.placeholder.com/150/FF6B6B/FFFFFF?text=P1'),
('22222222-2222-2222-2222-222222222222', 'mock_player_2', 'Player 2', 'https://via.placeholder.com/150/4ECDC4/FFFFFF?text=P2'),
('33333333-3333-3333-3333-333333333333', 'mock_player_3', 'Player 3', 'https://via.placeholder.com/150/45B7D1/FFFFFF?text=P3'),
('44444444-4444-4444-4444-444444444444', 'mock_host', 'Host Player', 'https://via.placeholder.com/150/96CEB4/FFFFFF?text=H'),
('55555555-5555-5555-5555-555555555555', 'spotify_user_1', 'John Doe', 'https://via.placeholder.com/150/FFA726/FFFFFF?text=JD'),
('66666666-6666-6666-6666-666666666666', 'spotify_user_2', 'Jane Smith', 'https://via.placeholder.com/150/AB47BC/FFFFFF?text=JS');

-- Insert sample songs for testing
INSERT INTO songs (id, spotify_track_id, title, artist, album, preview_url, album_art_url, duration_ms, added_by) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '4u7EnebtmKWzUH433cf1Qv', 'Bohemian Rhapsody', 'Queen', 'A Night at the Opera', 'https://p.scdn.co/mp3-preview/9a591dfc7e6ec8e96b3b5f2c213b78a8c0f6f8b0', 'https://i.scdn.co/image/ab67616d0000b2734ce8b4e42588bf18182dcde2', 355000, '11111111-1111-1111-1111-111111111111'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '7tFiyTwD0nx5a1eklYtX2J', 'Somebody to Love', 'Queen', 'A Day at the Races', 'https://p.scdn.co/mp3-preview/2a191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0', 'https://i.scdn.co/image/ab67616d0000b273ce4f1737bc8a646c8c4bd25a', 296000, '22222222-2222-2222-2222-222222222222'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '0SCwNOTBArKewcSOXyJCsA', 'Hotel California', 'Eagles', 'Hotel California', 'https://p.scdn.co/mp3-preview/3c191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0', 'https://i.scdn.co/image/ab67616d0000b273b5c0c0b0a0b0c0b0a0b0c0b0', 391000, '33333333-3333-3333-3333-333333333333'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '1s6ux0lNiTziSrd7iUAADH', 'Don\'t Stop Believin\'', 'Journey', 'Escape', 'https://p.scdn.co/mp3-preview/4d191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0', 'https://i.scdn.co/image/ab67616d0000b273d0c0b0a0b0c0b0a0b0c0b0a0', 251000, '44444444-4444-4444-4444-444444444444'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '7ouMYWpwJ422jRcDASZB7P', 'Sweet Child O\' Mine', 'Guns N\' Roses', 'Appetite for Destruction', 'https://p.scdn.co/mp3-preview/5e191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0', 'https://i.scdn.co/image/ab67616d0000b273e0c0b0a0b0c0b0a0b0c0b0a0', 356000, '55555555-5555-5555-5555-555555555555');

-- Insert sample rooms for testing
INSERT INTO rooms (id, code, created_by, host_id, state) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'TEST123', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'waiting'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'DEMO456', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'waiting'),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'PLAY789', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'waiting');

-- Insert room members for testing
INSERT INTO room_members (room_id, user_id, score, is_active) VALUES
-- Room TEST123 members
('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 0, true),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 0, true),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', 0, true),
-- Room DEMO456 members
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', 10, true),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '44444444-4444-4444-4444-444444444444', 5, true),
-- Room PLAY789 members
('ffffffff-ffff-ffff-ffff-ffffffffffff', '44444444-4444-4444-4444-444444444444', 0, true),
('ffffffff-ffff-ffff-ffff-ffffffffffff', '55555555-5555-5555-5555-555555555555', 0, true),
('ffffffff-ffff-ffff-ffff-ffffffffffff', '66666666-6666-6666-6666-666666666666', 0, true);

-- Insert sample user song stacks for testing
INSERT INTO user_song_stacks (user_id, room_id, spotify_track_id, track_data, is_active) VALUES
-- Player 1's songs in TEST123
('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '4u7EnebtmKWzUH433cf1Qv', 
 '{"id": "4u7EnebtmKWzUH433cf1Qv", "name": "Bohemian Rhapsody", "artists": [{"name": "Queen"}], "album": {"name": "A Night at the Opera", "images": [{"url": "https://i.scdn.co/image/ab67616d0000b2734ce8b4e42588bf18182dcde2"}]}, "duration_ms": 355000, "preview_url": "https://p.scdn.co/mp3-preview/9a591dfc7e6ec8e96b3b5f2c213b78a8c0f6f8b0"}', 
 true),
-- Player 2's songs in TEST123
('22222222-2222-2222-2222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '7tFiyTwD0nx5a1eklYtX2J', 
 '{"id": "7tFiyTwD0nx5a1eklYtX2J", "name": "Somebody to Love", "artists": [{"name": "Queen"}], "album": {"name": "A Day at the Races", "images": [{"url": "https://i.scdn.co/image/ab67616d0000b273ce4f1737bc8a646c8c4bd25a"}]}, "duration_ms": 296000, "preview_url": "https://p.scdn.co/mp3-preview/2a191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0"}', 
 true),
-- Player 3's songs in TEST123
('33333333-3333-3333-3333-333333333333', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '0SCwNOTBArKewcSOXyJCsA', 
 '{"id": "0SCwNOTBArKewcSOXyJCsA", "name": "Hotel California", "artists": [{"name": "Eagles"}], "album": {"name": "Hotel California", "images": [{"url": "https://i.scdn.co/image/ab67616d0000b273b5c0c0b0a0b0c0b0a0b0c0b0"}]}, "duration_ms": 391000, "preview_url": "https://p.scdn.co/mp3-preview/3c191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0"}', 
 true),
-- Host's songs in PLAY789
('44444444-4444-4444-4444-444444444444', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '1s6ux0lNiTziSrd7iUAADH', 
 '{"id": "1s6ux0lNiTziSrd7iUAADH", "name": "Don\'t Stop Believin\'", "artists": [{"name": "Journey"}], "album": {"name": "Escape", "images": [{"url": "https://i.scdn.co/image/ab67616d0000b273d0c0b0a0b0c0b0a0b0c0b0a0"}]}, "duration_ms": 251000, "preview_url": "https://p.scdn.co/mp3-preview/4d191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0"}', 
 true),
-- John's songs in PLAY789
('55555555-5555-5555-5555-555555555555', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '7ouMYWpwJ422jRcDASZB7P', 
 '{"id": "7ouMYWpwJ422jRcDASZB7P", "name": "Sweet Child O\' Mine", "artists": [{"name": "Guns N\' Roses"}], "album": {"name": "Appetite for Destruction", "images": [{"url": "https://i.scdn.co/image/ab67616d0000b273e0c0b0a0b0c0b0a0b0c0b0a0"}]}, "duration_ms": 356000, "preview_url": "https://p.scdn.co/mp3-preview/5e191b0c0ba0b0c0b0a0b0c0b0a0b0c0b0a0b0c0"}', 
 true);

-- ============================================================================
-- 4. VERIFICATION - Check that data was inserted correctly
-- ============================================================================

-- Count all data
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

-- Show room summary
SELECT 
    r.code as "Room Code",
    r.state as "Status",
    u.display_name as "Host",
    COUNT(rm.user_id) as "Players"
FROM rooms r
JOIN users u ON r.host_id = u.id
LEFT JOIN room_members rm ON r.id = rm.room_id AND rm.is_active = true
GROUP BY r.id, r.code, r.state, u.display_name
ORDER BY r.code;

-- Show song stack summary
SELECT 
    u.display_name as "Player",
    r.code as "Room",
    COUNT(uss.id) as "Songs"
FROM users u
JOIN user_song_stacks uss ON u.id = uss.user_id
JOIN rooms r ON uss.room_id = r.id
WHERE uss.is_active = true
GROUP BY u.id, u.display_name, r.code
ORDER BY r.code, u.display_name;

-- Success message
SELECT '🎉 Data reset completed successfully!' as message,
       '✅ Fresh test data inserted' as data_status,
       '✅ Multiple rooms and players ready' as rooms_status,
       '✅ Song stacks populated' as songs_status;

-- ============================================================================
-- SCRIPT COMPLETE
-- ============================================================================
-- Your test data has been reset!
-- 
-- Available test rooms:
-- - TEST123 (3 players, each with 1 song)
-- - DEMO456 (2 players with scores)
-- - PLAY789 (3 players, 2 with songs)
-- 
-- Available test users:
-- - Player 1, 2, 3 (mock users)
-- - Host Player (room creator)
-- - John Doe, Jane Smith (Spotify users)
-- ============================================================================ 