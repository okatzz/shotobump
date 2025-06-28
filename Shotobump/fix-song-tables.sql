-- Safe Migration Script for Song Stack Tables
-- This script safely adds missing columns and tables

-- First, check if user_song_stacks table exists
DO $$ 
BEGIN
    -- Check if table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_song_stacks') THEN
        RAISE NOTICE 'user_song_stacks table exists, checking columns...';
        
        -- Add missing columns if they don't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'user_song_stacks' AND column_name = 'room_id') THEN
            ALTER TABLE user_song_stacks ADD COLUMN room_id UUID REFERENCES rooms(id) ON DELETE CASCADE;
            RAISE NOTICE 'Added room_id column';
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'user_song_stacks' AND column_name = 'is_active') THEN
            ALTER TABLE user_song_stacks ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
            RAISE NOTICE 'Added is_active column';
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'user_song_stacks' AND column_name = 'track_data') THEN
            ALTER TABLE user_song_stacks ADD COLUMN track_data JSONB NOT NULL DEFAULT '{}';
            RAISE NOTICE 'Added track_data column';
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'user_song_stacks' AND column_name = 'added_at') THEN
            ALTER TABLE user_song_stacks ADD COLUMN added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
            RAISE NOTICE 'Added added_at column';
        END IF;
        
    ELSE
        RAISE NOTICE 'Creating user_song_stacks table...';
        -- Create the table from scratch
        CREATE TABLE user_song_stacks (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
            spotify_track_id TEXT NOT NULL,
            track_data JSONB NOT NULL,
            added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            is_active BOOLEAN DEFAULT TRUE
        );
    END IF;
END $$;

-- Create indexes (IF NOT EXISTS handles duplicates)
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_user_id ON user_song_stacks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_room_id ON user_song_stacks(room_id);
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_active ON user_song_stacks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_spotify_track ON user_song_stacks(spotify_track_id);

-- Enable RLS (safe to run multiple times)
ALTER TABLE user_song_stacks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can manage their own songs" ON user_song_stacks;
DROP POLICY IF EXISTS "Room members can view room songs" ON user_song_stacks;

-- Create RLS Policies
CREATE POLICY "Users can manage their own songs" ON user_song_stacks
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Room members can view room songs" ON user_song_stacks
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM room_members 
            WHERE user_id = auth.uid()
        )
    );

-- Verify the table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_song_stacks' 
ORDER BY ordinal_position;

SELECT 'Migration completed successfully!' as status; 