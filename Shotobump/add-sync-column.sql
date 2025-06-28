-- Add sync_state column to game_sessions table for real-time synchronization
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS sync_state JSONB;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_game_sessions_sync_state ON game_sessions USING GIN (sync_state);

-- Add comment
COMMENT ON COLUMN game_sessions.sync_state IS 'JSON object containing real-time game synchronization state';

SELECT 'Sync state column added successfully! 🎮' as status; 