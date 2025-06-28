import { supabase } from './supabase';
import { Room, RoomMember, User, RoomSettings } from '../types';

export class RoomService {
  private static instance: RoomService;
  
  static getInstance(): RoomService {
    if (!RoomService.instance) {
      RoomService.instance = new RoomService();
    }
    return RoomService.instance;
  }

  // Generate a random room code
  private generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Check if we're using mock data (when Supabase isn't configured)
  private shouldUseMockData(): boolean {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    return !supabaseUrl || supabaseUrl.includes('placeholder');
  }

  async createRoom(hostUser: User): Promise<{ room: Room; roomCode: string }> {
    const roomCode = this.generateRoomCode();
    const defaultSettings: RoomSettings = {
      guess_time_limit: 15,
      max_repeats: 3,
      votes_needed: 2,
    };

    if (this.shouldUseMockData()) {
      // Mock implementation for development
      console.log('Creating mock room with code:', roomCode);
      
      const mockRoom: Room = {
        id: `mock-room-${Date.now()}`,
        code: roomCode,
        host_id: hostUser.id,
        state: 'waiting',
        settings: defaultSettings,
        created_at: new Date().toISOString(),
      };

      return { room: mockRoom, roomCode };
    }

    // Real Supabase implementation
    try {
      console.log('🏠 Creating room with real Supabase for user:', {
        userId: hostUser.id,
        spotifyId: hostUser.spotify_id,
        displayName: hostUser.display_name
      });
      
      console.log('🔧 Supabase config check:', {
        url: process.env.EXPO_PUBLIC_SUPABASE_URL?.substring(0, 40) + '...',
        hasAnonKey: !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        anonKeyLength: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.length
      });
      
      const { data: room, error } = await supabase
        .from('rooms')
        .insert({
          code: roomCode,
          created_by: hostUser.id,
          host_id: hostUser.id,
          state: 'waiting',
          settings: defaultSettings,
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Room creation error:', error);
        throw error;
      }

      console.log('✅ Room created successfully:', room.id);

      // Add host as first member
      await this.joinRoom(roomCode, hostUser);

      return { room, roomCode };
    } catch (error) {
      console.error('Error creating room:', error);
      throw new Error('Failed to create room. Please try again.');
    }
  }

  async joinRoom(roomCode: string, user: User): Promise<{ room: Room; members: RoomMember[] }> {
    const upperRoomCode = roomCode.toUpperCase();

    if (this.shouldUseMockData()) {
      // Mock implementation
      console.log('Joining mock room with code:', upperRoomCode);
      
      const mockRoom: Room = {
        id: `mock-room-${upperRoomCode}`,
        code: upperRoomCode,
        host_id: 'mock-host-id',
        state: 'waiting',
        settings: {
          guess_time_limit: 15,
          max_repeats: 3,
          votes_needed: 2,
        },
        created_at: new Date().toISOString(),
      };

      const mockMembers: RoomMember[] = [
        {
          room_id: mockRoom.id,
          user_id: user.id,
          user: user,
          score: 0,
          joined_at: new Date().toISOString(),
        },
      ];

      return { room: mockRoom, members: mockMembers };
    }

    // Real Supabase implementation
    try {
      // First, find the room
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', upperRoomCode)
        .single();

      if (roomError || !room) {
        throw new Error('Room not found. Please check the room code.');
      }

      if (room.state !== 'waiting') {
        throw new Error('This room is no longer accepting new players.');
      }

      // Check if user is already in the room
      console.log('🔍 Checking if user is already in room:', {
        roomId: room.id,
        userId: user.id,
        userSpotifyId: user.spotify_id
      });
      
      const { data: existingMember, error: memberCheckError } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', room.id)
        .eq('user_id', user.id)
        .single();
      
      console.log('🔍 Member check result:', {
        data: existingMember,
        error: memberCheckError,
        errorCode: memberCheckError?.code,
        errorMessage: memberCheckError?.message,
        errorDetails: memberCheckError?.details
      });
      
      if (memberCheckError && memberCheckError.code !== 'PGRST116') {
        console.error('❌ Error checking existing member:', memberCheckError);
        throw memberCheckError;
      }

      if (!existingMember) {
        // Add user to room
        console.log('👤 Adding user to room:', {
          room_id: room.id,
          user_id: user.id,
          score: 0
        });
        
        const { error: joinError } = await supabase
          .from('room_members')
          .insert({
            room_id: room.id,
            user_id: user.id,
            score: 0,
          });

        console.log('👤 User insertion result:', {
          error: joinError,
          errorCode: joinError?.code,
          errorMessage: joinError?.message,
          errorDetails: joinError?.details
        });

        if (joinError) throw joinError;
      } else {
        console.log('👤 User already exists in room');
      }

      // Get all room members
      console.log('👥 Fetching all room members for room:', room.id);
      
      const { data: members, error: membersError } = await supabase
        .from('room_members')
        .select(`
          *,
          user:users(*)
        `)
        .eq('room_id', room.id);

      console.log('👥 Members fetch result:', {
        data: members,
        error: membersError,
        errorCode: membersError?.code,
        errorMessage: membersError?.message,
        errorDetails: membersError?.details,
        membersCount: members?.length || 0
      });

      if (membersError) {
        console.error('❌ Error fetching members:', membersError);
        throw membersError;
      }

      return { room, members: members || [] };
    } catch (error) {
      console.error('Error joining room:', error);
      throw error;
    }
  }

  async getRoomMembers(roomId: string): Promise<RoomMember[]> {
    if (this.shouldUseMockData()) {
      // Return mock members
      return [
        {
          room_id: roomId,
          user_id: 'mock-user-1',
          user: {
            id: 'mock-user-1',
            spotify_id: 'mock-spotify-1',
            display_name: 'Player 1',
            avatar_url: 'https://via.placeholder.com/150',
            created_at: new Date().toISOString(),
          },
          score: 0,
          joined_at: new Date().toISOString(),
        },
      ];
    }

    console.log('🔍 Fetching room members for room:', roomId);
    
    const { data: members, error } = await supabase
      .from('room_members')
      .select(`
        *,
        user:users(*)
      `)
      .eq('room_id', roomId);

    console.log('👥 getRoomMembers result:', {
      roomId,
      membersCount: members?.length || 0,
      members: members?.map(m => ({
        userId: m.user_id,
        displayName: m.user?.display_name,
        joinedAt: m.joined_at
      })),
      error: error
    });

    if (error) throw error;
    return members || [];
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    if (this.shouldUseMockData()) {
      console.log('Leaving mock room:', roomId);
      return;
    }

    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async updateRoomState(roomId: string, state: Room['state']): Promise<void> {
    if (this.shouldUseMockData()) {
      console.log('Updating mock room state:', roomId, state);
      return;
    }

    const { error } = await supabase
      .from('rooms')
      .update({ state })
      .eq('id', roomId);

    if (error) throw error;
  }
} 