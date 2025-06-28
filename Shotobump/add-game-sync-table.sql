-- ============================================================================
-- ADD GAME SYNC STATES TABLE
-- ============================================================================
-- This script adds the game_sync_states table for real-time multiplayer synchronization
-- Run this in your Supabase SQL Editor to enable synchronized gameplay
-- ============================================================================

-- Create the game_sync_states table for real-time synchronization
CREATE TABLE IF NOT EXISTS game_sync_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    phase TEXT NOT NULL CHECK (phase IN ('pre_game_countdown', 'turn_countdown', 'audio_playing', 'guessing', 'voting', 'turn_results', 'game_finished')),
    time_remaining INTEGER NOT NULL DEFAULT 0,
    current_attacker_id UUID REFERENCES users(id) ON DELETE SET NULL,
    current_defender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    current_song_id UUID REFERENCES user_song_stacks(id) ON DELETE SET NULL,
    current_song_data JSONB,
    player_scores JSONB NOT NULL DEFAULT '[]',
    player_order JSONB NOT NULL DEFAULT '[]',
    current_turn_index INTEGER NOT NULL DEFAULT 0,
    turn_data JSONB,
    show_album_art BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(game_session_id) -- One sync state per game session
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_sync_states_session_id ON game_sync_states(game_session_id);
CREATE INDEX IF NOT EXISTS idx_game_sync_states_updated_at ON game_sync_states(updated_at);
CREATE INDEX IF NOT EXISTS idx_game_sync_states_phase ON game_sync_states(phase);

-- Enable Row Level Security
ALTER TABLE game_sync_states ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for game sync states
CREATE POLICY "Room members can view game sync states" ON game_sync_states
    FOR SELECT USING (
        game_session_id IN (
            SELECT id FROM game_sessions 
            WHERE room_id IN (
                SELECT room_id FROM room_members 
                WHERE user_id = auth.uid() AND is_active = true
            )
        )
    );

CREATE POLICY "Room members can update game sync states" ON game_sync_states
    FOR INSERT WITH CHECK (
        auth.uid() = updated_by AND
        game_session_id IN (
            SELECT id FROM game_sessions 
            WHERE room_id IN (
                SELECT room_id FROM room_members 
                WHERE user_id = auth.uid() AND is_active = true
            )
        )
    );

CREATE POLICY "Room members can modify game sync states" ON game_sync_states
    FOR UPDATE USING (
        game_session_id IN (
            SELECT id FROM game_sessions 
            WHERE room_id IN (
                SELECT room_id FROM room_members 
                WHERE user_id = auth.uid() AND is_active = true
            )
        )
    );

-- Add comments for documentation
COMMENT ON TABLE game_sync_states IS 'Real-time game state synchronization for multiplayer gameplay';
COMMENT ON COLUMN game_sync_states.phase IS 'Current game phase for all players';
COMMENT ON COLUMN game_sync_states.time_remaining IS 'Countdown timer in seconds';
COMMENT ON COLUMN game_sync_states.player_scores IS 'JSON array of player scores and status';
COMMENT ON COLUMN game_sync_states.player_order IS 'JSON array of player turn order';
COMMENT ON COLUMN game_sync_states.turn_data IS 'JSON object containing current turn information';
COMMENT ON COLUMN game_sync_states.show_album_art IS 'Whether album art should be revealed to players';
COMMENT ON COLUMN game_sync_states.updated_by IS 'User who last updated the sync state';

-- Success message
SELECT 'Game sync states table created successfully! 🎮' as status; 