import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

// These will need to be replaced with your actual Supabase project values
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Disable auto-refresh since we'll handle Spotify tokens separately
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Database table type definitions for Supabase
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          spotify_id: string;
          display_name: string;
          avatar_url: string | null;
          access_token: string | null;
          refresh_token: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          spotify_id: string;
          display_name: string;
          avatar_url?: string | null;
          access_token?: string | null;
          refresh_token?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          spotify_id?: string;
          display_name?: string;
          avatar_url?: string | null;
          access_token?: string | null;
          refresh_token?: string | null;
          created_at?: string;
        };
      };
      rooms: {
        Row: {
          id: string;
          code: string;
          host_id: string;
          state: 'waiting' | 'playing' | 'finished';
          settings: {
            guess_time_limit: number;
            max_repeats: number;
            votes_needed: number;
          };
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          host_id: string;
          state?: 'waiting' | 'playing' | 'finished';
          settings?: {
            guess_time_limit: number;
            max_repeats: number;
            votes_needed: number;
          };
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          host_id?: string;
          state?: 'waiting' | 'playing' | 'finished';
          settings?: {
            guess_time_limit: number;
            max_repeats: number;
            votes_needed: number;
          };
          created_at?: string;
        };
      };
      room_members: {
        Row: {
          room_id: string;
          user_id: string;
          score: number;
          socket_id: string | null;
          joined_at: string;
        };
        Insert: {
          room_id: string;
          user_id: string;
          score?: number;
          socket_id?: string | null;
          joined_at?: string;
        };
        Update: {
          room_id?: string;
          user_id?: string;
          score?: number;
          socket_id?: string | null;
          joined_at?: string;
        };
      };
      songs: {
        Row: {
          id: string;
          spotify_track_id: string;
          title: string;
          artist: string;
          preview_url: string | null;
          album_art_url: string | null;
          added_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          spotify_track_id: string;
          title: string;
          artist: string;
          preview_url?: string | null;
          album_art_url?: string | null;
          added_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          spotify_track_id?: string;
          title?: string;
          artist?: string;
          preview_url?: string | null;
          album_art_url?: string | null;
          added_by?: string;
          created_at?: string;
        };
      };
      user_song_stacks: {
        Row: {
          user_id: string;
          song_id: string;
          added_at: string;
        };
        Insert: {
          user_id: string;
          song_id: string;
          added_at?: string;
        };
        Update: {
          user_id?: string;
          song_id?: string;
          added_at?: string;
        };
      };
      turns: {
        Row: {
          id: string;
          room_id: string;
          challenger_id: string;
          target_id: string;
          song_id: string;
          started_at: string;
          status: 'active' | 'completed' | 'timeout';
          repeats_left: number;
          time_limit: number;
        };
        Insert: {
          id?: string;
          room_id: string;
          challenger_id: string;
          target_id: string;
          song_id: string;
          started_at?: string;
          status?: 'active' | 'completed' | 'timeout';
          repeats_left?: number;
          time_limit?: number;
        };
        Update: {
          id?: string;
          room_id?: string;
          challenger_id?: string;
          target_id?: string;
          song_id?: string;
          started_at?: string;
          status?: 'active' | 'completed' | 'timeout';
          repeats_left?: number;
          time_limit?: number;
        };
      };
      guesses: {
        Row: {
          id: string;
          turn_id: string;
          by_user_id: string;
          answer_text: string;
          accepted: boolean | null;
          guessed_at: string;
        };
        Insert: {
          id?: string;
          turn_id: string;
          by_user_id: string;
          answer_text: string;
          accepted?: boolean | null;
          guessed_at?: string;
        };
        Update: {
          id?: string;
          turn_id?: string;
          by_user_id?: string;
          answer_text?: string;
          accepted?: boolean | null;
          guessed_at?: string;
        };
      };
    };
  };
}; 