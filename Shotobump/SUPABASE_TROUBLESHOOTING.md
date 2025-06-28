# Supabase 406 Error Troubleshooting

## Current Issue
Getting 406 "Not Acceptable" errors when trying to query the `room_members` table.

## Possible Causes & Solutions

### 1. Row Level Security (RLS) Policies
**Most Likely Cause**: Supabase tables have RLS enabled but no policies are set up.

**Solution**: Go to Supabase Dashboard → Authentication → Policies and either:
- Disable RLS for development tables
- Or create policies to allow access

**Quick Fix for Development**:
```sql
-- Disable RLS on all tables for development
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE songs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_song_stacks DISABLE ROW LEVEL SECURITY;
ALTER TABLE turns DISABLE ROW LEVEL SECURITY;
ALTER TABLE guesses DISABLE ROW LEVEL SECURITY;
```

### 2. API Key Permissions
**Check**: Make sure you're using the correct anon key with proper permissions.

### 3. Foreign Key Constraints
**Check**: User might not exist in `users` table when trying to create `room_members` record.

## Debugging Steps

1. **Check RLS Status**:
   ```sql
   SELECT schemaname, tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public';
   ```

2. **Check if user exists**:
   ```sql
   SELECT * FROM users WHERE spotify_id = 'your_spotify_id';
   ```

3. **Test direct insert**:
   ```sql
   INSERT INTO room_members (room_id, user_id, score) 
   VALUES ('test-room-id', 'test-user-id', 0);
   ```

## Current Status
- ✅ Spotify authentication working
- ✅ Database tables created
- ❌ 406 errors on room_members queries
- 🔍 Added debugging logs to identify the issue

## Next Steps
1. Run the app and check console logs for debugging info
2. Check Supabase dashboard for RLS policies
3. Temporarily disable RLS if needed for development 