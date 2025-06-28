# Shotobump 🎵

The Ultimate Music Recognition Game for iOS - Challenge your friends to guess songs from your Spotify library!

## Features

- 🎯 **Challenge Friends**: Create or join game rooms with friends
- ⏱️ **Fast-Paced Rounds**: 15-second song recognition challenges
- 🏆 **Competitive Scoring**: Vote on answers and earn points
- 🎵 **Spotify Integration**: Use your own music library
- 📱 **Cross-Platform**: React Native app that works on iOS and web

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI (`npm install -g @expo/cli`)
- iOS Simulator (for iOS development)
- Spotify Developer Account
- Supabase Account

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd Shotobump
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Settings > API to get your project URL and anon key
3. In the SQL Editor, run the following to create the database schema:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  spotify_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rooms table
CREATE TABLE rooms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  host_id UUID REFERENCES users(id) ON DELETE CASCADE,
  state TEXT DEFAULT 'waiting' CHECK (state IN ('waiting', 'playing', 'finished')),
  settings JSONB DEFAULT '{"guess_time_limit": 15, "max_repeats": 3, "votes_needed": 2}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Room members table
CREATE TABLE room_members (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER DEFAULT 0,
  socket_id TEXT,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

-- Songs table
CREATE TABLE songs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  spotify_track_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  preview_url TEXT,
  album_art_url TEXT,
  added_by UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User song stacks table
CREATE TABLE user_song_stacks (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, song_id)
);

-- Turns table
CREATE TABLE turns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  challenger_id UUID REFERENCES users(id) ON DELETE CASCADE,
  target_id UUID REFERENCES users(id) ON DELETE CASCADE,
  song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'timeout')),
  repeats_left INTEGER DEFAULT 3,
  time_limit INTEGER DEFAULT 15
);

-- Guesses table
CREATE TABLE guesses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  turn_id UUID REFERENCES turns(id) ON DELETE CASCADE,
  by_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  accepted BOOLEAN,
  guessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_room_members_room_id ON room_members(room_id);
CREATE INDEX idx_songs_spotify_track_id ON songs(spotify_track_id);
CREATE INDEX idx_turns_room_id ON turns(room_id);
CREATE INDEX idx_guesses_turn_id ON guesses(turn_id);
```

### 3. Set Up Spotify Developer App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add these redirect URIs:
   - `shotobump://auth` (for the mobile app)
   - `http://localhost:19006/auth` (for web development)
4. Copy your Client ID

### 4. Configure Environment Variables

1. Copy `env.example` to `.env`:
   ```bash
   cp env.example .env
   ```

2. Fill in your actual values:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your-spotify-client-id
   ```

### 5. Run the App

```bash
# Start the development server
npm start

# Run on iOS simulator
npm run ios

# Run on web
npm run web
```

## Game Rules

1. **Setup**: Each player logs in with Spotify and joins a room
2. **Preparation**: Players add songs to their personal stack from Spotify
3. **Gameplay**: 
   - Players take turns challenging each other
   - The challenger plays a song from the target player's stack
   - The target has 15 seconds and up to 3 repeats to guess
   - Other players can vote to accept/reject answers
   - Correct guesses earn 1 point
   - If no one guesses correctly, the challenger loses 1 point
4. **Winning**: Play until you decide to stop and see who has the most points!

## Architecture

- **Frontend**: React Native with Expo
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Authentication**: Spotify OAuth with PKCE
- **Real-time**: WebSocket connections via Supabase Realtime
- **Music**: Spotify Web API for search and 30-second previews

## Development Roadmap

- [x] **Milestone 1**: Spotify OAuth authentication
- [x] **Milestone 2**: Basic UI screens (Login, Home)
- [ ] **Milestone 3**: Room creation and joining
- [ ] **Milestone 4**: Song stack management
- [ ] **Milestone 5**: Game engine and real-time gameplay
- [ ] **Milestone 6**: Scoring and voting system
- [ ] **Milestone 7**: Polish and iOS deployment

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details 