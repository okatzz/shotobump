# 🗄️ Database Reset Guide

This guide explains how to reset your Shotobump database when you need a fresh start or encounter database issues.

## 📋 Available Scripts

### 1. Complete Database Recreation
**File:** `recreate-database.sql`
- ⚠️ **DELETES ALL DATA** and recreates everything from scratch
- Creates all tables, indexes, constraints, and relationships
- Inserts fresh test data
- Disables RLS (Row Level Security) for development
- Use when: Database schema is corrupted or you need a completely fresh start

### 2. Data Reset Only
**File:** `reset-data-only.sql`
- Keeps existing table structure
- Only clears and reinserts test data
- Much faster than full recreation
- Use when: Tables are fine but you want fresh test data

### 3. Automated Script
**File:** `db-reset.sh`
- Interactive shell script for easy database operations
- Handles both full recreation and data-only reset
- Provides safety confirmations
- Works with Supabase CLI or manual copy-paste

## 🚀 Quick Start

### Option 1: Using the Shell Script (Recommended)
```bash
# Make script executable (first time only)
chmod +x db-reset.sh

# Complete database recreation
./db-reset.sh full

# Data reset only
./db-reset.sh data

# Show help
./db-reset.sh help
```

### Option 2: Manual SQL Execution
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **SQL Editor**
4. Copy and paste the contents of your chosen SQL file
5. Click **"Run"**

## 🎯 When to Use Each Script

### Use `recreate-database.sql` when:
- ✅ First time setting up the database
- ✅ Database schema errors or corruption
- ✅ Missing tables or columns
- ✅ RLS (Row Level Security) issues causing 406 errors
- ✅ Major schema changes needed
- ✅ Starting completely fresh

### Use `reset-data-only.sql` when:
- ✅ Need fresh test data for development
- ✅ Database tables are working fine
- ✅ Want to clear user-generated content
- ✅ Testing different scenarios
- ✅ Quick reset between development sessions

## 📊 What Gets Created

### Tables Created:
- **users** - Spotify user accounts
- **rooms** - Game rooms with codes
- **room_members** - Who's in each room
- **songs** - Individual song records
- **user_song_stacks** - Each player's song collection per room
- **game_sessions** - Active games with host control
- **game_turns** - Individual turns with audio control
- **game_guesses** - Player guesses for each turn
- **turns** - Legacy turns (backwards compatibility)
- **guesses** - Legacy guesses (backwards compatibility)

### Test Data Included:
- **6 test users** (Player 1-3, Host, John Doe, Jane Smith)
- **3 test rooms** (TEST123, DEMO456, PLAY789)
- **5 sample songs** (Queen, Eagles, Journey, Guns N' Roses)
- **Room memberships** with different scenarios
- **Song stacks** for testing game functionality

### Features Configured:
- **UUID primary keys** for all tables
- **Performance indexes** on frequently queried columns
- **Foreign key constraints** for data integrity
- **RLS disabled** for development (prevents 406 errors)
- **JSON columns** for flexible settings and metadata
- **Timestamps** for audit trails

## 🔧 Troubleshooting

### Common Issues:

#### "Table already exists" errors
- Use the **complete recreation script** which drops tables first
- Or manually drop tables in Supabase dashboard

#### "Column does not exist" errors
- Your existing schema doesn't match the app expectations
- Use the **complete recreation script** to fix schema issues

#### 406 "Not Acceptable" errors
- RLS (Row Level Security) is enabled without proper policies
- Both scripts disable RLS for development
- Run either script to fix this issue

#### "Foreign key constraint" errors
- Data insertion order is wrong
- Scripts handle proper insertion order automatically

### Script Execution Issues:

#### Shell script won't run
```bash
# Make sure it's executable
chmod +x db-reset.sh

# Run from the correct directory
cd /path/to/Shotobump
./db-reset.sh help
```

#### Supabase CLI not found
- Install: `npm install -g supabase`
- Or use manual copy-paste method
- Script provides fallback instructions

## 🧪 Testing Your Reset

After running either script, test these features:

1. **Room Creation**
   - Try joining room "TEST123"
   - Create a new room
   - Check if players appear

2. **User Authentication**
   - Test mock user login (Player 1, 2, 3)
   - Check if Spotify login works

3. **Song Management**
   - Go to "Manage My Songs"
   - Add/remove songs
   - Check song stack counter

4. **Real-time Features**
   - Join room with multiple browser tabs
   - Check if players sync in real-time
   - Test the refresh button

## 📱 Development Workflow

### Recommended Reset Schedule:
- **Daily**: Use `reset-data-only.sql` for fresh test data
- **Weekly**: Use `recreate-database.sql` for complete refresh
- **After schema changes**: Always use `recreate-database.sql`
- **Before testing**: Use `reset-data-only.sql` for consistent state

### Integration with Development:
```bash
# Start development session
./db-reset.sh data
cd Shotobump && npm start

# Test your features with fresh data
# Make changes to your code
# Reset data again when needed
./db-reset.sh data
```

## 🔐 Security Notes

### Development vs Production:
- These scripts **disable RLS** for development ease
- **Never run these on production** databases
- Production should have proper RLS policies enabled
- Test data includes mock users with predictable IDs

### Data Privacy:
- Scripts include **sample/mock data only**
- No real user data or Spotify tokens
- Safe to run multiple times
- All test data is clearly marked

## 🆘 Emergency Recovery

If your database is completely broken:

1. **Backup any important data** (if possible)
2. Run the **complete recreation script**:
   ```bash
   ./db-reset.sh full
   ```
3. **Update your .env file** with correct Supabase credentials
4. **Test basic functionality** before continuing development
5. **Re-run your app** and verify everything works

## 📞 Need Help?

If you encounter issues not covered here:

1. Check the **script output** for specific error messages
2. Look at your **Supabase dashboard logs**
3. Verify your **environment variables** are correct
4. Try the **manual SQL execution** method
5. Consider running the **complete recreation** if data-only reset fails

---

## 🎉 Success Indicators

You'll know the reset worked when:
- ✅ No database errors in console
- ✅ Room "TEST123" exists and is joinable
- ✅ Mock users (Player 1, 2, 3) can login
- ✅ Song management screen works
- ✅ Real-time player sync functions
- ✅ No 406 "Not Acceptable" errors

Your Shotobump database is now ready for development! 🎵 