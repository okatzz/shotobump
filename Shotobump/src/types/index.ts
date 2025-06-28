export interface User {
  id: string;
  spotify_id: string;
  display_name: string;
  avatar_url?: string;
  access_token?: string;
  refresh_token?: string;
  created_at: string;
}

export interface Room {
  id: string;
  code: string;
  host_id: string;
  state: 'waiting' | 'playing' | 'finished';
  settings: RoomSettings;
  created_at: string;
}

export interface RoomSettings {
  guess_time_limit: number; // seconds
  max_repeats: number;
  votes_needed: number;
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  user: User;
  score: number;
  socket_id?: string;
  joined_at: string;
}

export interface Song {
  id: string;
  spotify_track_id: string;
  title: string;
  artist: string;
  preview_url?: string;
  album_art_url?: string;
  added_by: string;
  created_at: string;
}

export interface Turn {
  id: string;
  room_id: string;
  challenger_id: string;
  target_id: string;
  song_id: string;
  song: Song;
  started_at: string;
  status: 'active' | 'completed' | 'timeout';
  repeats_left: number;
  time_limit: number;
}

export interface Guess {
  id: string;
  turn_id: string;
  by_user_id: string;
  answer_text: string;
  accepted: boolean | null; // null = pending, true = accepted, false = rejected
  guessed_at: string;
}

export interface GameState {
  room: Room;
  members: RoomMember[];
  current_turn?: Turn;
  guesses: Guess[];
  timer_remaining?: number;
}

// WebSocket message types
export type WebSocketMessage = 
  | { type: 'room:join'; payload: { user_id: string } }
  | { type: 'room:leave'; payload: { user_id: string } }
  | { type: 'room:state'; payload: GameState }
  | { type: 'turn:start'; payload: Turn }
  | { type: 'player:guess'; payload: { answer_text: string } }
  | { type: 'turn:accept'; payload: { guess_id: string } }
  | { type: 'turn:reject'; payload: { guess_id: string } }
  | { type: 'score:update'; payload: { user_id: string; new_score: number } }
  | { type: 'timer:tick'; payload: { remaining: number } }
  | { type: 'game:end'; payload: { final_scores: Array<{ user_id: string; score: number }> } };

// Spotify API types
export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
  };
  preview_url?: string;
  external_urls: {
    spotify: string;
  };
  duration_ms: number;
  popularity: number;
  explicit: boolean;
}

export interface SpotifySearchResponse {
  tracks: {
    items: SpotifyTrack[];
  };
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  images: Array<{ url: string }>;
  email: string;
} 