import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useAuth } from '../contexts/AuthContext';
import { useRoom } from '../contexts/RoomContext';
import { GameSessionService, GameSession, GameTurn, GameGuess, GameSyncState, GamePhase } from '../services/gameSessionService';
import { SongStackService } from '../services/songStackService';

interface GameplayScreenProps {
  navigation: any;
  route?: {
    params?: {
      gameSession?: GameSession;
    };
  };
}

interface PlayerScore {
  userId: string;
  displayName: string;
  score: number;
  isOnline: boolean;
}

interface TurnData {
  attackerId: string;
  defenderId: string;
  currentSong: any;
  guesses: GameGuess[];
  challenges: string[]; // User IDs who challenged
  votingResults?: any;
  failedAttempts: number;
}

const GameplayScreen: React.FC<GameplayScreenProps> = ({ navigation, route }) => {
  const { user } = useAuth();
  const { currentRoom, roomMembers } = useRoom();
  const initialGameSession = route?.params?.gameSession;

  if (!initialGameSession) {
    navigation.goBack();
    return null;
  }

  // Game state
  const [gameSession, setGameSession] = useState<GameSession>(initialGameSession);
  const [gamePhase, setGamePhase] = useState<GamePhase>('pre_game_countdown');
  const [timeRemaining, setTimeRemaining] = useState<number>(5); // Start with 5-second countdown
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Player management
  const [playerScores, setPlayerScores] = useState<PlayerScore[]>([]);
  const [playerOrder, setPlayerOrder] = useState<string[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(1);
  const [currentAttempt, setCurrentAttempt] = useState(1);

  // Turn state
  const [turnData, setTurnData] = useState<TurnData | null>(null);
  const [hasSubmittedGuess, setHasSubmittedGuess] = useState(false);
  const [hasChallenged, setHasChallenged] = useState(false);
  const [guessText, setGuessText] = useState('');
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [showAlbumArt, setShowAlbumArt] = useState(false); // Controls if album art is revealed

  // Audio state
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [countdownSound, setCountdownSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);

  // Services
  const gameSessionService = GameSessionService.getInstance();
  const songStackService = SongStackService.getInstance();

  // Timers
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);

  // Add voting state management
  const [votes, setVotes] = useState<{[key: string]: string}>({});
  const [hasVoted, setHasVoted] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showTurnSummary, setShowTurnSummary] = useState(false);
  const [turnResult, setTurnResult] = useState<{
    winner: string;
    winnerType: 'attacker' | 'defender' | 'challenger';
    reason: string;
    nextAttacker: string;
    nextDefender: string;
  } | null>(null);

  // Use refs to preserve state during sync cycles
  const localStateRef = useRef({
    hasSubmittedGuess: false,
    hasChallenged: false,
    guessText: '',
    isTyping: false,
    lastTurnId: '',
  });

  // Sync local state with refs
  useEffect(() => {
    localStateRef.current.hasSubmittedGuess = hasSubmittedGuess;
    localStateRef.current.hasChallenged = hasChallenged;
    localStateRef.current.guessText = guessText;
    localStateRef.current.isTyping = isTyping;
  }, [hasSubmittedGuess, hasChallenged, guessText, isTyping]);

  const isHost = user?.id === gameSession.host_id;
  const currentAttacker = turnData ? playerScores.find(p => p.userId === turnData.attackerId) : null;
  const currentDefender = turnData ? playerScores.find(p => p.userId === turnData.defenderId) : null;
  const isCurrentAttacker = turnData?.attackerId === user?.id;
  const isCurrentDefender = turnData?.defenderId === user?.id;
  const canChallenge = turnData && !isCurrentAttacker && !isCurrentDefender && !hasChallenged;

  useEffect(() => {
    initializeGame();
    startGameLoop();

    return () => {
      cleanup();
    };
  }, []);

  // Setup audio when component mounts
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        console.log('✅ Audio mode configured');
      } catch (error) {
        console.error('❌ Error setting up audio:', error);
      }
    };
    
    setupAudio();
  }, []);

  useEffect(() => {
    if (timeRemaining > 0 && isHost) {
      // Play countdown sound for last 3 seconds
      if (timeRemaining <= 3 && (gamePhase === 'pre_game_countdown' || gamePhase === 'turn_countdown')) {
        playCountdownSound();
      }
      
      timerRef.current = setTimeout(() => {
        const newTime = timeRemaining - 1;
        setTimeRemaining(newTime);
        
        // Sync the timer update to database
        syncToDatabase({
          time_remaining: newTime,
        });
      }, 1000);
    } else if (timeRemaining === 0 && isHost) {
      handleTimerComplete();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [timeRemaining, gamePhase, isHost]);

  useEffect(() => {
    // Host automatically moves to voting when a guess is submitted
    if (isHost && turnData && turnData.guesses.length > 0 && gamePhase === 'guessing') {
      console.log('🎯 Host detected guess submission, moving to voting phase');
      setGamePhase('voting');
      setShowVotingModal(true);
      
      syncToDatabase({
        phase: 'voting',
        time_remaining: 30, // 30 seconds for voting
      });
    }
  }, [turnData?.guesses?.length, gamePhase, isHost]);

  const initializeGame = async () => {
    try {
      setIsLoading(true);
      console.log('🎮 Initializing game...');

      // Initialize player scores and order
      const scores: PlayerScore[] = roomMembers.map(member => ({
        userId: member.user_id,
        displayName: member.user?.display_name || 'Unknown',
        score: 0, // Start with 0 points instead of 10
        isOnline: true,
      }));

      // Host starts first, then order by join time
      const hostIndex = scores.findIndex(p => p.userId === gameSession.host_id);
      const host = scores[hostIndex];
      const others = scores.filter((_, i) => i !== hostIndex);
      const orderedPlayers = [host, ...others];

      setPlayerScores(scores);
      setPlayerOrder(orderedPlayers.map(p => p.userId));

      // If host, initialize sync state with 5-second countdown
      if (isHost) {
        await initializeHostSyncState(scores, orderedPlayers.map(p => p.userId));
      }

      console.log('✅ Game initialized with players:', orderedPlayers.map(p => p.displayName));
    } catch (error) {
      console.error('Error initializing game:', error);
      Alert.alert('Error', 'Failed to initialize game.');
    } finally {
      setIsLoading(false);
    }
  };

  const initializeHostSyncState = async (scores: PlayerScore[], order: string[]) => {
    try {
      const initialSyncState: Partial<GameSyncState> = {
        phase: 'pre_game_countdown',
        time_remaining: 5, // 5-second countdown as requested
        player_scores: scores,
        player_order: order,
        current_turn_index: 0,
        show_album_art: false,
      };

      await gameSessionService.updateGameSyncState(gameSession.id, initialSyncState, user!.id);
      console.log('🎯 Host initialized sync state with 5-second countdown');
    } catch (error) {
      console.error('Error initializing host sync state:', error);
    }
  };

  const startGameLoop = () => {
    gameLoopRef.current = setInterval(async () => {
      // Sync game state with other players
      await syncGameState();
    }, 1000); // Sync every second for real-time experience
  };

  const syncGameState = async () => {
    try {
      // Get the latest sync state from database
      const syncState = await gameSessionService.getGameSyncState(gameSession.id);
      
      if (!syncState) {
        console.log('🔄 No sync state found');
        return;
      }

      // Check if this is a newer update (avoid loops)
      if (syncState.updated_at === lastSyncTime) {
        return;
      }

      // Don't sync if this update came from the current user (avoid loops)
      if (syncState.updated_by === user?.id) {
        setLastSyncTime(syncState.updated_at);
        return;
      }

      console.log('🔄 Syncing game state from:', syncState.updated_by, 'Phase:', syncState.phase, 'Time:', syncState.time_remaining);

      // Update local state with synced data
      if (syncState.phase !== gamePhase) {
        setGamePhase(syncState.phase);
        console.log('📱 Phase changed to:', syncState.phase);
        
        // Trigger audio for non-host players when audio phase starts
        if (syncState.phase === 'audio_playing' && !isHost) {
          console.log('🎵 Non-host detected audio phase, starting audio playback');
          playAudio();
        }
      }

      // Only sync timer if we're not the host (host controls timing)
      if (!isHost && syncState.time_remaining !== timeRemaining) {
        setTimeRemaining(syncState.time_remaining);
        console.log('⏰ Timer synced to:', syncState.time_remaining);
      }

      if (syncState.player_scores) {
        setPlayerScores(syncState.player_scores);
      }

      if (syncState.player_order) {
        setPlayerOrder(syncState.player_order);
      }

      if (syncState.current_turn_index !== undefined) {
        setCurrentTurnIndex(syncState.current_turn_index);
      }

      if (syncState.turn_data) {
        // Create turn ID for comparison - use a more stable identifier
        const currentTurnId = turnData ? `${turnData.attackerId}-${turnData.defenderId}` : null;
        const newTurnId = `${syncState.turn_data.attackerId}-${syncState.turn_data.defenderId}`;
        
        // Update turn data
        setTurnData(syncState.turn_data);
        
        // Check if this is a completely new turn (different attacker/defender pair)
        const isNewTurn = currentTurnId !== newTurnId;
        
        if (isNewTurn && currentTurnId !== null) {
          console.log('🔄 New turn detected, resetting all state');
          // Reset everything for new turn
          setHasSubmittedGuess(false);
          setHasChallenged(false);
          setGuessText('');
          setVotes({});
          setHasVoted(false);
          setShowVotingModal(false);
          setIsTyping(false);
          
          // Update ref
          localStateRef.current = {
            hasSubmittedGuess: false,
            hasChallenged: false,
            guessText: '',
            isTyping: false,
            lastTurnId: newTurnId,
          };
        } else {
          // Same turn - preserve user state and only sync server changes
          console.log('📝 Same turn, preserving user state');
          
          // Check if user has challenged (from server data)
          const userHasChallenged = syncState.turn_data.challenges.includes(user!.id);
          if (userHasChallenged !== hasChallenged) {
            setHasChallenged(userHasChallenged);
            localStateRef.current.hasChallenged = userHasChallenged;
            console.log('⚔️ Challenge state synced:', userHasChallenged);
          }
          
          // Check if user has submitted guess (from server data)
          const userHasSubmittedGuess = syncState.turn_data.guesses.some(guess => guess.player_id === user!.id);
          if (userHasSubmittedGuess !== hasSubmittedGuess) {
            setHasSubmittedGuess(userHasSubmittedGuess);
            localStateRef.current.hasSubmittedGuess = userHasSubmittedGuess;
            console.log('📝 Guess state synced:', userHasSubmittedGuess);
          }
          
          // Never clear text input - let user manage their own input
          console.log('🔒 Preserving user text input state');
        }
      }

      // Show voting modal when phase changes to voting (for all players)
      if (syncState.phase === 'voting' && gamePhase !== 'voting') {
        setShowVotingModal(true);
        console.log('🗳️ Voting phase detected, showing modal for all players');
      }

      // Also ensure voting modal is shown if we're in voting phase but modal isn't visible
      if (syncState.phase === 'voting' && !showVotingModal) {
        setShowVotingModal(true);
        console.log('🗳️ Forcing voting modal visibility for voting phase');
      }

      // Hide voting modal when phase changes away from voting
      if (syncState.phase !== 'voting' && gamePhase === 'voting') {
        setShowVotingModal(false);
        setVotes({});
        setHasVoted(false);
        console.log('🚫 Voting phase ended, hiding modal');
      }

      // Hide turn summary when phase changes away from turn_results
      if (syncState.phase !== 'turn_results' && gamePhase === 'turn_results') {
        setShowTurnSummary(false);
        setTurnResult(null);
        console.log('🚫 Turn results phase ended, hiding summary');
      }

      // Show turn summary when phase changes to turn_results
      if (syncState.phase === 'turn_results' && gamePhase !== 'turn_results') {
        console.log('📊 Turn results phase detected, showing summary');
        // For non-host players, show the turn summary modal
        if (!isHost && !showTurnSummary) {
          setShowTurnSummary(true);
          console.log('📊 Non-host showing turn summary modal');
        }
      }

      // Handle preparing_next_turn phase - hide turn summary for all players
      if (syncState.phase === 'preparing_next_turn') {
        console.log('🔄 Preparing next turn - hiding turn summary for all players');
        setShowTurnSummary(false);
        setTurnResult(null);
      }

      if (syncState.show_album_art !== undefined) {
        setShowAlbumArt(syncState.show_album_art);
      }

      setLastSyncTime(syncState.updated_at);
    } catch (error) {
      console.error('Error syncing game state:', error);
    }
  };

  const syncToDatabase = async (updates: Partial<GameSyncState>) => {
    if (!isHost) {
      console.log('🚫 Non-host attempted to sync - ignoring');
      return; // Only host can update sync state
    }
    
    try {
      console.log('📤 Host syncing to database:', updates);
      await gameSessionService.updateGameSyncState(gameSession.id, updates, user!.id);
    } catch (error) {
      console.error('Error syncing to database:', error);
    }
  };

  const handleTimerComplete = () => {
    switch (gamePhase) {
      case 'pre_game_countdown':
        startFirstTurn();
        break;
      case 'turn_countdown':
        startAudioPhase();
        break;
      case 'audio_playing':
        startGuessingPhase();
        break;
      case 'guessing':
        handleGuessingTimeUp();
        break;
      case 'voting':
        // Voting time expired - reject the answer automatically
        console.log('⏰ Voting time expired, rejecting answer');
        handleAnswerRejected();
        break;
      default:
        break;
    }
  };

  const startFirstTurn = () => {
    console.log('🎯 Starting first turn...');
    const attackerId = playerOrder[0];
    const defenderId = playerOrder[1];
    startNewTurn(attackerId, defenderId);
  };

  const startNewTurn = async (attackerId: string, defenderId: string) => {
    try {
      console.log('🆚 New turn:', attackerId, 'vs', defenderId);

      // Increment turn index
      setCurrentTurnIndex(prev => prev + 1);

      // Get attacker's songs
      const attackerSongs = await songStackService.getUserSongStack(attackerId, currentRoom!.id);
      if (attackerSongs.length === 0) {
        Alert.alert('No Songs', 'Attacker has no songs available!');
        return;
      }

      // Pick first song (FIFO)
      const currentSong = attackerSongs[0];

      const newTurnData: TurnData = {
        attackerId,
        defenderId,
        currentSong,
        guesses: [],
        challenges: [],
        votingResults: null,
        failedAttempts: 0, // Reset failed attempts for new turn
      };

      setTurnData(newTurnData);
      setGamePhase('turn_countdown');
      setTimeRemaining(3);
      setHasSubmittedGuess(false);
      setHasChallenged(false);
      setGuessText('');
      setShowAlbumArt(false); // Hide album art for new turn

      // Sync to database
      await syncToDatabase({
        phase: 'turn_countdown',
        time_remaining: 3,
        current_attacker_id: attackerId,
        current_defender_id: defenderId,
        current_song_data: currentSong,
        turn_data: newTurnData,
        show_album_art: false,
      });

      console.log('✅ Turn started with song:', currentSong.track_data.name);
    } catch (error) {
      console.error('Error starting new turn:', error);
      Alert.alert('Error', 'Failed to start new turn.');
    }
  };

  const startAudioPhase = () => {
    console.log('🎵 Starting audio phase...');
    setGamePhase('audio_playing');
    setTimeRemaining(15);
    
    // Sync to database
    syncToDatabase({
      phase: 'audio_playing',
      time_remaining: 15,
    });
    
    // All players should play audio, not just host
    console.log('🎵 All players will attempt to play audio');
    playAudio();
  };

  const startGuessingPhase = () => {
    console.log('💭 Starting guessing phase...');
    setGamePhase('guessing');
    setTimeRemaining(15);
    stopAudio();

    // Sync to database
    syncToDatabase({
      phase: 'guessing',
      time_remaining: 15,
    });
  };

  const handleGuessingTimeUp = () => {
    console.log('⏰ Guessing time up!');
    
    // Only host should handle automatic progression
    if (!isHost) {
      console.log('🚫 Non-host ignoring timer expiry');
      return;
    }
    
    // Check if there are any guesses submitted
    if (turnData && turnData.guesses.length > 0) {
      // Someone submitted a guess - start voting phase
      console.log('📝 Answer found during timeout, starting voting phase');
      setGamePhase('voting');
      setShowVotingModal(true);
      
      // Sync to database
      syncToDatabase({
        phase: 'voting',
        time_remaining: 30, // 30 seconds for voting
      });
    } else if (turnData) {
      // No answer submitted - automatically progress based on game state
      if (turnData.failedAttempts >= 3) {
        // Challenger failed after defender's 3 attempts - attacker loses
        console.log('💔 Challenger also failed, attacker loses automatically');
        handleAttackerLoses();
      } else {
        // Defender failed to submit answer - move to next attempt automatically
        console.log('💔 No answer submitted, moving to next attempt automatically');
        handleDefenderFailed();
      }
    }
  };

  // Host-only function to manually end the current turn
  const handleHostEndTurn = () => {
    if (!isHost || !turnData) return;
    
    Alert.alert(
      'End Turn',
      'Are you sure you want to end the current turn? The attacker will lose this turn.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Turn', 
          style: 'destructive',
          onPress: () => {
            console.log('🛑 Host manually ended turn');
            handleAttackerLoses();
          }
        }
      ]
    );
  };

  const submitGuess = async () => {
    if (!turnData || !guessText.trim() || hasSubmittedGuess) return;

    try {
      console.log('📝 Submitting guess:', guessText);
      setHasSubmittedGuess(true);
      localStateRef.current.hasSubmittedGuess = true;

      // Create new guess object
      const newGuess: GameGuess = {
        id: `guess-${Date.now()}-${user!.id}`,
        turn_id: 'current-turn',
        player_id: user!.id,
        guess_text: guessText.trim(),
        confidence_level: 'medium',
        submitted_at: new Date().toISOString(),
      };

      // Add to current guesses
      const updatedGuesses = [...turnData.guesses, newGuess];
      
      const updatedTurnData = {
        ...turnData,
        guesses: updatedGuesses,
      };

      // Update local state immediately
      setTurnData(updatedTurnData);

      // Only host can trigger voting phase
      if (isHost) {
        console.log('🗳️ Host: Guess submitted, starting voting phase for all players');
        setGamePhase('voting');
        setTimeRemaining(30);
        setShowVotingModal(true);
        
        // Sync to database for all players - both turn data and voting phase
        await syncToDatabase({
          phase: 'voting',
          time_remaining: 30,
          turn_data: updatedTurnData,
        });
      } else {
        console.log('📝 Non-host: Guess submitted, syncing turn data only');
        // Non-host just syncs the turn data, host will trigger voting phase
        await gameSessionService.updateGameSyncState(gameSession.id, {
          turn_data: updatedTurnData,
        }, user!.id);
      }

      console.log('✅ Guess submitted and voting phase started for all players');
      
    } catch (error) {
      console.error('Error submitting guess:', error);
      setHasSubmittedGuess(false);
      localStateRef.current.hasSubmittedGuess = false;
      Alert.alert('Error', 'Failed to submit guess.');
    }
  };

  const submitChallenge = async () => {
    if (!turnData || hasChallenged) return;

    // Additional check: prevent duplicate challenges by checking server data
    if (turnData.challenges.includes(user!.id)) {
      console.log('⚠️ User already challenged, preventing duplicate');
      setHasChallenged(true);
      return;
    }

    setHasChallenged(true);
    const updatedTurnData = {
      ...turnData,
      challenges: [...turnData.challenges, user!.id],
    };
    
    setTurnData(updatedTurnData);

    // Both host and non-host can update turn data with challenges
    try {
      await gameSessionService.updateGameSyncState(gameSession.id, {
        turn_data: updatedTurnData,
      }, user!.id);
      console.log('⚔️ Challenge submitted and synced by:', user!.id);
    } catch (error) {
      console.error('Error syncing challenge:', error);
      Alert.alert('Error', 'Failed to sync challenge.');
    }
  };

  const handleAttackerWins = () => {
    if (!turnData) return;
    
    console.log('🏆 Attacker wins! +1 point');
    setShowAlbumArt(true); // Reveal album art when someone wins
    console.log('🎨 Album art revealed for attacker win!');
    
    // Attacker gets +1 point
    updatePlayerScore(turnData.attackerId, 1);
    
    // Calculate next turn players
    const nextDefenderIndex = (playerOrder.indexOf(turnData.defenderId) + 1) % playerOrder.length;
    const nextDefender = playerOrder[nextDefenderIndex];
    const finalNextDefender = nextDefender === turnData.attackerId 
      ? playerOrder[(nextDefenderIndex + 1) % playerOrder.length]
      : nextDefender;
    
    const turnResultData = {
      winner: currentAttacker?.displayName || 'Attacker',
      winnerType: 'attacker' as const,
      reason: 'Defender failed to guess correctly',
      nextAttacker: turnData.attackerId,
      nextDefender: finalNextDefender,
    };
    
    // Show turn summary instead of auto-progressing
    setTurnResult(turnResultData);
    setShowTurnSummary(true);
    
    // Sync turn summary state to database for all players
    syncToDatabase({
      phase: 'turn_results',
      show_album_art: true,
    });
  };

  const handleDefenderWins = () => {
    if (!turnData) return;
    
    console.log('🛡️ Answer accepted! Showing results');
    setShowAlbumArt(true); // Reveal album art when someone wins
    console.log('🎨 Album art revealed for defender win!');
    
    // Don't update score here - it's already updated in checkVotingComplete
    
    // Calculate next turn players
    const guesser = turnData.guesses[turnData.guesses.length - 1]?.player_id;
    const guesserName = playerScores.find(p => p.userId === guesser)?.displayName || 'Player';
    
    const nextDefenderIndex = (playerOrder.indexOf(turnData.attackerId) + 1) % playerOrder.length;
    const nextDefender = playerOrder[nextDefenderIndex];
    const finalNextDefender = nextDefender === guesser 
      ? playerOrder[(nextDefenderIndex + 1) % playerOrder.length]
      : nextDefender;
    
    const turnResultData = {
      winner: guesserName,
      winnerType: 'defender' as const,
      reason: 'Answer accepted by voters',
      nextAttacker: guesser,
      nextDefender: finalNextDefender,
    };
    
    // Show turn summary instead of auto-progressing
    setTurnResult(turnResultData);
    setShowTurnSummary(true);
    
    // Sync turn summary state to database for all players
    syncToDatabase({
      phase: 'turn_results',
      show_album_art: true,
    });
  };

  const handleChallengerWins = (challengerId: string) => {
    if (!turnData) return;
    
    console.log('⚔️ Challenger wins! +1 point');
    setShowAlbumArt(true); // Reveal album art when someone wins
    console.log('🎨 Album art revealed for challenger win!');
    
    // Challenger gets +1 point
    updatePlayerScore(challengerId, 1);
    
    // Calculate next turn players
    const nextDefenderIndex = (playerOrder.indexOf(turnData.attackerId) + 1) % playerOrder.length;
    const nextDefender = playerOrder[nextDefenderIndex];
    const finalNextDefender = nextDefender === challengerId 
      ? playerOrder[(nextDefenderIndex + 1) % playerOrder.length]
      : nextDefender;
    
    const challengerName = playerScores.find(p => p.userId === challengerId)?.displayName || 'Challenger';
    const turnResultData = {
      winner: challengerName,
      winnerType: 'challenger' as const,
      reason: 'Challenger guessed correctly',
      nextAttacker: challengerId,
      nextDefender: finalNextDefender,
    };
    
    // Show turn summary instead of auto-progressing
    setTurnResult(turnResultData);
    setShowTurnSummary(true);
    
    // Sync turn summary state to database for all players
    syncToDatabase({
      phase: 'turn_results',
      show_album_art: true,
    });
  };

  const handleAttackerLoses = () => {
    if (!turnData) return;
    
    console.log('💔 Attacker loses! -1 point');
    
    // Attacker loses 1 point (can go negative)
    updatePlayerScore(turnData.attackerId, -1);
    
    // Calculate next turn players
    const nextAttackerIndex = (playerOrder.indexOf(turnData.attackerId) + 1) % playerOrder.length;
    const nextAttacker = playerOrder[nextAttackerIndex];
    const nextDefenderIndex = (nextAttackerIndex + 1) % playerOrder.length;
    const nextDefender = playerOrder[nextDefenderIndex];
    
    // Show turn summary instead of auto-progressing
    setTurnResult({
      winner: 'No one',
      winnerType: 'defender', // Just for typing, not really used
      reason: 'Attacker failed - no correct guesses',
      nextAttacker: nextAttacker,
      nextDefender: nextDefender,
    });
    setShowTurnSummary(true);
  };

  const updatePlayerScore = (userId: string, scoreChange: number) => {
    const updatedScores = playerScores.map(player => 
      player.userId === userId 
        ? { ...player, score: player.score + scoreChange } // Allow negative scores
        : player
    );
    
    setPlayerScores(updatedScores);
    
    // Sync to database
    syncToDatabase({
      player_scores: updatedScores,
    });
  };

  const playCountdownSound = async () => {
    try {
      // Create a simple beep sound using system sounds or a tone
      // For now, we'll use a simple system notification sound
      console.log('🔊 Playing countdown sound for:', timeRemaining);
      
      // You can replace this with an actual sound file later
      // const { sound } = await Audio.Sound.createAsync(require('../assets/sounds/beep.mp3'));
      // await sound.playAsync();
      
    } catch (error) {
      console.error('Error playing countdown sound:', error);
    }
  };

  const playAudio = async () => {
    try {
      console.log('🎵 Attempting to play audio...');
      console.log('Turn data exists:', !!turnData);
      console.log('Current song exists:', !!turnData?.currentSong);
      
      if (turnData?.currentSong) {
        console.log('🎵 Song details:');
        console.log('- Song name:', turnData.currentSong.track_data?.name || turnData.currentSong.name);
        console.log('- Artist:', turnData.currentSong.track_data?.artists?.[0]?.name || turnData.currentSong.artist);
        console.log('- Track data structure:', Object.keys(turnData.currentSong.track_data || {}));
        console.log('- Full song object keys:', Object.keys(turnData.currentSong));
        console.log('- Full song object:', JSON.stringify(turnData.currentSong, null, 2));
      }
      
      if (!turnData?.currentSong) {
        console.error('❌ No current song in turn data');
        return;
      }

      // Try multiple possible locations for preview URL
      const previewUrl = 
        turnData.currentSong.track_data?.preview_url || 
        turnData.currentSong.preview_url ||
        turnData.currentSong.track?.preview_url ||
        turnData.currentSong.spotify_track?.preview_url;
        
      console.log('🔗 Preview URL from track_data:', turnData.currentSong.track_data?.preview_url);
      console.log('🔗 Preview URL from root:', turnData.currentSong.preview_url);
      console.log('🔗 Preview URL from track:', turnData.currentSong.track?.preview_url);
      console.log('🔗 Preview URL from spotify_track:', turnData.currentSong.spotify_track?.preview_url);
      console.log('🔗 Final preview URL:', previewUrl);
      
      if (!previewUrl) {
        console.error('❌ No preview URL available for song:', turnData.currentSong.track_data?.name || turnData.currentSong.name);
        
        // Try to play a test bell sound instead
        console.log('🔔 Attempting to play test bell sound as fallback...');
        try {
          const testSoundUri = 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav';
          console.log('🔔 Creating test sound from:', testSoundUri);
          
          const { sound: testSound } = await Audio.Sound.createAsync(
            { uri: testSoundUri },
            { shouldPlay: true, volume: 0.5 }
          );
          
          setSound(testSound);
          setIsPlaying(true);
          console.log('✅ Test sound playing successfully');
          
          // Auto-stop after 3 seconds
          setTimeout(async () => {
            try {
              await testSound.stopAsync();
              await testSound.unloadAsync();
              setSound(null);
              setIsPlaying(false);
              console.log('🔔 Test sound stopped');
            } catch (e) {
              console.error('Error stopping test sound:', e);
            }
          }, 3000);
          
          return;
        } catch (testError) {
          console.error('❌ Test sound also failed:', testError);
        }
        
        // Show user-friendly message
        console.log('🎵 No audio available - continuing without sound');
        Alert.alert(
          'Audio Unavailable', 
          'This song does not have a preview available. The game will continue without audio.',
          [{ text: 'OK' }]
        );
        
        // Skip audio and go directly to guessing phase
        if (isHost) {
          console.log('⏭️ Skipping audio phase due to no preview');
          setTimeout(() => {
            startGuessingPhase();
          }, 1000);
        }
        return;
      }

      // Stop any existing audio first
      if (sound) {
        console.log('🛑 Stopping existing audio...');
        await stopAudio();
      }

      console.log('🎵 Creating audio from URL:', previewUrl);
      console.log('🎵 Playing song:', turnData.currentSong.track_data?.name || turnData.currentSong.name);

      // Try to set up audio mode for better compatibility
      try {
        console.log('🔧 Setting audio mode...');
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        console.log('✅ Audio mode set successfully');
      } catch (audioModeError) {
        console.warn('⚠️ Could not set audio mode (normal for web):', audioModeError);
      }

      console.log('🎵 Creating sound object...');
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: previewUrl },
        { shouldPlay: true, volume: 1.0 }
      );
      console.log('✅ Sound object created successfully');
      
      setSound(newSound);
      setIsPlaying(true);

      // Set up progress tracking
      newSound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded) {
          const progress = status.positionMillis / (status.durationMillis || 30000); // Default 30s if no duration
          setAudioProgress(progress || 0);
          
          // Log playback status periodically
          if (Math.floor(status.positionMillis / 1000) % 5 === 0) {
            console.log(`🎵 Audio progress: ${Math.floor(status.positionMillis / 1000)}s`);
          }
        }
        
        if (status.didJustFinish) {
          console.log('🎵 Audio finished playing');
          setIsPlaying(false);
          setAudioProgress(0);
        }
      });

      console.log('✅ Audio started successfully');

    } catch (error) {
      console.error('❌ Error playing audio:', error);
      console.error('❌ Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      
      Alert.alert(
        'Audio Error', 
        `Failed to play audio: ${error instanceof Error ? error.message : String(error)}. The game will continue.`,
        [{ text: 'OK' }]
      );
      setIsPlaying(false);
      
      // Continue with game flow even if audio fails
      if (isHost && gamePhase === 'audio_playing') {
        console.log('⏭️ Audio failed, moving to guessing phase');
        setTimeout(() => {
          startGuessingPhase();
        }, 2000);
      }
    }
  };

  const stopAudio = async () => {
    try {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
        setAudioProgress(0);
      }
    } catch (error) {
      console.error('Error stopping audio:', error);
    }
  };

  const cleanup = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (gameLoopRef.current) {
      clearInterval(gameLoopRef.current);
    }
    stopAudio();
  };

  const renderPreGameCountdown = () => (
    <View style={styles.countdownContainer}>
      <Text style={styles.countdownTitle}>Game Starting In</Text>
      <Text style={styles.countdownNumber}>{timeRemaining}</Text>
      <Text style={styles.countdownSubtitle}>Get ready to play!</Text>
    </View>
  );

  const renderGameHeader = () => (
    <View style={styles.gameHeader}>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      
      <View style={styles.gameInfo}>
        <Text style={styles.gameTitle}>Shotobump</Text>
        <Text style={styles.gamePhaseText}>
          {gamePhase === 'turn_countdown' && 'Turn Starting...'}
          {gamePhase === 'audio_playing' && '🎵 Listen Carefully'}
          {gamePhase === 'guessing' && '💭 Time to Guess'}
          {gamePhase === 'voting' && '🗳️ Voting Time'}
        </Text>
        {/* Audio info message */}
        {gamePhase === 'audio_playing' && !isPlaying && (
          <Text style={styles.audioInfoText}>
            💡 No audio? Choose songs with 🎵 in Song Stack
          </Text>
        )}
      </View>

      <View style={{ flexDirection: 'row' }}>
        {/* Test Audio Button - Available for all players */}
        <TouchableOpacity 
          style={[styles.endTurnButton, { marginRight: 8 }]}
          onPress={async () => {
            console.log('🧪 Manual audio test triggered by:', user?.display_name);
            await playAudio();
          }}
        >
          <Text style={styles.endTurnButtonText}>🎵</Text>
        </TouchableOpacity>
        
        {isHost && turnData && gamePhase !== 'pre_game_countdown' ? (
          <TouchableOpacity 
            style={styles.endTurnButton}
            onPress={handleHostEndTurn}
          >
            <Text style={styles.endTurnButtonText}>⏹</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.songsButton}
            onPress={() => navigation.navigate('SongStack')}
          >
            <Text style={styles.songsButtonText}>♪</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderPlayerScores = () => (
    <View style={styles.playersContainer}>
      <Text style={styles.playersTitle}>Players</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {playerScores.map((player) => (
          <View 
            key={player.userId} 
            style={[
              styles.playerCard,
              player.userId === turnData?.attackerId && styles.attackerCard,
              player.userId === turnData?.defenderId && styles.defenderCard,
            ]}
          >
            <Text style={styles.playerName}>{player.displayName}</Text>
            <Text style={styles.playerScore}>{player.score} pts</Text>
            {player.userId === turnData?.attackerId && (
              <Text style={styles.playerRole}>⚔️ Attacker</Text>
            )}
            {player.userId === turnData?.defenderId && (
              <Text style={styles.playerRole}>🛡️ Defender</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );

  const renderTurnInfo = () => {
    if (!turnData) return null;

    return (
      <View style={styles.turnContainer}>
        <View style={styles.turnHeader}>
          <Text style={styles.turnTitle}>Current Turn</Text>
          <Text style={styles.timer}>{timeRemaining}s</Text>
        </View>
        
        {turnData.currentSong && (
          <View style={styles.songContainer}>
            <View style={styles.albumArtContainer}>
              <Image 
                source={{ uri: turnData.currentSong.track_data.album.images[0]?.url }} 
                style={[styles.albumArt, !showAlbumArt && styles.blurredAlbumArt]} 
              />
              {!showAlbumArt && (
                <View style={styles.albumArtOverlay}>
                  <Text style={styles.albumArtHint}>🎵</Text>
                </View>
              )}
              {showAlbumArt && (
                <View style={styles.revealedOverlay}>
                  <Text style={styles.revealedText}>✨ REVEALED! ✨</Text>
                </View>
              )}
            </View>
            <View style={styles.songDetails}>
              <Text style={styles.songTitle}>Song by {currentAttacker?.displayName}</Text>
              {showAlbumArt && (
                <Text style={styles.songRevealedTitle}>
                  "{turnData.currentSong.track_data.name}"
                </Text>
              )}
              {gamePhase === 'audio_playing' && (
                <View style={styles.audioProgress}>
                  <View style={[styles.progressBar, { width: `${audioProgress * 100}%` }]} />
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderGuessingSection = () => {
    if (!turnData || gamePhase === 'pre_game_countdown' || gamePhase === 'turn_countdown') return null;

    const isDefender = user?.id === turnData.defenderId;
    const isAttacker = user?.id === turnData.attackerId;
    const canSubmitGuess = isDefender && !hasSubmittedGuess;
    const canChallenge = !isDefender && !isAttacker && !hasChallenged;

    if (isAttacker) {
      return (
        <View style={styles.guessingContainer}>
          <View style={styles.spectatorSection}>
            <Text style={styles.sectionTitle}>You're the Attacker</Text>
            <Text>Wait for the defender to guess your song!</Text>
            
            {turnData.challenges.length > 0 && (
              <View style={styles.challengersSection}>
                <Text style={styles.sectionTitle}>Challengers:</Text>
                {turnData.challenges.map((challengerId, index) => (
                  <Text key={challengerId} style={styles.challengerItem}>
                    ⚔️ {playerScores.find(p => p.userId === challengerId)?.displayName}
                  </Text>
                ))}
              </View>
            )}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.guessingContainer}>
        {/* Defender Section */}
        {isDefender && (
          <View style={styles.defenderSection}>
            <Text style={styles.sectionTitle}>Your Turn to Guess!</Text>
            
            <TextInput
              style={styles.guessInput}
              placeholder="Enter your guess..."
              value={guessText}
              onChangeText={(text) => {
                setGuessText(text);
                localStateRef.current.guessText = text;
                localStateRef.current.isTyping = text.length > 0;
              }}
              onFocus={() => {
                setIsTyping(true);
                localStateRef.current.isTyping = true;
              }}
              onBlur={() => {
                setIsTyping(false);
                localStateRef.current.isTyping = guessText.length > 0;
              }}
              editable={!hasSubmittedGuess}
              multiline={false}
              autoCapitalize="none"
              autoCorrect={false}
            />
            
            <TouchableOpacity
              style={[styles.submitButton, (!canSubmitGuess || !guessText.trim()) && styles.disabledButton]}
              onPress={submitGuess}
              disabled={!canSubmitGuess || !guessText.trim()}
            >
              <Text style={styles.submitButtonText}>
                {hasSubmittedGuess ? 'Guess Submitted!' : 'Submit Guess'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Spectator/Challenger Section */}
        {!isDefender && (
          <View style={styles.spectatorSection}>
            <Text style={styles.sectionTitle}>
              {gamePhase === 'audio_playing' ? 'Listen to the Song' : 'Guessing Phase'}
            </Text>
            <Text>
              {gamePhase === 'audio_playing' 
                ? 'The song is playing. You can challenge now!' 
                : `${currentDefender?.displayName} is guessing...`}
            </Text>
            
            {canChallenge && (
              <TouchableOpacity
                style={styles.challengeButton}
                onPress={submitChallenge}
              >
                <Text style={styles.challengeButtonText}>⚔️ Challenge</Text>
              </TouchableOpacity>
            )}
            
            {hasChallenged && (
              <Text style={styles.challengedText}>✅ You've challenged this turn!</Text>
            )}
          </View>
        )}

        {/* Show current guesses */}
        {turnData.guesses.length > 0 && (
          <View style={styles.guessesContainer}>
            <Text style={styles.guessesTitle}>Submitted Guesses:</Text>
            {turnData.guesses.map((guess, index) => {
              const guesser = playerScores.find(p => p.userId === guess.player_id);
              return (
                <View key={index} style={styles.guessItem}>
                  <Text style={styles.guessText}>"{guess.guess_text}"</Text>
                  <Text style={styles.guesser}>- {guesser?.displayName}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderVotingModal = () => {
    if (!turnData || !showVotingModal) return null;

    const guess = turnData.guesses[turnData.guesses.length - 1]; // Get the latest guess
    if (!guess) return null;

    const guesser = playerScores.find(p => p.userId === guess.player_id);
    const canVote = !hasVoted && user?.id !== guess.player_id; // Guesser cannot vote on own answer
    const isAttacker = user?.id === turnData.attackerId;

    return (
      <Modal
        visible={showVotingModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.votingModal}>
            <Text style={styles.votingTitle}>Vote on the Answer</Text>
            <Text style={styles.votingAnswer}>"{guess.guess_text}"</Text>
            <Text style={styles.votingBy}>by {guesser?.displayName}</Text>
            
            <Text style={styles.votingTimer}>
              Time remaining: {Math.max(0, timeRemaining)} seconds
            </Text>
            
            {canVote ? (
              <View style={styles.votingButtons}>
                <TouchableOpacity
                  style={[styles.voteButton, styles.acceptButton]}
                  onPress={() => submitVote('accept')}
                  disabled={hasVoted}
                >
                  <Text style={styles.voteButtonText}>
                    ✓ Accept ({Object.values(votes).filter(v => v === 'accept').length})
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.voteButton, styles.rejectButton]}
                  onPress={() => submitVote('reject')}
                  disabled={hasVoted}
                >
                  <Text style={styles.voteButtonText}>
                    ✗ Reject ({Object.values(votes).filter(v => v === 'reject').length})
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.waitingContainer}>
                <Text style={styles.waitingText}>
                  {hasVoted ? '✅ Vote submitted! Waiting for others...' : '⏳ You cannot vote on your own answer'}
                </Text>
              </View>
            )}
            
            <View style={styles.voteStatus}>
              <Text style={styles.voteStatusText}>
                Votes: {Object.keys(votes).length}/{playerScores.length - 1}
              </Text>
              <Text style={styles.voteRule}>
                {isAttacker ? 'Your vote is final!' : 
                 playerScores.length === 2 ? 'Attacker decides!' : 
                 'Need attacker OR 2+ players to accept'}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const submitVote = async (vote: string) => {
    if (!turnData || hasVoted) return;

    try {
      setHasVoted(true);
      
      const newVotes = {
        ...votes,
        [user!.id]: vote,
      };
      
      setVotes(newVotes);

      // Sync votes to database
      const updatedTurnData = {
        ...turnData,
        votingResults: {
          votes: newVotes,
          isCompleted: false,
        },
      };

      setTurnData(updatedTurnData);
      
      await syncToDatabase({
        turn_data: updatedTurnData,
      });

      console.log('🗳️ Vote submitted:', vote);
      
      // Check if voting is complete
      checkVotingComplete(newVotes);
      
    } catch (error) {
      console.error('Error submitting vote:', error);
      Alert.alert('Error', 'Failed to submit vote.');
    }
  };

  const checkVotingComplete = (currentVotes: {[key: string]: string}) => {
    if (!turnData) return;

    const totalPlayers = playerScores.length;
    const votesCount = Object.keys(currentVotes).length;
    
    // Get the latest guess that was submitted
    const guess = turnData.guesses[turnData.guesses.length - 1];
    if (!guess) return;

    // Count accept vs reject votes
    const acceptVotes = Object.values(currentVotes).filter(v => v === 'accept').length;
    const rejectVotes = Object.values(currentVotes).filter(v => v === 'reject').length;

    console.log('🗳️ Vote count:', { acceptVotes, rejectVotes, totalVotes: votesCount, totalPlayers });

    // Check if attacker accepted (auto-win)
    const attackerVote = currentVotes[turnData.attackerId];
    const attackerAccepted = attackerVote === 'accept';
    
    // Count non-guesser votes (guesser cannot vote on own answer)
    const eligibleVoters = playerScores.length - 1; // Everyone except the guesser
    const nonGuesserVotes = Object.entries(currentVotes)
      .filter(([userId]) => userId !== guess.player_id)
      .map(([, vote]) => vote);
    
    const nonGuesserAccepts = nonGuesserVotes.filter(vote => vote === 'accept').length;

    if (attackerAccepted) {
      console.log('🏆 Attacker accepted the answer!');
      // Award point to the guesser
      updatePlayerScore(guess.player_id, 1);
      handleDefenderWins();
    } else if (totalPlayers === 2) {
      // Special case for 2-player games: attacker's vote is final
      if (votesCount >= eligibleVoters) { // Attacker has voted
        const attackerRejected = attackerVote === 'reject';
        if (attackerRejected) {
          console.log('💔 2-player game: Attacker rejected the answer');
          handleAnswerRejected();
        }
      }
    } else if (nonGuesserAccepts >= 2) {
      console.log('🏆 2+ players accepted the answer!');
      // Award point to the guesser
      updatePlayerScore(guess.player_id, 1);
      handleDefenderWins();
    } else if (votesCount >= eligibleVoters) { // All eligible voters have voted
      console.log('💔 Answer rejected by majority');
      handleAnswerRejected();
    }
  };

  const handleAnswerRejected = () => {
    if (!turnData) return;
    
    console.log('❌ Answer rejected, continuing with attempts');
    
    // Reset voting state
    setVotes({});
    setHasVoted(false);
    setShowVotingModal(false);
    setGuessText('');
    setHasSubmittedGuess(false);
    
    // Continue with failed attempt logic
    handleDefenderFailed();
  };

  const handleDefenderFailed = () => {
    if (!turnData) return;

    const newFailedAttempts = turnData.failedAttempts + 1;
    console.log(`💔 Attempt ${newFailedAttempts}/3 failed`);
    
    if (newFailedAttempts >= 3) {
      // After 3 defender attempts, challenger gets 1 try
      if (turnData.challenges.length > 0) {
        const firstChallenger = turnData.challenges[0];
        console.log('⚔️ Switching to challenger after 3 defender attempts');
        
        const updatedTurnData = {
          ...turnData,
          defenderId: firstChallenger,
          failedAttempts: 3, // Keep track that defender already used 3 attempts
          guesses: [], // Reset guesses for challenger
          votingResults: null, // Reset voting results
        };
        
        setTurnData(updatedTurnData);
        
        // Reset local state for challenger
        setHasSubmittedGuess(false);
        setHasChallenged(false);
        setGuessText('');
        setVotes({});
        setHasVoted(false);
        setShowVotingModal(false);
        
        // Play audio again for challenger
        setGamePhase('turn_countdown');
        setTimeRemaining(3);
        
        // Sync to database
        syncToDatabase({
          phase: 'turn_countdown',
          time_remaining: 3,
          current_defender_id: firstChallenger,
          turn_data: updatedTurnData,
        });
      } else {
        // No challengers, attacker loses after 3 defender attempts
        console.log('💔 No challengers available, attacker loses');
        handleAttackerLoses();
      }
    } else {
      // Give defender another chance (attempts 2 and 3)
      console.log(`🔄 Giving defender another chance (attempt ${newFailedAttempts + 1}/3)`);
      
      const updatedTurnData = {
        ...turnData,
        failedAttempts: newFailedAttempts,
        guesses: [], // Reset guesses for next attempt
        votingResults: null, // Reset voting results
      };
      
      setTurnData(updatedTurnData);
      
      // Reset local state for next attempt
      setHasSubmittedGuess(false);
      setGuessText('');
      setVotes({});
      setHasVoted(false);
      setShowVotingModal(false);
      
      // Play audio again for defender
      setGamePhase('turn_countdown');
      setTimeRemaining(3);
      
      // Sync to database
      syncToDatabase({
        phase: 'turn_countdown',
        time_remaining: 3,
        turn_data: updatedTurnData,
      });
    }
  };

  const proceedToNextTurn = () => {
    if (!turnResult) return;
    
    console.log('▶️ Host proceeding to next turn');
    
    // Hide turn summary locally
    setShowTurnSummary(false);
    setTurnResult(null);
    
    // Sync that turn summary is being closed for all players
    // This ensures all players exit the turn summary modal
    syncToDatabase({
      phase: 'preparing_next_turn',
      show_turn_summary: false,
      turn_result: null,
    });
    
    // Small delay to ensure database sync, then start the next turn
    setTimeout(() => {
      startNewTurn(turnResult.nextAttacker, turnResult.nextDefender);
    }, 500);
  };

  const acceptGuessFromTurnState = async (guessId: string) => {
    if (!turnData || user?.id !== turnData.attackerId) {
      console.log('🚫 Only attacker can accept guesses');
      return;
    }

    try {
      console.log('🏆 Attacker accepting guess from turn state:', guessId);
      
      // Update voting results to show attacker accepted
      const updatedTurnData = {
        ...turnData,
        votingResults: {
          votes: { [user.id]: 'accept' },
          isCompleted: true,
        },
      };

      setTurnData(updatedTurnData);
      
      // Sync the acceptance
      await syncToDatabase({
        turn_data: updatedTurnData,
      });

      // Trigger defender wins
      handleDefenderWins();
      
    } catch (error) {
      console.error('Error accepting guess:', error);
      Alert.alert('Error', 'Failed to accept guess.');
    }
  };

  const renderTurnStateComponent = () => {
    if (!turnData || gamePhase === 'pre_game_countdown') return null;

    const currentAttemptNumber = turnData.failedAttempts + 1;
    const isDefenderTurn = currentAttemptNumber <= 3;
    const currentPlayer = isDefenderTurn ? 
      playerScores.find(p => p.userId === turnData.defenderId) :
      playerScores.find(p => p.userId === turnData.challenges[0]);

    return (
      <View style={styles.turnStateContainer}>
        <View style={styles.turnStateHeader}>
          <Text style={styles.turnStateTitle}>
            Turn {currentTurnIndex} • Attempt {currentAttemptNumber}/4
          </Text>
          <Text style={styles.turnStatePlayer}>
            {isDefenderTurn ? 'Defender' : 'Challenger'}: {currentPlayer?.displayName}
          </Text>
        </View>

        {/* Defender Guesses */}
        {turnData.guesses.length > 0 && (
          <View style={styles.guessesStateSection}>
            <Text style={styles.stateSubtitle}>Guesses:</Text>
            {turnData.guesses.map((guess, index) => {
              const guesser = playerScores.find(p => p.userId === guess.player_id);
              const isAttacker = guess.player_id === turnData.attackerId;
              return (
                <View key={index} style={styles.guessStateItem}>
                  <Text style={styles.guessStateText}>
                    "{guess.guess_text}" - {guesser?.displayName}
                  </Text>
                  {user?.id === turnData.attackerId && (
                    <TouchableOpacity
                      style={styles.acceptGuessButton}
                      onPress={() => {
                        console.log('🏆 Attacker accepting guess from turn state:', guess.id);
                        acceptGuessFromTurnState(guess.id);
                      }}
                    >
                      <Text style={styles.acceptGuessText}>✓ Accept</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Challengers */}
        {turnData.challenges.length > 0 && (
          <View style={styles.challengersStateSection}>
            <Text style={styles.stateSubtitle}>Challengers:</Text>
            <View style={styles.challengersList}>
              {turnData.challenges.map((challengerId, index) => {
                const challenger = playerScores.find(p => p.userId === challengerId);
                return (
                  <Text key={index} style={styles.challengerStateText}>
                    ⚔️ {challenger?.displayName}
                  </Text>
                );
              })}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#D2691E', '#FF6347', '#FF8C00']}
        style={styles.gradient}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
        >
          {gamePhase === 'pre_game_countdown' && renderPreGameCountdown()}
          
          {gamePhase !== 'pre_game_countdown' && (
            <>
              {renderGameHeader()}
              {renderPlayerScores()}
              {renderTurnInfo()}
              {renderGuessingSection()}
              {renderTurnStateComponent()}
            </>
          )}
        </ScrollView>
      </LinearGradient>

      {/* Voting Modal */}
      {renderVotingModal()}

      {/* Turn Summary Modal */}
      <Modal
        visible={showTurnSummary}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.turnSummaryModal}>
            <Text style={styles.summaryTitle}>Turn Complete!</Text>
            
            {/* Winner Section */}
            <View style={styles.winnerSection}>
              <Text style={styles.winnerText}>🏆 Winner: {turnResult?.winner}</Text>
              <Text style={styles.reasonText}>{turnResult?.reason}</Text>
            </View>
            
            {/* Turn Details */}
            <View style={styles.turnDetails}>
              <Text style={styles.detailsTitle}>Turn Summary:</Text>
              
                             {/* Show song info with album art */}
               {turnData?.currentSong && (
                 <View style={styles.summarySongInfo}>
                   <View style={styles.summarySongContainer}>
                     <Image 
                       source={{ uri: turnData.currentSong.track_data.album?.images?.[0]?.url }} 
                       style={styles.summaryAlbumArt}
                     />
                     <View style={styles.summarySongDetails}>
                       <Text style={styles.summarySongTitle}>{turnData.currentSong.track_data.name}</Text>
                       <Text style={styles.summaryArtistText}>by {turnData.currentSong.track_data.artists?.[0]?.name}</Text>
                       <Text style={styles.summaryAlbumText}>{turnData.currentSong.track_data.album?.name}</Text>
                     </View>
                   </View>
                 </View>
               )}
              
              {/* Show all guesses */}
              {turnData?.guesses && turnData.guesses.length > 0 && (
                <View style={styles.guessesSection}>
                  <Text style={styles.sectionTitle}>Answers Submitted:</Text>
                  {turnData.guesses.map((guess, index) => {
                    const player = playerScores.find(p => p.userId === guess.player_id);
                    return (
                      <Text key={index} style={styles.guessItem}>
                        • {player?.displayName || 'Unknown Player'}: "{guess.guess_text}"
                      </Text>
                    );
                  })}
                </View>
              )}
              
              {/* Show challengers */}
              {turnData?.challenges && turnData.challenges.length > 0 && (
                <View style={styles.challengersSection}>
                  <Text style={styles.sectionTitle}>Challengers:</Text>
                  {turnData.challenges.map((challengerId, index) => {
                    const challenger = playerScores.find(p => p.userId === challengerId);
                    return (
                      <Text key={index} style={styles.challengerItem}>
                        • {challenger?.displayName || 'Unknown Player'}
                      </Text>
                    );
                  })}
                </View>
              )}
              
              {/* Show next turn info */}
              <View style={styles.nextTurnSection}>
                <Text style={styles.sectionTitle}>Next Turn:</Text>
                <Text style={styles.nextTurnText}>
                  Attacker: {playerScores.find(p => p.userId === turnResult?.nextAttacker)?.displayName}
                </Text>
                <Text style={styles.nextTurnText}>
                  Defender: {playerScores.find(p => p.userId === turnResult?.nextDefender)?.displayName}
                </Text>
              </View>
            </View>
            
            {/* Host controls */}
            {isHost && (
              <TouchableOpacity
                style={styles.nextTurnButton}
                onPress={proceedToNextTurn}
              >
                <Text style={styles.nextTurnButtonText}>Continue to Next Turn →</Text>
              </TouchableOpacity>
            )}
            
            {!isHost && (
              <Text style={styles.waitingText}>Waiting for host to continue...</Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  countdownContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F5E6D3',
    marginBottom: 15,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  countdownNumber: {
    fontSize: 100,
    fontWeight: 'bold',
    color: '#F5E6D3',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 6,
  },
  countdownSubtitle: {
    fontSize: 18,
    color: '#8B4B9B',
    marginTop: 15,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    borderBottomWidth: 3,
    borderBottomColor: '#F5E6D3',
    borderRadius: 20,
    marginHorizontal: 10,
    marginTop: 5,
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    backgroundColor: '#8B4B9B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F5E6D3',
    borderRadius: 20,
  },
  backButtonText: {
    color: '#F5E6D3',
    fontSize: 22,
    fontWeight: 'bold',
  },
  gameInfo: {
    flex: 1,
    alignItems: 'center',
  },
  gameTitle: {
    color: '#F5E6D3',
    fontSize: 20,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  gamePhaseText: {
    color: '#F5E6D3',
    fontSize: 14,
    marginTop: 2,
    fontWeight: '600',
    opacity: 0.9,
  },
  songsButton: {
    width: 40,
    height: 40,
    backgroundColor: '#8B4B9B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F5E6D3',
    borderRadius: 20,
  },
  songsButtonText: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
  },
  endTurnButton: {
    width: 40,
    height: 40,
    backgroundColor: '#DC143C',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F5E6D3',
    borderRadius: 20,
  },
  endTurnButtonText: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playersContainer: {
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  playersTitle: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  playerCard: {
    backgroundColor: 'rgba(245, 230, 211, 0.95)',
    padding: 12,
    borderRadius: 20,
    marginRight: 12,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#8B4B9B',
  },
  attackerCard: {
    backgroundColor: 'rgba(220, 20, 60, 0.9)',
    borderColor: '#F5E6D3',
  },
  defenderCard: {
    backgroundColor: 'rgba(139, 75, 155, 0.9)',
    borderColor: '#F5E6D3',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  playerScore: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  playerRole: {
    fontSize: 10,
    color: '#333',
    marginTop: 4,
  },
  turnContainer: {
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  turnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  turnTitle: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  timer: {
    color: '#F5E6D3',
    fontSize: 24,
    fontWeight: 'bold',
    backgroundColor: 'rgba(139, 75, 155, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#F5E6D3',
  },
  songInfo: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 230, 211, 0.95)',
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#8B4B9B',
  },
  songContainer: {
    backgroundColor: 'rgba(139, 75, 155, 0.6)',
    padding: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  albumArtContainer: {
    position: 'relative',
    marginRight: 16,
  },
  albumArt: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  blurredAlbumArt: {
    opacity: 0.3,
  },
  albumArtOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  albumArtHint: {
    fontSize: 24,
    color: '#fff',
  },
  revealedOverlay: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    backgroundColor: 'rgba(29, 185, 84, 0.9)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  revealedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  songDetails: {
    flex: 1,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  songRevealedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1DB954',
    marginBottom: 4,
  },
  audioProgress: {
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#1DB954',
  },
  guessingContainer: {
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  defenderSection: {
    backgroundColor: 'rgba(245, 230, 211, 0.95)',
    padding: 15,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#8B4B9B',
  },
  spectatorSection: {
    backgroundColor: 'rgba(245, 230, 211, 0.95)',
    padding: 15,
    borderRadius: 20,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#8B4B9B',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  guessInput: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 15,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#8B4B9B',
  },
  submitButton: {
    backgroundColor: '#8B4B9B',
    padding: 12,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  disabledButton: {
    backgroundColor: '#666',
    borderColor: '#999',
  },
  submitButtonText: {
    color: '#F5E6D3',
    fontSize: 16,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  challengeButton: {
    backgroundColor: '#DC143C',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  challengeButtonText: {
    color: '#F5E6D3',
    fontSize: 16,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  challengedText: {
    color: '#8B4B9B',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
  },
  guessesContainer: {
    backgroundColor: 'rgba(245, 230, 211, 0.95)',
    padding: 16,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#8B4B9B',
  },
  guessesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  guessItem: {
    color: '#000',
    fontSize: 14,
    marginBottom: 4,
  },
  guessText: {
    fontSize: 18,
    color: '#000',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  guesser: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  votingModal: {
    backgroundColor: '#F5E6D3',
    padding: 20,
    borderRadius: 20,
    width: '90%',
    maxHeight: '70%',
    borderWidth: 4,
    borderColor: '#8B4B9B',
  },
  votingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  votingAnswer: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  votingBy: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  votingTimer: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  votingButtons: {
    marginBottom: 20,
  },
  voteButton: {
    backgroundColor: '#8B4B9B',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  acceptButton: {
    backgroundColor: '#32CD32',
  },
  rejectButton: {
    backgroundColor: '#DC143C',
  },
  voteButtonText: {
    color: '#F5E6D3',
    fontSize: 16,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  votedText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
  },
  turnSummaryModal: {
    backgroundColor: '#F5E6D3',
    padding: 20,
    borderRadius: 20,
    width: '90%',
    maxHeight: '70%',
    borderWidth: 4,
    borderColor: '#8B4B9B',
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  winnerSection: {
    marginBottom: 16,
  },
  winnerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 14,
    color: '#666',
  },
  turnDetails: {
    marginBottom: 20,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  summarySongInfo: {
    marginBottom: 16,
  },
  summarySongContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 75, 155, 0.1)',
    padding: 12,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#8B4B9B',
  },
  summaryAlbumArt: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#8B4B9B',
  },
  summarySongDetails: {
    flex: 1,
  },
  summarySongTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  summaryArtistText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  summaryAlbumText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  guessesSection: {
    marginBottom: 16,
  },
  challengersSection: {
    marginBottom: 16,
  },
  challengerItem: {
    color: '#000',
    fontSize: 14,
    marginBottom: 4,
  },
  nextTurnSection: {
    marginBottom: 16,
  },
  nextTurnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  nextTurnButton: {
    backgroundColor: '#8B4B9B',
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  nextTurnButtonText: {
    color: '#F5E6D3',
    fontSize: 16,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  waitingText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  turnStateContainer: {
    backgroundColor: 'rgba(245, 230, 211, 0.95)',
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 3,
    borderTopColor: '#8B4B9B',
  },
  turnStateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  turnStateTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  turnStatePlayer: {
    fontSize: 14,
    color: '#666',
  },
  guessesStateSection: {
    marginBottom: 12,
  },
  stateSubtitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  guessStateItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  guessStateText: {
    flex: 1,
    color: '#000',
    fontSize: 12,
  },
  acceptGuessButton: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  acceptGuessText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  challengersStateSection: {
    marginBottom: 8,
  },
  challengersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  challengerStateText: {
    color: '#000',
    fontSize: 12,
    marginRight: 12,
    marginBottom: 4,
  },
  waitingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voteStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  voteStatusText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  voteRule: {
    fontSize: 12,
    color: '#666',
  },
  audioInfoText: {
    color: '#F5E6D3',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});

export default GameplayScreen; 