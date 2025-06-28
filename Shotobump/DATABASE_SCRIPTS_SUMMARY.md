# 📋 Database Scripts Quick Reference

## 🚀 Main Scripts

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `./db-reset.sh full` | Complete database recreation | First setup, schema issues, RLS errors |
| `./db-reset.sh data` | Reset test data only | Daily development, fresh test data |
| `./db-reset.sh help` | Show usage instructions | When you need help |

## 📁 SQL Files

| File | Description | Size |
|------|-------------|------|
| `recreate-database.sql` | Complete database recreation with test data | ~400 lines |
| `reset-data-only.sql` | Clear and insert fresh test data | ~150 lines |

## 🏃‍♂️ Quick Commands

```bash
# Complete fresh start (⚠️ DELETES ALL DATA)
./db-reset.sh full

# Just reset test data (keeps tables)
./db-reset.sh data

# Show help
./db-reset.sh help
```

## 🎯 What Gets Created

### Test Users (6 total)
- **Player 1, 2, 3** - Mock users for testing
- **Host Player** - Room creator
- **John Doe, Jane Smith** - Spotify users

### Test Rooms (3 total)
- **TEST123** - 3 players, ready for testing
- **DEMO456** - 2 players with scores
- **PLAY789** - 3 players, songs ready

### Test Songs (5 total)
- **Queen** - Bohemian Rhapsody, Somebody to Love
- **Eagles** - Hotel California
- **Journey** - Don't Stop Believin'
- **Guns N' Roses** - Sweet Child O' Mine

## 🔧 Manual Alternative

If scripts don't work, manually copy SQL to [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor

## ✅ Success Check

After running scripts, verify:
- [ ] Join room "TEST123" works
- [ ] Mock user login works
- [ ] "Manage My Songs" opens
- [ ] No 406 errors in console
- [ ] Real-time player sync works

---

**Need detailed instructions?** → See `DATABASE_RESET_GUIDE.md`