import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { Room, RoomMember, User } from '../types';
import { RoomService } from '../services/roomService';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabase';

interface RoomContextType {
  currentRoom: Room | null;
  roomMembers: RoomMember[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  createRoom: () => Promise<string | null>;
  joinRoom: (roomCode: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  refreshRoom: () => Promise<void>;
  clearError: () => void;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

interface RoomProviderProps {
  children: ReactNode;
}

export const RoomProvider: React.FC<RoomProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomService = RoomService.getInstance();

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const createRoom = useCallback(async (): Promise<string | null> => {
    if (!user) {
      setError('You must be logged in to create a room');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { room, roomCode } = await roomService.createRoom(user);
      setCurrentRoom(room);
      
      console.log('🎉 Room created in context:', { room, roomCode });
      
      // The createRoom service already calls joinRoom which handles adding the user
      // So we should get the members from there, but let's refresh to be sure
      try {
        const members = await roomService.getRoomMembers(room.id);
        setRoomMembers(members);
        console.log('👥 Room members set:', members);
      } catch (memberError) {
        console.error('Failed to get room members after creation:', memberError);
        // Fallback: create a basic member entry
        const fallbackMember: RoomMember = {
          room_id: room.id,
          user_id: user.id,
          user: user,
          score: 0,
          joined_at: new Date().toISOString(),
        };
        setRoomMembers([fallbackMember]);
      }

      return roomCode;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create room';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, roomService]);

  const joinRoom = useCallback(async (roomCode: string): Promise<boolean> => {
    if (!user) {
      setError('You must be logged in to join a room');
      return false;
    }

    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { room, members } = await roomService.joinRoom(roomCode, user);
      setCurrentRoom(room);
      setRoomMembers(members);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join room';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, roomService]);

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!currentRoom || !user) return;

    setIsLoading(true);
    setError(null);

    try {
      await roomService.leaveRoom(currentRoom.id, user.id);
      setCurrentRoom(null);
      setRoomMembers([]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to leave room';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentRoom, user, roomService]);

  const refreshRoom = useCallback(async (): Promise<void> => {
    if (!currentRoom) return;

    try {
      const members = await roomService.getRoomMembers(currentRoom.id);
      console.log('🔄 Room refreshed - Members found:', members.length, members.map(m => m.user?.display_name));
      setRoomMembers(members);
    } catch (err) {
      console.error('Failed to refresh room:', err);
    }
  }, [currentRoom, roomService]);

  // Real-time subscription for room member changes
  useEffect(() => {
    if (!currentRoom?.id) return;

    console.log('🔄 Setting up real-time subscription for room:', currentRoom.id);

    // Subscribe to room_members changes
    const subscription = supabase
      .channel(`room-${currentRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${currentRoom.id}`,
        },
        (payload) => {
          console.log('🔄 Real-time room member change:', payload);
          // Refresh room members when changes occur
          refreshRoom();
        }
      )
      .subscribe();

    return () => {
      console.log('🔄 Cleaning up real-time subscription');
      supabase.removeChannel(subscription);
    };
  }, [currentRoom?.id, refreshRoom]);

  const value: RoomContextType = {
    currentRoom,
    roomMembers,
    isLoading,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    refreshRoom,
    clearError,
  };

  return (
    <RoomContext.Provider value={value}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = (): RoomContextType => {
  const context = useContext(RoomContext);
  if (context === undefined) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
}; 