-- Simple Song Stack Tables Setup
-- Run this in your Supabase SQL Editor to enable song management

-- Drop existing table if it exists (to recreate with correct schema)
DROP TABLE IF EXISTS user_song_stacks CASCADE;

-- Create user_song_stacks table with all required columns
CREATE TABLE user_song_stacks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    spotify_track_id TEXT NOT NULL,
    track_data JSONB NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create basic indexes
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_user_id ON user_song_stacks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_room_id ON user_song_stacks(room_id);
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_active ON user_song_stacks(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE user_song_stacks ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies
CREATE POLICY "Users can manage their own songs" ON user_song_stacks
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Room members can view room songs" ON user_song_stacks
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM room_members 
            WHERE user_id = auth.uid()
        )
    );

-- Verify table creation
SELECT 'user_song_stacks table created successfully' as status; 