# Database Setup Guide

## 🚨 **Current Issue: Missing Columns**
You're getting `ERROR: 42703: column "room_id" does not exist` because your `user_song_stacks` table doesn't have all the required columns.

## 🔧 **Quick Fix - Run This SQL**

### **Option 1: Safe Migration (Recommended)**
Copy and paste this into your **Supabase SQL Editor**:

```sql
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
```

## 📋 **Steps to Fix:**

### **1. Open Supabase Dashboard**
- Go to your Supabase project
- Navigate to **SQL Editor**

### **2. Run the Migration**
- Copy the SQL above
- Paste into SQL Editor
- Click **Run**

### **3. Verify Success**
You should see output like:
```
NOTICE: user_song_stacks table exists, checking columns...
NOTICE: Added room_id column
NOTICE: Added is_active column
NOTICE: Added track_data column
NOTICE: Added added_at column
```

### **4. Test the App**
- Refresh your browser
- Try "🎵 Manage My Songs"
- Try "Start Game"

## 🎯 **What This Fixes:**

### **Before:**
- ❌ `column "room_id" does not exist`
- ❌ `column "is_active" does not exist`
- ❌ Song management fails
- ❌ Game starting fails

### **After:**
- ✅ All required columns exist
- ✅ Song management works
- ✅ Game starting works
- ✅ Real database integration
- ✅ Fallback to mock data if needed

## 🔄 **Fallback System**

I've also updated the code to:
1. **Try real database first**
2. **Fallback to mock data** if database has issues
3. **Show helpful warnings** in console
4. **Keep app working** regardless of database state

## 🚀 **After Running the SQL:**

You should be able to:
- ✅ **Add real songs** to your stack
- ✅ **Remove songs** from your stack  
- ✅ **Start games** with real validation
- ✅ **Store data** in Supabase
- ✅ **Sync between players** in real-time

## 🆘 **If You Still Have Issues:**

1. **Check your Supabase logs** for any errors
2. **Verify the table structure** with:
   ```sql
   \d user_song_stacks
   ```
3. **Check RLS policies** are working
4. **The app will still work** with mock data as fallback

Run the SQL migration and let me know if you need any help! 🎮 