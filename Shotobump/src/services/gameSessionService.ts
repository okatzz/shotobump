import { supabase } from './supabase';
import { User } from '../types';
import { UserSongStack } from './songStackService';

export type GameState = 'waiting' | 'playing' | 'paused' | 'finished';
export type TurnState = 'playing_audio' | 'guessing' | 'voting' | 'results' | 'completed';
export type GamePhase = 'pre_game_countdown' | 'turn_countdown' | 'audio_playing' | 'guessing' | 'voting' | 'turn_results' | 'preparing_next_turn' | 'game_finished';

export interface GameSession {
  id: string;
  room_id: string;
  host_id: string; // Only host controls audio
  state: GameState;
  current_turn_id?: string;
  settings: {
    guess_time_limit: number; // seconds
    max_repeats: number;
    votes_needed: number;
  };
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface GameTurn {
  id: string;
  game_session_id: string;
  turn_number: number;
  challenger_id: string; // Player whose song is being played
  song_id: string; // Reference to user_song_stacks
  song_data: UserSongStack;
  state: TurnState;
  audio_control: {
    is_playing: boolean;
    play_count: number;
    max_plays: number;
    current_position: number; // seconds
    started_at?: string;
  };
  guesses: GameGuess[];
  voting_results?: VotingResults;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface GameGuess {
  id: string;
  turn_id: string;
  player_id: string;
  guess_text: string;
  confidence_level: 'low' | 'medium' | 'high';
  submitted_at: string;
}

export interface VotingResults {
  correct_guess_id?: string;
  votes: Array<{
    voter_id: string;
    guess_id?: string; // null if voting "no correct answer"
    voted_at: string;
  }>;
  is_completed: boolean;
}

// Add new interface for real-time game state synchronization
export interface GameSyncState {
  id: string;
  game_session_id: string;
  phase: GamePhase;
  time_remaining: number;
  current_attacker_id?: string;
  current_defender_id?: string;
  current_song_id?: string;
  current_song_data?: any;
  player_scores: Array<{
    userId: string;
    displayName: string;
    score: number;
    isOnline: boolean;
  }>;
  player_order: string[];
  current_turn_index: number;
  turn_data?: {
    attackerId: string;
    defenderId: string;
    currentSong: any;
    guesses: GameGuess[];
    challenges: string[];
    votingResults?: any;
    failedAttempts: number;
  };
  show_album_art: boolean;
  show_turn_summary?: boolean;
  turn_result?: any;
  updated_at: string;
  updated_by: string;
}

export class GameSessionService {
  private static instance: GameSessionService;

  static getInstance(): GameSessionService {
    if (!GameSessionService.instance) {
      GameSessionService.instance = new GameSessionService();
    }
    return GameSessionService.instance;
  }

  private shouldUseMockData(): boolean {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    return !supabaseUrl || supabaseUrl.includes('placeholder');
  }

  async createGameSession(roomId: string, hostId: string): Promise<GameSession> {
    if (this.shouldUseMockData()) {
      // Return mock data for development
      const mockSession: GameSession = {
        id: `mock-session-${Date.now()}`,
        room_id: roomId,
        host_id: hostId,
        state: 'waiting',
        settings: {
          guess_time_limit: 15,
          max_repeats: 3,
          votes_needed: 2,
        },
        created_at: new Date().toISOString(),
      };
      return mockSession;
    }

    try {
      console.log('📝 Preparing game session data...');
      const gameSession = {
        room_id: roomId,
        host_id: hostId,
        state: 'waiting' as GameState,
        settings: {
          guess_time_limit: 15,
          max_repeats: 3,
          votes_needed: 2,
        },
      };

      console.log('🎯 Inserting game session into database...');
      const { data, error } = await supabase
        .from('game_sessions')
        .insert(gameSession)
        .select()
        .single();

      if (error) {
        console.error('❌ Database error creating game session:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      console.log('✅ Game session created successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ Error in createGameSession:', error);
      throw error;
    }
  }

  async startGameSession(sessionId: string): Promise<GameSession> {
    if (this.shouldUseMockData()) {
      // Return mock data for development
      const mockSession: GameSession = {
        id: sessionId,
        room_id: 'mock-room',
        host_id: 'mock-host',
        state: 'playing',
        settings: {
          guess_time_limit: 15,
          max_repeats: 3,
          votes_needed: 2,
        },
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      };
      return mockSession;
    }

    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .update({
          state: 'playing',
          started_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        console.error('Error starting game session:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in startGameSession:', error);
      throw error;
    }
  }

  async createGameTurn(
    gameSessionId: string,
    challengerId: string,
    songId: string,
    songData: UserSongStack,
    turnNumber: number
  ): Promise<GameTurn> {
    if (this.shouldUseMockData()) {
      // Return mock data for development
      const mockTurn: GameTurn = {
        id: `mock-turn-${Date.now()}`,
        game_session_id: gameSessionId,
        turn_number: turnNumber,
        challenger_id: challengerId,
        song_id: songId,
        song_data: songData,
        state: 'playing_audio',
        audio_control: {
          is_playing: false,
          play_count: 0,
          max_plays: 3,
          current_position: 0,
        },
        guesses: [],
        created_at: new Date().toISOString(),
      };
      return mockTurn;
    }

    try {
      const gameTurn = {
        game_session_id: gameSessionId,
        turn_number: turnNumber,
        challenger_id: challengerId,
        song_id: songId,
        song_data: songData,
        state: 'playing_audio' as TurnState,
        audio_control: {
          is_playing: false,
          play_count: 0,
          max_plays: 3,
          current_position: 0,
        },
        guesses: [],
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('game_turns')
        .insert(gameTurn)
        .select()
        .single();

      if (error) {
        console.error('Error creating game turn:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in createGameTurn:', error);
      throw error;
    }
  }

  // HOST ONLY: Control audio playback
  async updateAudioControl(
    turnId: string,
    hostId: string,
    audioControl: Partial<GameTurn['audio_control']>
  ): Promise<void> {
    if (this.shouldUseMockData()) {
      console.log('🎵 Mock: Audio control updated by host', { turnId, audioControl });
      return;
    }

    try {
      // Verify the user is the host
      const { data: turn, error: fetchError } = await supabase
        .from('game_turns')
        .select(`
          *,
          game_session:game_sessions(host_id)
        `)
        .eq('id', turnId)
        .single();

      if (fetchError || !turn) {
        throw new Error('Turn not found');
      }

      if (turn.game_session.host_id !== hostId) {
        throw new Error('Only the host can control audio playback');
      }

      const { error } = await supabase
        .from('game_turns')
        .update({
          audio_control: {
            ...turn.audio_control,
            ...audioControl,
          },
        })
        .eq('id', turnId);

      if (error) {
        console.error('Error updating audio control:', error);
        throw error;
      }

      console.log('🎵 Audio control updated by host:', { turnId, audioControl });
    } catch (error) {
      console.error('Error in updateAudioControl:', error);
      throw error;
    }
  }

  async submitGuess(
    turnId: string,
    playerId: string,
    guessText: string,
    confidenceLevel: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<GameGuess> {
    if (this.shouldUseMockData()) {
      // Return mock data for development
      const mockGuess: GameGuess = {
        id: `mock-guess-${Date.now()}`,
        turn_id: turnId,
        player_id: playerId,
        guess_text: guessText,
        confidence_level: confidenceLevel,
        submitted_at: new Date().toISOString(),
      };
      return mockGuess;
    }

    try {
      const guess = {
        turn_id: turnId,
        player_id: playerId,
        guess_text: guessText,
        confidence_level: confidenceLevel,
        submitted_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('game_guesses')
        .insert(guess)
        .select()
        .single();

      if (error) {
        console.error('Error submitting guess:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in submitGuess:', error);
      throw error;
    }
  }

  async getCurrentGameSession(roomId: string): Promise<GameSession | null> {
    if (this.shouldUseMockData()) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_id', roomId)
        .in('state', ['waiting', 'playing', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching current game session:', error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Error in getCurrentGameSession:', error);
      return null;
    }
  }

  async getCurrentTurn(gameSessionId: string): Promise<GameTurn | null> {
    if (this.shouldUseMockData()) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('game_turns')
        .select('*')
        .eq('game_session_id', gameSessionId)
        .neq('state', 'completed')
        .order('turn_number', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching current turn:', error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Error in getCurrentTurn:', error);
      return null;
    }
  }

  // NEW: Real-time synchronization methods using the game_sync_states table
  async updateGameSyncState(gameSessionId: string, syncState: Partial<GameSyncState>, updatedBy: string): Promise<void> {
    if (this.shouldUseMockData()) {
      console.log('🔄 Mock: Game sync state updated');
      return;
    }

    try {
      const updateData = {
        ...syncState,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      };

      // First try to update existing record
      const { data: existingData, error: selectError } = await supabase
        .from('game_sync_states')
        .select('id')
        .eq('game_session_id', gameSessionId)
        .single();

      if (existingData) {
        // Update existing record
        const { error } = await supabase
          .from('game_sync_states')
          .update(updateData)
          .eq('game_session_id', gameSessionId);

        if (error) {
          console.error('❌ Error updating game sync state:', error);
          throw error;
        }
      } else {
        // Insert new record
        const { error } = await supabase
          .from('game_sync_states')
          .insert({
            game_session_id: gameSessionId,
            ...updateData,
          });

        if (error) {
          console.error('❌ Error inserting game sync state:', error);
          throw error;
        }
      }

      console.log('✅ Game sync state updated successfully');
    } catch (error) {
      console.error('❌ Error in updateGameSyncState:', error);
      throw error;
    }
  }

  async getGameSyncState(gameSessionId: string): Promise<GameSyncState | null> {
    if (this.shouldUseMockData()) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('game_sync_states')
        .select('*')
        .eq('game_session_id', gameSessionId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Error fetching game sync state:', error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('❌ Error in getGameSyncState:', error);
      return null;
    }
  }

  async deleteGameSyncState(gameSessionId: string): Promise<void> {
    if (this.shouldUseMockData()) {
      console.log('🗑️ Mock: Game sync state deleted');
      return;
    }

    try {
      const { error } = await supabase
        .from('game_sync_states')
        .delete()
        .eq('game_session_id', gameSessionId);

      if (error) {
        console.error('❌ Error deleting game sync state:', error);
        throw error;
      }

      console.log('✅ Game sync state deleted successfully');
    } catch (error) {
      console.error('❌ Error in deleteGameSyncState:', error);
      throw error;
    }
  }

  // Helper method to sync game phase transitions
  async syncGamePhase(gameSessionId: string, phase: GamePhase, timeRemaining: number, updatedBy: string, additionalData?: any): Promise<void> {
    const syncUpdate: Partial<GameSyncState> = {
      phase,
      time_remaining: timeRemaining,
      ...additionalData,
    };

    await this.updateGameSyncState(gameSessionId, syncUpdate, updatedBy);
  }

  // Helper method to sync turn data
  async syncTurnData(gameSessionId: string, turnData: any, updatedBy: string): Promise<void> {
    const syncUpdate: Partial<GameSyncState> = {
      current_attacker_id: turnData.attackerId,
      current_defender_id: turnData.defenderId,
      current_song_data: turnData.currentSong,
      turn_data: turnData,
    };

    await this.updateGameSyncState(gameSessionId, syncUpdate, updatedBy);
  }

  // Helper method to sync player scores
  async syncPlayerScores(gameSessionId: string, playerScores: any[], playerOrder: string[], currentTurnIndex: number, updatedBy: string): Promise<void> {
    const syncUpdate: Partial<GameSyncState> = {
      player_scores: playerScores,
      player_order: playerOrder,
      current_turn_index: currentTurnIndex,
    };

    await this.updateGameSyncState(gameSessionId, syncUpdate, updatedBy);
  }

  // Helper method to sync album art reveal
  async syncAlbumArtReveal(gameSessionId: string, showAlbumArt: boolean, updatedBy: string): Promise<void> {
    const syncUpdate: Partial<GameSyncState> = {
      show_album_art: showAlbumArt,
    };

    await this.updateGameSyncState(gameSessionId, syncUpdate, updatedBy);
  }
} 