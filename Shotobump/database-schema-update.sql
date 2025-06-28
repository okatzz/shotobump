-- Song Stack Management Tables
CREATE TABLE IF NOT EXISTS user_song_stacks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    spotify_track_id TEXT NOT NULL,
    track_data JSONB NOT NULL, -- Store complete Spotify track data
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, spotify_track_id, room_id)
);

-- Game Session Management Tables
CREATE TABLE IF NOT EXISTS game_sessions (
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

CREATE TABLE IF NOT EXISTS game_turns (
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

CREATE TABLE IF NOT EXISTS game_guesses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    turn_id UUID NOT NULL REFERENCES game_turns(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guess_text TEXT NOT NULL,
    confidence_level TEXT NOT NULL CHECK (confidence_level IN ('low', 'medium', 'high')),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(turn_id, player_id) -- One guess per player per turn
);

-- Add foreign key constraint for current_turn_id
ALTER TABLE game_sessions 
ADD CONSTRAINT fk_game_sessions_current_turn 
FOREIGN KEY (current_turn_id) REFERENCES game_turns(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_user_id ON user_song_stacks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_room_id ON user_song_stacks(room_id);
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_active ON user_song_stacks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_song_stacks_spotify_track ON user_song_stacks(spotify_track_id);

CREATE INDEX IF NOT EXISTS idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_host_id ON game_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_state ON game_sessions(state);

CREATE INDEX IF NOT EXISTS idx_game_turns_session_id ON game_turns(game_session_id);
CREATE INDEX IF NOT EXISTS idx_game_turns_challenger_id ON game_turns(challenger_id);
CREATE INDEX IF NOT EXISTS idx_game_turns_state ON game_turns(state);

CREATE INDEX IF NOT EXISTS idx_game_guesses_turn_id ON game_guesses(turn_id);
CREATE INDEX IF NOT EXISTS idx_game_guesses_player_id ON game_guesses(player_id);

-- Row Level Security (RLS) Policies
ALTER TABLE user_song_stacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_guesses ENABLE ROW LEVEL SECURITY;

-- User Song Stacks Policies
CREATE POLICY "Users can view their own song stacks" ON user_song_stacks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own songs" ON user_song_stacks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own songs" ON user_song_stacks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own songs" ON user_song_stacks
    FOR DELETE USING (auth.uid() = user_id);

-- Room members can view all song stacks in their room
CREATE POLICY "Room members can view room song stacks" ON user_song_stacks
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM room_members 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Game Sessions Policies
CREATE POLICY "Room members can view game sessions" ON game_sessions
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM room_members 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Room hosts can create game sessions" ON game_sessions
    FOR INSERT WITH CHECK (
        auth.uid() = host_id AND
        room_id IN (
            SELECT id FROM rooms WHERE created_by = auth.uid()
        )
    );

CREATE POLICY "Game hosts can update their sessions" ON game_sessions
    FOR UPDATE USING (auth.uid() = host_id);

-- Game Turns Policies
CREATE POLICY "Game participants can view turns" ON game_turns
    FOR SELECT USING (
        game_session_id IN (
            SELECT id FROM game_sessions 
            WHERE room_id IN (
                SELECT room_id FROM room_members 
                WHERE user_id = auth.uid() AND is_active = true
            )
        )
    );

CREATE POLICY "Game hosts can create turns" ON game_turns
    FOR INSERT WITH CHECK (
        game_session_id IN (
            SELECT id FROM game_sessions WHERE host_id = auth.uid()
        )
    );

CREATE POLICY "Game hosts can update turns" ON game_turns
    FOR UPDATE USING (
        game_session_id IN (
            SELECT id FROM game_sessions WHERE host_id = auth.uid()
        )
    );

-- Game Guesses Policies
CREATE POLICY "Players can view guesses for their turns" ON game_guesses
    FOR SELECT USING (
        turn_id IN (
            SELECT id FROM game_turns 
            WHERE game_session_id IN (
                SELECT id FROM game_sessions 
                WHERE room_id IN (
                    SELECT room_id FROM room_members 
                    WHERE user_id = auth.uid() AND is_active = true
                )
            )
        )
    );

CREATE POLICY "Players can submit their own guesses" ON game_guesses
    FOR INSERT WITH CHECK (
        auth.uid() = player_id AND
        turn_id IN (
            SELECT id FROM game_turns 
            WHERE game_session_id IN (
                SELECT id FROM game_sessions 
                WHERE room_id IN (
                    SELECT room_id FROM room_members 
                    WHERE user_id = auth.uid() AND is_active = true
                )
            )
        )
    );

CREATE POLICY "Players can update their own guesses" ON game_guesses
    FOR UPDATE USING (auth.uid() = player_id);

-- Comments for documentation
COMMENT ON TABLE user_song_stacks IS 'Stores user song collections for game rooms';
COMMENT ON TABLE game_sessions IS 'Game session management with host-controlled audio';
COMMENT ON TABLE game_turns IS 'Individual game turns with audio control and guessing phases';
COMMENT ON TABLE game_guesses IS 'Player guesses for each turn';

COMMENT ON COLUMN game_sessions.host_id IS 'Only the host can control audio playback';
COMMENT ON COLUMN game_turns.audio_control IS 'JSON object controlling audio state - only host can modify';
COMMENT ON COLUMN user_song_stacks.track_data IS 'Full Spotify track data cached for performance'; 