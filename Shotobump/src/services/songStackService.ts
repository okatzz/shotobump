import { supabase } from './supabase';
import { User, SpotifyTrack } from '../types';

export interface UserSongStack {
  id: string;
  user_id: string;
  room_id?: string;
  spotify_track_id: string;
  track_data: SpotifyTrack;
  added_at: string;
  is_active: boolean;
}

export class SongStackService {
  private static instance: SongStackService;

  static getInstance(): SongStackService {
    if (!SongStackService.instance) {
      SongStackService.instance = new SongStackService();
    }
    return SongStackService.instance;
  }

  private shouldUseMockData(): boolean {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    return !supabaseUrl || supabaseUrl.includes('placeholder');
  }

  async getUserSongStack(userId: string, roomId?: string): Promise<UserSongStack[]> {
    if (this.shouldUseMockData()) {
      // Mock data fallback
      const mockSongs: UserSongStack[] = [
        {
          id: `mock-song-${userId}-1`,
          user_id: userId,
          room_id: roomId,
          spotify_track_id: 'mock-track-1',
          track_data: {
            id: 'mock-track-1',
            name: 'Bohemian Rhapsody',
            artists: [{ name: 'Queen' }],
            album: {
              name: 'A Night at the Opera',
              images: [{ url: 'https://via.placeholder.com/300x300/FF6B6B/FFFFFF?text=Queen', height: 300, width: 300 }],
            },
            preview_url: 'https://file-examples.com/storage/fe5d6b8d1a8e2a8e3b3b3b3/2017/11/file_example_MP3_700KB.mp3',
            external_urls: { spotify: 'https://open.spotify.com/track/mock-1' },
            duration_ms: 355000,
            popularity: 85,
            explicit: false,
          },
          added_at: new Date().toISOString(),
          is_active: true,
        },
        {
          id: `mock-song-${userId}-2`,
          user_id: userId,
          room_id: roomId,
          spotify_track_id: 'mock-track-2',
          track_data: {
            id: 'mock-track-2',
            name: 'Hotel California',
            artists: [{ name: 'Eagles' }],
            album: {
              name: 'Hotel California',
              images: [{ url: 'https://via.placeholder.com/300x300/4ECDC4/FFFFFF?text=Eagles', height: 300, width: 300 }],
            },
            preview_url: 'https://file-examples.com/storage/fe5d6b8d1a8e2a8e3b3b3b3/2017/11/file_example_MP3_700KB.mp3',
            external_urls: { spotify: 'https://open.spotify.com/track/mock-2' },
            duration_ms: 391000,
            popularity: 90,
            explicit: false,
          },
          added_at: new Date().toISOString(),
          is_active: true,
        },
      ];
      return mockSongs;
    }

    // Real database implementation
    try {
      console.log('🎵 Loading user song stack for user:', userId, 'room:', roomId);
      
      let query = supabase
        .from('user_song_stacks')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('added_at', { ascending: false });

      if (roomId) {
        console.log('🎵 Filtering by room_id:', roomId);
        query = query.eq('room_id', roomId);
      } else {
        console.log('🎵 No room_id filter applied');
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching user song stack:', error);
        throw error;
      }

      console.log('✅ User song stack loaded:', data?.length || 0, 'songs');
      return data || [];
    } catch (error) {
      console.error('❌ Error in getUserSongStack:', error);
      throw error;
    }
  }

  async addSongToStack(
    userId: string, 
    track: SpotifyTrack, 
    roomId?: string
  ): Promise<UserSongStack> {
    if (this.shouldUseMockData()) {
      // Return mock data for development
      const mockSong: UserSongStack = {
        id: `mock-song-${Date.now()}`,
        user_id: userId,
        room_id: roomId,
        spotify_track_id: track.id,
        track_data: track,
        added_at: new Date().toISOString(),
        is_active: true,
      };
      return mockSong;
    }

    try {
      console.log('🔍 Checking for duplicate song:', track.name, 'by', track.artists[0]?.name);
      console.log('🔍 Checking for user:', userId, 'in room:', roomId);
      
      // Check if song already exists in user's stack
      let duplicateQuery = supabase
        .from('user_song_stacks')
        .select('id, room_id')
        .eq('user_id', userId)
        .eq('spotify_track_id', track.id)
        .eq('is_active', true);

      // Only filter by room_id if one is provided
      if (roomId) {
        duplicateQuery = duplicateQuery.eq('room_id', roomId);
      }

      const { data: existingSongs, error: checkError } = await duplicateQuery;

      if (checkError) {
        console.error('❌ Error checking for duplicates:', checkError);
        throw checkError;
      }

      console.log('🔍 Duplicate check result:', existingSongs);

      if (existingSongs && existingSongs.length > 0) {
        console.log('❌ Song already exists in stack:', existingSongs);
        throw new Error('Song already exists in your stack');
      }

      console.log('✅ Song not found in stack, proceeding to add');

      const newSong = {
        user_id: userId,
        room_id: roomId,
        spotify_track_id: track.id,
        track_data: track,
        added_at: new Date().toISOString(),
        is_active: true,
      };

      console.log('💾 Inserting song into database:', newSong);

      const { data, error } = await supabase
        .from('user_song_stacks')
        .insert(newSong)
        .select()
        .single();

      if (error) {
        console.error('❌ Error adding song to stack:', error);
        throw error;
      }

      console.log('✅ Song successfully added to database:', data);
      return data;
    } catch (error) {
      console.error('Error in addSongToStack:', error);
      throw error;
    }
  }

  async removeSongFromStack(songId: string, userId: string): Promise<void> {
    if (this.shouldUseMockData()) {
      // Mock implementation - just return
      return;
    }

    try {
      const { error } = await supabase
        .from('user_song_stacks')
        .update({ is_active: false })
        .eq('id', songId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error removing song from stack:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in removeSongFromStack:', error);
      throw error;
    }
  }

  async getAllRoomSongStacks(roomId: string): Promise<{ [userId: string]: UserSongStack[] }> {
    if (this.shouldUseMockData()) {
      // Return mock data for development - simulate all users having songs
      const mockStacks: { [userId: string]: UserSongStack[] } = {
        '1249066924': await this.getUserSongStack('1249066924', roomId),
        'test-player-3': await this.getUserSongStack('test-player-3', roomId),
      };
      return mockStacks;
    }

    try {
      const { data, error } = await supabase
        .from('user_song_stacks')
        .select(`
          *,
          user:users(id, display_name, avatar_url)
        `)
        .eq('room_id', roomId)
        .eq('is_active', true)
        .order('added_at', { ascending: false });

      if (error) {
        console.error('Error fetching room song stacks:', error);
        throw error;
      }

      // Group songs by user
      const groupedStacks: { [userId: string]: UserSongStack[] } = {};
      
      data?.forEach(song => {
        if (!groupedStacks[song.user_id]) {
          groupedStacks[song.user_id] = [];
        }
        groupedStacks[song.user_id].push(song);
      });

      return groupedStacks;
    } catch (error) {
      console.error('Error in getAllRoomSongStacks:', error);
      throw error;
    }
  }

  async getRandomSongFromUserStack(userId: string, roomId?: string): Promise<UserSongStack | null> {
    try {
      const userStack = await this.getUserSongStack(userId, roomId);
      
      if (userStack.length === 0) {
        return null;
      }

      // Return random song from user's stack
      const randomIndex = Math.floor(Math.random() * userStack.length);
      return userStack[randomIndex];
    } catch (error) {
      console.error('Error in getRandomSongFromUserStack:', error);
      throw error;
    }
  }

  async getUserStackCount(userId: string, roomId?: string): Promise<number> {
    try {
      const stack = await this.getUserSongStack(userId, roomId);
      return stack.length;
    } catch (error) {
      console.error('Error in getUserStackCount:', error);
      return 0;
    }
  }
} 