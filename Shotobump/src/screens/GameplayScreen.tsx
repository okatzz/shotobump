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
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useAuth } from '../contexts/AuthContext';
import { useRoom } from '../contexts/RoomContext';
import { GameSessionService, GameSession, GameTurn, GameGuess, GameSyncState, GamePhase } from '../services/gameSessionService';
import { SongStackService } from '../services/songStackService';
import { SpotifyService } from '../services/spotify';

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
  currentGuesser?: string; // Who is currently guessing (defender or challenger)
  isInChallengerPhase: boolean; // True when challenger is guessing
}

// Get device dimensions for responsive design
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380 || screenHeight < 700;
const isLargeDevice = screenWidth > 500;

// Responsive font size function
const getResponsiveFontSize = (baseSize: number) => {
  if (isSmallDevice) return baseSize * 0.8;
  if (isLargeDevice) return baseSize * 1.1;
  return baseSize;
};

const GameplayScreen: React.FC<GameplayScreenProps> = ({ navigation, route }) => {
  const { user, isPremium } = useAuth();
  const { currentRoom, roomMembers, selectedSpotifyDeviceId } = useRoom();
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
  const spotifyService = SpotifyService.getInstance();

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
        
        // ENHANCED: Check for new guesses on every timer tick during active phases
        if (gamePhase === 'guessing' || gamePhase === 'audio_playing' || gamePhase === 'turn_results') {
          checkForNewGuesses();
        }
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

  // Removed the useEffect that was causing voting modal to reappear
  // The sync logic already handles showing/hiding the voting modal properly

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
      
              // ENHANCED: Additional host-specific guess detection
        if (isHost && (gamePhase === 'guessing' || gamePhase === 'audio_playing' || gamePhase === 'turn_results')) {
          await checkForNewGuesses();
        }
    }, 1000); // Sync every second for real-time experience
  };

  const checkForNewGuesses = async () => {
    try {
      const latestSyncState = await gameSessionService.getGameSyncState(gameSession.id);
      if (latestSyncState?.turn_data) {
        const serverGuessCount = latestSyncState.turn_data.guesses?.length || 0;
        const localGuessCount = turnData?.guesses?.length || 0;
        
        console.log('🔍 HOST GUESS CHECK:', {
          serverGuesses: serverGuessCount,
          localGuesses: localGuessCount,
          serverPhase: latestSyncState.phase,
          localPhase: gamePhase,
          shouldTriggerVoting: serverGuessCount > localGuessCount && serverGuessCount > 0
        });
        
        if (serverGuessCount > localGuessCount && serverGuessCount > 0) {
          console.log('🚨 HOST DETECTED NEW GUESS! Triggering voting immediately');
          
          // Check if this is a challenger guess
          if (latestSyncState.turn_data.isInChallengerPhase) {
            console.log('⚔️ CHALLENGER GUESS DETECTED in checkForNewGuesses!');
          }
          
          // Update local turn data
          const updatedTurnData = {
            ...turnData!,
            guesses: latestSyncState.turn_data.guesses,
            isInChallengerPhase: latestSyncState.turn_data.isInChallengerPhase || false,
            currentGuesser: latestSyncState.turn_data.currentGuesser || latestSyncState.turn_data.defenderId,
          };
          setTurnData(updatedTurnData);
          
          // Trigger voting
          setGamePhase('voting');
          setTimeRemaining(30);
          setShowVotingModal(true);
          
          // Sync voting phase to database
          await syncToDatabase({
            phase: 'voting',
            time_remaining: 30,
          });
        }
      }
    } catch (error) {
      console.error('Error checking for new guesses:', error);
    }
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
        // Still log this for debugging
        console.log('🔄 Skipping sync - same timestamp:', syncState.updated_at);
        return;
      }

      // Don't sync if this update came from the current user (avoid loops)
      if (syncState.updated_by === user?.id) {
        setLastSyncTime(syncState.updated_at);
        return;
      }

      // ENHANCED: Always log sync attempts for debugging
      console.log('🔄 Sync attempt:', {
        fromUser: syncState.updated_by,
        currentUser: user?.id,
        isHost,
        serverPhase: syncState.phase,
        localPhase: gamePhase,
        serverTime: syncState.time_remaining,
        localTime: timeRemaining,
        hasTurnData: !!syncState.turn_data,
        turnDataGuesses: syncState.turn_data?.guesses?.length || 0,
        localGuesses: turnData?.guesses?.length || 0
      });

      console.log('🔄 Syncing game state from:', syncState.updated_by, 'Phase:', syncState.phase, 'Time:', syncState.time_remaining);
      console.log('🎮 Player info:', { userId: user?.id, isHost, displayName: user?.display_name });

      // CRITICAL: Handle phase desync issues - force sync if phases are drastically different
      if ((syncState.phase === 'voting' || syncState.phase === 'turn_results') && 
          (gamePhase === 'pre_game_countdown' || gamePhase === 'turn_countdown')) {
        console.log('🚨 CRITICAL PHASE DESYNC DETECTED! Server:', syncState.phase, 'Local:', gamePhase);
        console.log('🚨 Force syncing to server phase immediately');
        setGamePhase(syncState.phase);
        setTimeRemaining(syncState.time_remaining);
        
        // If it's voting phase, make sure to show the modal
        if (syncState.phase === 'voting') {
          setShowVotingModal(true);
        }
        
        // SPECIAL CASE: If server is in turn_results but there are challenger guesses, force voting
        if (syncState.phase === 'turn_results' && isHost && 
            syncState.turn_data?.isInChallengerPhase && 
            syncState.turn_data?.guesses?.length > 0) {
          console.log('🚨 CRITICAL: Challenger guess stuck in turn_results! Force voting now');
          setGamePhase('voting');
          setTimeRemaining(30);
          setShowVotingModal(true);
          
          // Sync voting phase to database
          syncToDatabase({
            phase: 'voting',
            time_remaining: 30,
          });
        }
      }

      // Store previous phase to detect changes
      const previousPhase = gamePhase;
      const previousGuessCount = turnData?.guesses?.length || 0;

      // Update local state with synced data - FORCE UPDATE for non-host players
      if (syncState.phase !== gamePhase) {
        console.log('📱 Phase changing from:', gamePhase, 'to:', syncState.phase);
        console.log('🔧 FORCING phase update for player:', user?.display_name);
        
        // Use callback to ensure phase update is applied immediately
        setGamePhase(prevPhase => {
          console.log('📱 Phase update callback: from', prevPhase, 'to', syncState.phase);
          return syncState.phase;
        });
        
        // Trigger audio for non-host players ONLY when phase first changes to audio_playing
        if (syncState.phase === 'audio_playing' && previousPhase !== 'audio_playing' && !isHost) {
          console.log('🎵 Non-host detected NEW audio phase, starting audio playback');
          playAudio();
        }
      }
      
      // AGGRESSIVE PHASE SYNC: Force all players to match server phase
      if (syncState.phase !== gamePhase) {
        console.log('🚨 AGGRESSIVE PHASE SYNC! Local:', gamePhase, 'Server:', syncState.phase);
        console.log('🚨 Player:', user?.display_name, 'Host:', isHost);
        
        // Use callback to ensure phase update is applied immediately
        setGamePhase(prevPhase => {
          console.log('🚨 Aggressive phase update callback: from', prevPhase, 'to', syncState.phase);
          return syncState.phase;
        });
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
        
        // Check if new guesses were added (for voting trigger)
        const newGuessCount = syncState.turn_data.guesses?.length || 0;
        const guessesAdded = newGuessCount > previousGuessCount;
        
        console.log('🔍 GUESS CHECK:', {
          previousGuessCount,
          newGuessCount,
          guessesAdded,
          syncPhase: syncState.phase,
          localPhase: gamePhase,
          isHost,
          hasGuesses: newGuessCount > 0
        });
        
        // Update turn data - ensure backward compatibility with new properties
        if (syncState.turn_data) {
          const updatedTurnData: TurnData = {
            ...syncState.turn_data,
            currentGuesser: syncState.turn_data.currentGuesser || syncState.turn_data.defenderId,
            isInChallengerPhase: syncState.turn_data.isInChallengerPhase || false,
          };
          
          console.log('🔄 Updating turn data with', updatedTurnData.guesses.length, 'guesses');
          console.log('🔄 Is host:', isHost, 'Current phase:', gamePhase);
          console.log('🔄 Previous guess count:', previousGuessCount, 'New guess count:', newGuessCount);
          console.log('🔄 Guesses added:', guessesAdded, 'Sync phase:', syncState.phase);
          
          setTurnData(updatedTurnData);
          
          // Sync voting state if available
          if (syncState.turn_data.votingResults?.votes) {
            const serverVotes = syncState.turn_data.votingResults.votes;
            setVotes(serverVotes);
            
            // Check if current user has voted
            const userHasVoted = serverVotes[user!.id] !== undefined;
            setHasVoted(userHasVoted);
            
            console.log('🗳️ Synced voting state:', {
              serverVotes,
              userHasVoted,
              currentUserVote: serverVotes[user!.id]
            });
          }
        }
        
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

        // If new guesses were added and we're not in voting phase yet, trigger voting for all players
        if (guessesAdded && syncState.phase !== 'voting' && newGuessCount > 0) {
          console.log('🗳️ NEW GUESS DETECTED! All players should see voting soon');
          console.log('🎯 Guess count went from', previousGuessCount, 'to', newGuessCount);
          console.log('🎯 Current sync phase:', syncState.phase, 'Is host:', isHost);
          console.log('🎯 Local game phase:', gamePhase);
          
          // Host should immediately trigger voting when detecting new guesses
          if (isHost && (syncState.phase === 'guessing' || syncState.phase === 'audio_playing' || syncState.phase === 'turn_results')) {
            console.log('🚨 HOST TRIGGERING VOTING PHASE NOW!');
            console.log('🎯 Sync phase:', syncState.phase, 'Host:', isHost);
            
            // Check if this is a challenger guess (in turn_results phase)
            if (syncState.phase === 'turn_results' && syncState.turn_data?.isInChallengerPhase) {
              console.log('⚔️ CHALLENGER GUESS DETECTED! Triggering voting for challenger answer');
            }
            
            setGamePhase('voting');
            setTimeRemaining(30);
            setShowVotingModal(true);
            
            // Sync voting phase to database
            syncToDatabase({
              phase: 'voting',
              time_remaining: 30,
            });
          } else if (isHost) {
            console.log('🚫 Host NOT triggering voting - phase check failed');
            console.log('🚫 Sync phase:', syncState.phase, 'Expected: guessing, audio_playing, or turn_results (for challenger)');
          } else {
            console.log('🚫 Non-host detected guess - waiting for host to trigger voting');
          }
        }
        
        // ADDITIONAL CHECK: If host detects ANY guesses during active phases, trigger voting
        // This is a backup in case the guess count change detection misses something
        if (isHost && newGuessCount > 0 && 
            (syncState.phase === 'audio_playing' || syncState.phase === 'guessing' || syncState.phase === 'turn_results' ||
             gamePhase === 'audio_playing' || gamePhase === 'guessing' || gamePhase === 'turn_results')) {
          console.log('🚨 BACKUP GUESS DETECTION! Host found', newGuessCount, 'guesses during', syncState.phase);
          console.log('🚨 Host info:', { isHost, newGuessCount, syncPhase: syncState.phase, localPhase: gamePhase });
          console.log('🚨 Triggering voting phase as backup measure');
          
          setGamePhase('voting');
          setTimeRemaining(30);
          setShowVotingModal(true);
          
          // Sync voting phase to database
          syncToDatabase({
            phase: 'voting',
            time_remaining: 30,
          });
        }
        
        // ULTRA AGGRESSIVE CHECK: Force voting if host sees guesses regardless of phase
        // But allow turn_results if it's a challenger phase (they need to vote on challenger's guess)
        if (isHost && newGuessCount > 0 && syncState.phase !== 'voting') {
          // Allow turn_results phase if it's challenger phase
          const isValidTurnResults = syncState.phase === 'turn_results' && syncState.turn_data?.isInChallengerPhase;
          
          if (syncState.phase !== 'turn_results' || isValidTurnResults) {
            console.log('🚨🚨 ULTRA AGGRESSIVE HOST CHECK! Forcing voting for', newGuessCount, 'guesses');
            console.log('🚨🚨 Current phase:', syncState.phase, 'Host status:', isHost);
            console.log('🚨🚨 Is challenger phase:', syncState.turn_data?.isInChallengerPhase);
            
            setGamePhase('voting');
            setTimeRemaining(30);
            setShowVotingModal(true);
            
            // Sync voting phase to database
            syncToDatabase({
              phase: 'voting',
              time_remaining: 30,
            });
          }
        }
      }

      // Show voting modal when phase changes to voting (for all players)
      if (syncState.phase === 'voting' && previousPhase !== 'voting') {
        setShowVotingModal(true);
        console.log('🗳️ Voting phase detected, showing modal for all players');
        
        // Reset local voting state for new voting phase
        console.log('🗳️ Resetting voting state for new voting phase');
        setHasVoted(false);
      }

      // Hide voting modal when phase changes away from voting
      if (syncState.phase !== 'voting' && previousPhase === 'voting') {
        console.log('🚫 Voting phase ended, hiding modal');
        setShowVotingModal(false);
        setVotes({});
        setHasVoted(false);
      }

      // Hide turn summary when phase changes away from turn_results
      if (syncState.phase !== 'turn_results' && previousPhase === 'turn_results') {
        setShowTurnSummary(false);
        setTurnResult(null);
        console.log('🚫 Turn results phase ended, hiding summary');
      }

      // Show turn summary when phase changes to turn_results (for non-host only, host already has it)
      if (syncState.phase === 'turn_results' && previousPhase !== 'turn_results' && !isHost) {
        console.log('📊 Turn results phase detected for non-host, showing summary');
        console.log('📊 Current sync state turn_data:', syncState.turn_data);
        
        // Create turn result data for non-host players based on the current turn data
        if (syncState.turn_data && playerScores.length > 0) {
          const currentTurnData = syncState.turn_data;
          
          // Determine winner based on voting results or other indicators
          let winner = 'Unknown';
          let reason = 'Turn completed';
          let winnerType: 'attacker' | 'defender' | 'challenger' = 'defender';
          
          if (currentTurnData.votingResults?.isCompleted) {
            // Someone won through voting
            const lastGuess = currentTurnData.guesses[currentTurnData.guesses.length - 1];
            if (lastGuess) {
              const guesser = playerScores.find(p => p.userId === lastGuess.player_id);
              winner = guesser?.displayName || 'Player';
              reason = 'Answer accepted by voters';
              winnerType = currentTurnData.isInChallengerPhase ? 'challenger' : 'defender';
            }
          }
          
          // Calculate next turn players (simple rotation)
          const currentAttackerIndex = playerOrder.indexOf(currentTurnData.attackerId);
          const nextAttackerIndex = (currentAttackerIndex + 1) % playerOrder.length;
          const nextAttacker = playerOrder[nextAttackerIndex];
          const nextDefenderIndex = (nextAttackerIndex + 1) % playerOrder.length;
          const nextDefender = playerOrder[nextDefenderIndex];
          
          const nonHostTurnResult = {
            winner,
            winnerType,
            reason,
            nextAttacker,
            nextDefender,
          };
          
          console.log('📊 Non-host turn result created:', nonHostTurnResult);
          setTurnResult(nonHostTurnResult);
        }
        
        setShowTurnSummary(true);
        console.log('📊 Non-host showing turn summary modal');
      }

      // Handle turn_countdown phase - this indicates a new turn is starting
      if (syncState.phase === 'turn_countdown' && previousPhase !== 'turn_countdown') {
        console.log('🔄 New turn starting - stopping audio and clearing all state for all players');
        
        // Stop any audio playing from the previous turn
        stopAudio();
        
        // Clear all UI state for the new turn
        setShowTurnSummary(false);
        setTurnResult(null);
        setShowVotingModal(false);
        setVotes({});
        setHasVoted(false);
        setShowAlbumArt(false);
        
        // Reset guess state for the new turn
        setHasSubmittedGuess(false);
        setHasChallenged(false);
        setGuessText('');
        setIsTyping(false);
        
        console.log('✅ All players synchronized for new turn');
      }

      if (syncState.show_album_art !== undefined) {
        setShowAlbumArt(syncState.show_album_art);
      }

      setLastSyncTime(syncState.updated_at);
    } catch (error) {
      console.error('Error syncing game state:', error);
      // Don't let sync errors break the game loop
      console.log('🔄 Sync error occurred, but continuing game loop');
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
        // Check if guesses were submitted during audio phase before transitioning
        if (turnData && turnData.guesses.length > 0) {
          console.log('📝 Guesses submitted during audio phase, going directly to voting');
          setGamePhase('voting');
          setTimeRemaining(30);
          setShowVotingModal(true);
          stopAudio();
          
          // Only host syncs to database
          if (isHost) {
            syncToDatabase({
              phase: 'voting',
              time_remaining: 30,
            });
          }
        } else {
          startGuessingPhase();
        }
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

      if (!currentRoom) {
        throw new Error('No current room available');
      }

      // Increment turn index
      setCurrentTurnIndex(prev => prev + 1);
      setCurrentAttempt(1); // Reset to attempt 1

      // Get attacker's songs
      const attackerSongs = await songStackService.getUserSongStack(attackerId, currentRoom.id);
      if (attackerSongs.length === 0) {
        console.log('❌ Attacker has no songs available!');
        const attackerName = playerScores.find(p => p.userId === attackerId)?.displayName || 'Attacker';
        
        // Use Promise-based alert to handle async properly
        return new Promise<void>((resolve, reject) => {
          Alert.alert(
            'No Songs Available', 
            `${attackerName} has no songs in their stack! The game cannot continue.`,
            [
              {
                text: 'End Game',
                style: 'destructive',
                onPress: () => {
                  navigation.goBack();
                  reject(new Error('Game ended - no songs available'));
                }
              },
              {
                text: 'Skip Turn',
                                    onPress: async () => {
                      try {
                        // Check if any players have songs before skipping
                        let foundPlayerWithSongs = false;
                        for (const playerId of playerOrder) {
                          const playerSongs = await songStackService.getUserSongStack(playerId, currentRoom.id);
                          if (playerSongs.length > 0) {
                            foundPlayerWithSongs = true;
                            break;
                          }
                        }
                        
                        if (!foundPlayerWithSongs) {
                          Alert.alert('No Songs Available', 'None of the players have songs in their stack! Please add songs before continuing.');
                          reject(new Error('No players have songs available'));
                          return;
                        }
                        
                        // Skip to next attacker
                        const nextAttackerIndex = (playerOrder.indexOf(attackerId) + 1) % playerOrder.length;
                        const nextAttacker = playerOrder[nextAttackerIndex];
                        const nextDefenderIndex = (nextAttackerIndex + 1) % playerOrder.length;
                        const nextDefender = playerOrder[nextDefenderIndex];
                        console.log('⏭️ Skipping to next attacker:', nextAttacker, 'vs', nextDefender);
                        await startNewTurn(nextAttacker, nextDefender);
                        resolve();
                      } catch (error) {
                        reject(error);
                      }
                    }
              }
            ]
          );
        });
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
        failedAttempts: 0,
        currentGuesser: defenderId, // Defender starts
        isInChallengerPhase: false,
      };

      setTurnData(newTurnData);
      setGamePhase('turn_countdown');
      setTimeRemaining(3);
      setHasSubmittedGuess(false);
      setHasChallenged(false);
      setGuessText('');
      setShowAlbumArt(false);
      setVotes({});
      setHasVoted(false);
      setShowVotingModal(false);

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
    
    // Check if there are already guesses submitted during audio phase
    if (turnData && turnData.guesses.length > 0) {
      console.log('📝 Guesses already submitted during audio phase, starting voting instead');
      setGamePhase('voting');
      setTimeRemaining(30);
      setShowVotingModal(true);
      stopAudio();
      
      // Sync voting phase to database
      syncToDatabase({
        phase: 'voting',
        time_remaining: 30,
      });
      return;
    }
    
    setGamePhase('guessing');
    setTimeRemaining(15);
    stopAudio();

    // Sync to database
    syncToDatabase({
      phase: 'guessing',
      time_remaining: 15,
    });
  };

  const handleGuessingTimeUp = async () => {
    console.log('⏰ Guessing time up!');
    
    // Only host should handle automatic progression
    if (!isHost) {
      console.log('🚫 Non-host ignoring timer expiry');
      return;
    }
    
    // CRITICAL: Get the latest sync state before making any decisions
    console.log('🔍 Getting latest sync state before timer progression...');
    try {
      const latestSyncState = await gameSessionService.getGameSyncState(gameSession.id);
      if (latestSyncState?.turn_data) {
        console.log('📡 Latest sync state guesses:', latestSyncState.turn_data.guesses?.length || 0);
        
        // Use the latest sync state data for decision making
        if (latestSyncState.turn_data.guesses && latestSyncState.turn_data.guesses.length > 0) {
          console.log('🗳️ LATEST SYNC SHOWS GUESSES! Starting voting immediately');
          setGamePhase('voting');
          setTimeRemaining(30);
          setShowVotingModal(true);
          
          // Update local turn data with latest sync
          setTurnData({
            ...turnData!,
            guesses: latestSyncState.turn_data.guesses,
          });
          
          // Sync voting phase to database
          syncToDatabase({
            phase: 'voting',
            time_remaining: 30,
          });
          return;
        }
      }
    } catch (error) {
      console.error('Error getting latest sync state:', error);
    }
    
    // ALWAYS check the current turn data from the latest sync state first
    console.log('🔍 Checking local turn state before timer progression...');
    console.log('🔍 Current guesses count:', turnData?.guesses?.length || 0);
    console.log('🔍 Turn data:', turnData);
    
    // Check if there are any guesses submitted
    if (turnData && turnData.guesses.length > 0) {
      // Someone submitted a guess - start voting phase
      console.log('📝 GUESSES FOUND! Starting voting phase instead of progressing');
      setGamePhase('voting');
      setTimeRemaining(30);
      setShowVotingModal(true);
      
      // Sync to database
      syncToDatabase({
        phase: 'voting',
        time_remaining: 30, // 30 seconds for voting
      });
    } else if (turnData) {
      // No answer submitted - handle based on current phase
      console.log('💔 NO GUESSES FOUND - proceeding with failure logic');
      if (turnData.isInChallengerPhase) {
        // Challenger failed - attacker loses
        console.log('💔 Challenger failed, attacker loses');
        handleAttackerLoses();
      } else {
        // Defender failed - move to next attempt or challenger phase
        console.log('💔 Defender failed attempt, handling progression');
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
    
    // Allow guess submission during audio_playing or guessing phases
    if (gamePhase !== 'guessing' && gamePhase !== 'audio_playing') {
      console.log('🚫 Cannot submit guess during phase:', gamePhase);
      Alert.alert('Not Ready', 'Please wait for the audio or guessing phase to submit your answer.');
      return;
    }
    
    console.log('✅ Guess submission allowed during phase:', gamePhase);

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

      // Always sync the turn data first
      console.log('💾 Syncing turn data with', updatedGuesses.length, 'guesses to database');
      await gameSessionService.updateGameSyncState(gameSession.id, {
        turn_data: updatedTurnData,
      }, user!.id);
      console.log('✅ Turn data synced successfully');

      // Only host can trigger voting phase
      if (isHost) {
        console.log('🗳️ Host: Guess submitted, starting voting phase for all players');
        setGamePhase('voting');
        setTimeRemaining(30);
        setShowVotingModal(true);
        
        // Sync voting phase to database for all players
        await syncToDatabase({
          phase: 'voting',
          time_remaining: 30,
        });
      } else {
        console.log('📝 Non-host: Guess submitted, waiting for host to trigger voting');
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
    
    // Close voting modal if open
    setShowVotingModal(false);
    setVotes({});
    setHasVoted(false);
    
    // Attacker gets +1 point
    updatePlayerScore(turnData.attackerId, 1);
    
    // Calculate next turn players - attacker role should always rotate
    const nextAttackerIndex = (playerOrder.indexOf(turnData.attackerId) + 1) % playerOrder.length;
    const nextAttacker = playerOrder[nextAttackerIndex];
    const nextDefenderIndex = (nextAttackerIndex + 1) % playerOrder.length;
    const nextDefender = playerOrder[nextDefenderIndex];
    
    const turnResultData = {
      winner: currentAttacker?.displayName || 'Attacker',
      winnerType: 'attacker' as const,
      reason: 'Defender failed to guess correctly',
      nextAttacker: nextAttacker,
      nextDefender: nextDefender,
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
    
    // Close voting modal immediately
    setShowVotingModal(false);
    setVotes({});
    setHasVoted(false);
    
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
    if (isHost) {
      syncToDatabase({
        phase: 'turn_results',
        show_album_art: true,
      });
    } else {
      // Non-host attacker can sync turn results directly
      gameSessionService.updateGameSyncState(gameSession.id, {
        phase: 'turn_results',
        show_album_art: true,
      }, user!.id).catch(error => {
        console.error('Error syncing turn results:', error);
      });
      console.log('✅ Non-host attacker synced turn results to database');
    }
  };

  const handleChallengerWins = (challengerId: string) => {
    if (!turnData) return;
    
    console.log('⚔️ Challenger wins! +1 point');
    setShowAlbumArt(true); // Reveal album art when someone wins
    console.log('🎨 Album art revealed for challenger win!');
    
    // Close voting modal immediately
    setShowVotingModal(false);
    setVotes({});
    setHasVoted(false);
    
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
    
    // Close voting modal if open
    setShowVotingModal(false);
    setVotes({});
    setHasVoted(false);
    
    // Attacker loses 1 point (can go negative)
    updatePlayerScore(turnData.attackerId, -1);
    
    // Calculate next turn players
    const nextAttackerIndex = (playerOrder.indexOf(turnData.attackerId) + 1) % playerOrder.length;
    const nextAttacker = playerOrder[nextAttackerIndex];
    const nextDefenderIndex = (nextAttackerIndex + 1) % playerOrder.length;
    const nextDefender = playerOrder[nextDefenderIndex];
    
    const turnResultData = {
      winner: 'No one',
      winnerType: 'defender' as const, // Just for typing, not really used
      reason: 'Attacker failed - no correct guesses',
      nextAttacker: nextAttacker,
      nextDefender: nextDefender,
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
    if (isHost && isPremium && turnData?.currentSong?.track_data?.id) {
      try {
        const trackUri = `spotify:track:${turnData.currentSong.track_data.id}`;
        await spotifyService.playTrackOnActiveDevice(trackUri, 0, selectedSpotifyDeviceId || undefined);
        Alert.alert('Playing on Spotify', 'The full song is now playing on your Spotify app!');
      } catch (error) {
        Alert.alert('Spotify Playback Error', error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (!isHost) {
      Alert.alert('Waiting for Host', 'The host is playing the song on their Spotify device.');
      return;
    }
    if (!isPremium) {
      Alert.alert('Spotify Premium Required', 'You must be a Spotify Premium user to play full songs.');
      return;
    }
    // fallback: show error
    Alert.alert('Playback Error', 'Unable to play the song.');
  };

  const stopAudio = async () => {
    try {
      // Stop old preview audio if it exists
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
        setAudioProgress(0);
      }
      
      // Stop Spotify playback if host and premium
      if (isHost && isPremium) {
        try {
          await spotifyService.pausePlayback(selectedSpotifyDeviceId || undefined);
          console.log('🎵 Spotify playback stopped');
        } catch (error) {
          console.log('⚠️ Could not stop Spotify playback:', error);
        }
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
        <View style={styles.phaseIndicator}>
          {gamePhase === 'turn_countdown' && (
            <View style={[styles.phaseContainer, { backgroundColor: '#FFA500' }]}>
              <Text style={styles.phaseText}>⏳ Turn Starting...</Text>
            </View>
          )}
          {gamePhase === 'audio_playing' && (
            <View style={[styles.phaseContainer, { backgroundColor: '#1DB954' }]}>
              <Text style={styles.phaseText}>🎵 LISTENING PHASE</Text>
              <Text style={styles.phaseSubtext}>Listen carefully to the song!</Text>
            </View>
          )}
          {gamePhase === 'guessing' && (
            <View style={[styles.phaseContainer, { backgroundColor: '#FF6B47' }]}>
              <Text style={styles.phaseText}>💭 GUESSING PHASE</Text>
              <Text style={styles.phaseSubtext}>Defender: Make your guess!</Text>
            </View>
          )}
          {gamePhase === 'voting' && (
            <View style={[styles.phaseContainer, { backgroundColor: '#8B4B9B' }]}>
              <Text style={styles.phaseText}>🗳️ VOTING PHASE</Text>
              <Text style={styles.phaseSubtext}>Vote on the answer!</Text>
            </View>
          )}
        </View>
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
        
        {/* Skip Turn Button - Host only */}
        {isHost && turnData && gamePhase !== 'pre_game_countdown' && (
          <TouchableOpacity 
            style={[styles.endTurnButton, { marginRight: 8 }]}
            onPress={skipToNextTurn}
          >
            <Text style={styles.endTurnButtonText}>⏭️</Text>
          </TouchableOpacity>
        )}
        
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

    const currentGuesser = turnData.currentGuesser;
    const isCurrentGuesser = user?.id === currentGuesser;
    const canSubmitGuess = isCurrentGuesser && !hasSubmittedGuess && (gamePhase === 'guessing' || gamePhase === 'audio_playing');
    const canChallenge = !turnData.isInChallengerPhase && !isCurrentAttacker && !isCurrentGuesser && !hasChallenged && turnData.failedAttempts < 3;

    if (isCurrentAttacker) {
      return (
        <View style={styles.guessingContainer}>
          <View style={styles.spectatorSection}>
            <Text style={styles.sectionTitle}>You're the Attacker</Text>
            <Text style={styles.spectatorText}>
              Wait for the {turnData.isInChallengerPhase ? 'challenger' : 'defender'} to guess your song!
            </Text>
          </View>
        </View>
      );
    }

    if (isCurrentGuesser) {
      return (
        <View style={styles.guessingContainer}>
          <View style={styles.defenderSection}>
            <Text style={styles.sectionTitle}>
              {turnData.isInChallengerPhase ? "You're the Challenger!" : "You're the Defender!"}
            </Text>
            <Text style={styles.defenderInstructions}>
              {turnData.isInChallengerPhase 
                ? "This is your only chance to guess the song!"
                : `Attempt ${turnData.failedAttempts + 1}/3 - What song is this?`
              }
            </Text>
            
            {canSubmitGuess && (
              <View style={styles.guessInputContainer}>
                <TextInput
                  style={styles.guessInput}
                  placeholder="Enter your guess..."
                  placeholderTextColor="#999"
                  value={guessText}
                  onChangeText={setGuessText}
                  multiline={false}
                  maxLength={100}
                />
                <TouchableOpacity
                  style={[styles.submitButton, !guessText.trim() && styles.submitButtonDisabled]}
                  onPress={submitGuess}
                  disabled={!guessText.trim()}
                >
                  <Text style={styles.submitButtonText}>Submit Guess</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {hasSubmittedGuess && (
              <View style={styles.submittedContainer}>
                <Text style={styles.submittedText}>✅ Guess submitted: "{guessText}"</Text>
                <Text style={styles.submittedSubtext}>Waiting for voting...</Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    // Other players (spectators who can challenge)
    return (
      <View style={styles.guessingContainer}>
        <View style={styles.spectatorSection}>
          <Text style={styles.sectionTitle}>Spectator</Text>
          <Text style={styles.spectatorText}>
            {turnData.isInChallengerPhase
              ? `${playerScores.find(p => p.userId === currentGuesser)?.displayName} is challenging!`
              : `${playerScores.find(p => p.userId === currentGuesser)?.displayName} is guessing (attempt ${turnData.failedAttempts + 1}/3)`
            }
          </Text>
          
          {canChallenge && (
            <TouchableOpacity
              style={[styles.challengeButton, hasChallenged && styles.challengeButtonDisabled]}
              onPress={submitChallenge}
              disabled={hasChallenged}
            >
              <Text style={styles.challengeButtonText}>
                {hasChallenged ? '⚔️ Challenge Submitted' : '⚔️ Challenge'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderTurnStateComponent = () => {
    if (!turnData || gamePhase === 'pre_game_countdown') return null;

    const currentAttemptNumber = turnData.isInChallengerPhase ? 4 : (turnData.failedAttempts + 1);
    const maxAttempts = turnData.isInChallengerPhase ? 4 : 3;
    const currentGuesser = playerScores.find(p => p.userId === turnData.currentGuesser);
    const guesserRole = turnData.isInChallengerPhase ? 'Challenger' : 'Defender';

    return (
      <View style={styles.turnStateContainer}>
        <View style={styles.turnStateHeader}>
          <Text style={styles.turnStateTitle}>
            Turn {currentTurnIndex} • Attempt {currentAttemptNumber}/{maxAttempts}
          </Text>
          <Text style={styles.turnStatePlayer}>
            {guesserRole}: {currentGuesser?.displayName}
          </Text>
          {turnData.isInChallengerPhase && (
            <Text style={styles.challengerPhaseText}>⚔️ Challenger Phase</Text>
          )}
        </View>

        {/* Current Guesses */}
        {turnData.guesses.length > 0 && (
          <View style={styles.guessesStateSection}>
            <Text style={styles.stateSubtitle}>Current Guesses:</Text>
            {turnData.guesses.map((guess, index) => {
              const guesser = playerScores.find(p => p.userId === guess.player_id);
              return (
                <View key={index} style={styles.guessStateItem}>
                  <Text style={styles.guessStateText}>
                    "{guess.guess_text}" - {guesser?.displayName}
                  </Text>
                  {user?.id === turnData.attackerId && (
                    <TouchableOpacity
                      style={styles.acceptGuessButton}
                      onPress={() => acceptGuessFromTurnState(guess.id)}
                    >
                      <Text style={styles.acceptGuessText}>✓ Accept</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Challengers (only show if not in challenger phase) */}
        {!turnData.isInChallengerPhase && turnData.challenges.length > 0 && (
          <View style={styles.challengersStateSection}>
            <Text style={styles.stateSubtitle}>Challengers Waiting:</Text>
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
            <ScrollView 
              showsVerticalScrollIndicator={true}
              indicatorStyle="white"
              style={{ maxHeight: screenHeight * 0.7 }}
            >
            <Text style={styles.votingTitle}>Vote on the Answer</Text>
            <Text style={styles.votingAnswer}>"{guess.guess_text}"</Text>
            <Text style={styles.votingBy}>by {guesser?.displayName}</Text>
            
            <Text style={styles.votingTimer}>
              Time remaining: {Math.max(0, timeRemaining)} seconds
            </Text>
            
            {canVote ? (
              <View style={styles.votingButtons}>
                <TouchableOpacity
                  style={[
                    styles.voteButton, 
                    styles.acceptButton,
                    hasVoted && votes[user!.id] === 'accept' ? { opacity: 0.8 } : null
                  ]}
                  onPress={() => submitVote('accept')}
                  disabled={false}
                >
                  <Text style={styles.voteButtonText}>
                    ✓ Accept ({Object.values(votes).filter(v => v === 'accept').length})
                    {hasVoted && votes[user!.id] === 'accept' ? ' ✓' : ''}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.voteButton, 
                    styles.rejectButton,
                    hasVoted && votes[user!.id] === 'reject' ? { opacity: 0.8 } : null
                  ]}
                  onPress={() => submitVote('reject')}
                  disabled={false}
                >
                  <Text style={styles.voteButtonText}>
                    ✗ Reject ({Object.values(votes).filter(v => v === 'reject').length})
                    {hasVoted && votes[user!.id] === 'reject' ? ' ✓' : ''}
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
              
              {/* Host Skip Button in Voting Modal */}
              {isHost && (
                <TouchableOpacity
                  style={[styles.voteButton, { backgroundColor: '#FF6B6B', marginTop: 10 }]}
                  onPress={skipToNextTurn}
                >
                  <Text style={styles.voteButtonText}>⏭️ Skip Turn (Host)</Text>
                </TouchableOpacity>
              )}
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const submitVote = async (vote: string) => {
    if (!turnData) {
      console.log('🚫 Vote submission blocked: No turn data');
      return;
    }
    
    // Allow changing vote if user clicks a different option
    if (hasVoted && votes[user!.id] === vote) {
      console.log('🚫 Vote submission blocked: Already voted for this option');
      return;
    }
    
    console.log('🗳️ Vote submission (change allowed):', {
      vote,
      userId: user?.id,
      hasVoted,
      previousVote: votes[user!.id],
      isChangingVote: hasVoted && votes[user!.id] !== vote
    });

    console.log('🗳️ Vote submission attempt:', {
      vote,
      userId: user?.id,
      hasVoted,
      turnDataExists: !!turnData,
      currentVotes: votes
    });

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
      
      console.log('🗳️ Syncing vote to database:', {
        vote,
        userId: user?.id,
        newVotes,
        isHost
      });
      
      // Allow all players to sync their votes directly
      if (isHost) {
        await syncToDatabase({
          turn_data: updatedTurnData,
        });
      } else {
        // Non-host players can sync their votes directly
        await gameSessionService.updateGameSyncState(gameSession.id, {
          turn_data: updatedTurnData,
        }, user!.id);
        console.log('✅ Non-host player synced vote to database');
      }

      console.log('🗳️ Vote submitted and synced:', vote);
      
      // Check if voting is complete
      checkVotingComplete(newVotes);
      
    } catch (error) {
      console.error('Error submitting vote:', error);
      Alert.alert('Error', 'Failed to submit vote.');
      // Reset vote state on error
      setHasVoted(false);
      setVotes(prevVotes => {
        const { [user!.id]: _, ...rest } = prevVotes;
        return rest;
      });
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

    // ENHANCED LOGGING: Show detailed voting state
    console.log('🗳️ Detailed voting state:', {
      currentVotes,
      attackerId: turnData.attackerId,
      guesserId: guess.player_id,
      currentUserId: user?.id,
      eligibleVoters: playerScores.length - 1,
      votesCount,
      attackerVote: currentVotes[turnData.attackerId],
      isCurrentUserAttacker: user?.id === turnData.attackerId,
      isCurrentUserGuesser: user?.id === guess.player_id
    });

    // Check if attacker accepted (auto-win)
    const attackerVote = currentVotes[turnData.attackerId];
    const attackerAccepted = attackerVote === 'accept';
    
    // Count non-guesser votes (guesser cannot vote on own answer)
    const eligibleVoters = playerScores.length - 1; // Everyone except the guesser
    const nonGuesserVotes = Object.entries(currentVotes)
      .filter(([userId]) => userId !== guess.player_id)
      .map(([, vote]) => vote);
    
    const nonGuesserAccepts = nonGuesserVotes.filter(vote => vote === 'accept').length;
    
    console.log('🗳️ Voting logic check:', {
      attackerAccepted,
      nonGuesserAccepts,
      eligibleVoters,
      totalPlayers,
      votesCount,
      shouldCompleteVoting: attackerAccepted || (totalPlayers === 2 && votesCount >= eligibleVoters) || nonGuesserAccepts >= 2 || votesCount >= eligibleVoters
    });

    if (attackerAccepted) {
      console.log('🏆 Attacker accepted the answer!');
      // Award point to the guesser
      updatePlayerScore(guess.player_id, 1);
      
      // Check if this is a challenger win
      if (turnData.isInChallengerPhase) {
        console.log('⚔️ Challenger answer accepted!');
        handleChallengerWins(guess.player_id);
      } else {
        console.log('🛡️ Defender answer accepted!');
        handleDefenderWins();
      }
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
      
      // Check if this is a challenger win
      if (turnData.isInChallengerPhase) {
        console.log('⚔️ Challenger answer accepted by majority!');
        handleChallengerWins(guess.player_id);
      } else {
        console.log('🛡️ Defender answer accepted by majority!');
        handleDefenderWins();
      }
    } else if (votesCount >= eligibleVoters) { // All eligible voters have voted
      console.log('💔 Answer rejected by majority');
      handleAnswerRejected();
    } else {
      console.log('🔄 Voting not complete yet, waiting for more votes:', {
        votesCount,
        eligibleVoters,
        nonGuesserAccepts,
        needsMoreVotes: eligibleVoters - votesCount
      });
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

    // CRITICAL CHECK: If there are guesses submitted, start voting instead of failing
    if (turnData.guesses.length > 0) {
      console.log('🗳️ DEFENDER FAILED BUT GUESSES EXIST! Starting voting instead of progressing');
      setGamePhase('voting');
      setTimeRemaining(30);
      setShowVotingModal(true);
      
      // Sync voting phase to database
      syncToDatabase({
        phase: 'voting',
        time_remaining: 30,
      });
      return;
    }

    const newFailedAttempts = turnData.failedAttempts + 1;
    const newAttempt = newFailedAttempts + 1;
    
    console.log(`💔 Defender attempt ${newFailedAttempts}/3 failed - NO GUESSES FOUND`);
    
    if (newFailedAttempts >= 3) {
      // After 3 defender attempts, check for challengers
      if (turnData.challenges.length > 0) {
        const firstChallenger = turnData.challenges[0];
        console.log('⚔️ Switching to challenger phase after 3 defender attempts');
        
        setCurrentAttempt(4); // Challenger gets attempt 4
        
        const updatedTurnData = {
          ...turnData,
          failedAttempts: 3,
          currentGuesser: firstChallenger,
          isInChallengerPhase: true,
          guesses: [], // Reset guesses for challenger
          votingResults: null,
        };
        
        setTurnData(updatedTurnData);
        
        // Reset local state for challenger
        setHasSubmittedGuess(false);
        setGuessText('');
        setVotes({});
        setHasVoted(false);
        setShowVotingModal(false);
        
        // Start new attempt for challenger
        setGamePhase('turn_countdown');
        setTimeRemaining(3);
        
        // Sync to database
        syncToDatabase({
          phase: 'turn_countdown',
          time_remaining: 3,
          turn_data: updatedTurnData,
        });
      } else {
        // No challengers, attacker loses after 3 defender attempts
        console.log('💔 No challengers available, attacker loses');
        handleAttackerLoses();
      }
    } else {
      // Give defender another chance (attempts 2 and 3)
      console.log(`🔄 Giving defender another chance (attempt ${newAttempt}/3)`);
      
      setCurrentAttempt(newAttempt);
      
      const updatedTurnData = {
        ...turnData,
        failedAttempts: newFailedAttempts,
        currentGuesser: turnData.defenderId, // Still defender
        isInChallengerPhase: false,
        guesses: [], // Reset guesses for next attempt
        votingResults: null,
      };
      
      setTurnData(updatedTurnData);
      
      // Reset local state for next attempt
      setHasSubmittedGuess(false);
      setGuessText('');
      setVotes({});
      setHasVoted(false);
      setShowVotingModal(false);
      
      // Start new attempt
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

  const proceedToNextTurn = async () => {
    console.log('🔘 NEXT TURN BUTTON PRESSED!');
    console.log('🔘 Current state:', { 
      isHost, 
      showTurnSummary, 
      turnResult: !!turnResult,
      userId: user?.id,
      displayName: user?.display_name,
      gamePhase,
      currentTurnIndex,
      playerOrder: playerOrder.length
    });
    
    if (!isHost) {
      console.log('❌ Only host can proceed to next turn');
      Alert.alert('Error', 'Only the host can start the next turn.');
      return;
    }
    
    if (!turnResult) {
      console.log('❌ No turn result available for next turn');
      console.log('❌ turnResult is:', turnResult);
      Alert.alert('Error', 'No turn result available. Please try again.');
      return;
    }
    
    console.log('▶️ Host proceeding to next turn');
    console.log('🎯 Next turn will be:', turnResult.nextAttacker, 'vs', turnResult.nextDefender);
    console.log('🎯 Turn result details:', turnResult);
    
    // Store the next turn info before clearing state
    const nextAttacker = turnResult.nextAttacker;
    const nextDefender = turnResult.nextDefender;
    
    if (!nextAttacker || !nextDefender) {
      console.log('❌ Invalid next turn players:', { nextAttacker, nextDefender });
      Alert.alert('Error', 'Invalid next turn players. Please try again.');
      return;
    }
    
    // Validate that players exist in playerOrder
    if (!playerOrder.includes(nextAttacker) || !playerOrder.includes(nextDefender)) {
      console.log('❌ Next turn players not in player order:', { nextAttacker, nextDefender, playerOrder });
      Alert.alert('Error', 'Next turn players are not valid. Please restart the game.');
      return;
    }
    
    // Proactively check if next attacker has songs
    if (!currentRoom) {
      console.error('❌ No current room available');
      Alert.alert('Error', 'Room not available. Please try again.');
      return;
    }
    
    try {
      const nextAttackerSongs = await songStackService.getUserSongStack(nextAttacker, currentRoom.id);
      if (nextAttackerSongs.length === 0) {
        const nextAttackerName = playerScores.find(p => p.userId === nextAttacker)?.displayName || 'Player';
        console.log('⚠️ Next attacker has no songs, showing warning');
        Alert.alert(
          'No Songs Available', 
          `${nextAttackerName} has no songs in their stack! They need to add songs before continuing.`,
          [
            { text: 'OK', style: 'default' }
          ]
        );
        return;
      }
    } catch (error) {
      console.error('Error checking next attacker songs:', error);
      Alert.alert('Error', 'Failed to check player songs. Please try again.');
      return;
    }
    
    try {
      // Stop any audio that might be playing from the previous turn
      console.log('🔇 Stopping audio before next turn');
      await stopAudio();
      
      // Hide turn summary locally first
      console.log('🔄 Hiding turn summary modal');
      setShowTurnSummary(false);
      setTurnResult(null);
      
      // Clear voting modal state for all players
      setShowVotingModal(false);
      setVotes({});
      setHasVoted(false);
      
      // Add a small delay to ensure state is cleared
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Start the next turn
      console.log('🚀 Starting new turn with:', nextAttacker, 'vs', nextDefender);
      try {
        await startNewTurn(nextAttacker, nextDefender);
        console.log('✅ Next turn started successfully');
      } catch (turnError) {
        console.error('❌ Error starting new turn:', turnError);
        
        // Check if this is a "no songs" error or user cancelled
        const errorMessage = turnError instanceof Error ? turnError.message : String(turnError);
        if (errorMessage?.includes('Game ended') || errorMessage?.includes('no songs')) {
          console.log('🎮 Game ended or player has no songs - stopping here');
          return; // Don't show error alert, user already handled it
        }
        
        // For other errors, show alert and restore state
        Alert.alert('Error', 'Failed to start next turn. Please try again.');
        setShowTurnSummary(true);
        setTurnResult(turnResult);
        return;
      }
      
    } catch (error) {
      console.error('❌ General error in proceedToNextTurn:', error);
      Alert.alert('Error', 'Failed to proceed to next turn. Please try again.');
      
      // Restore turn summary if there was an error
      setShowTurnSummary(true);
      setTurnResult(turnResult);
    }
  };

  const skipToNextTurn = async () => {
    console.log('⏭️ SKIP TO NEXT TURN PRESSED!');
    
    if (!isHost) {
      console.log('❌ Only host can skip to next turn');
      Alert.alert('Error', 'Only the host can skip turns.');
      return;
    }
    
    if (!turnData || !currentRoom) {
      console.log('❌ No turn data or room available');
      Alert.alert('Error', 'No active turn to skip.');
      return;
    }
    
    // Show confirmation dialog
    const attackerName = playerScores.find(p => p.userId === turnData.attackerId)?.displayName || 'Attacker';
    const defenderName = playerScores.find(p => p.userId === turnData.defenderId)?.displayName || 'Defender';
    
    Alert.alert(
      'Skip Turn',
      `Are you sure you want to skip this turn?\n\n${attackerName} vs ${defenderName}\n\n• No points will be awarded\n• Same roles will continue\n• New song will be played`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Skip Turn', 
          style: 'destructive',
          onPress: async () => {
            await performSkipTurn();
          }
        }
      ]
    );
  };

  const performSkipTurn = async () => {
    if (!turnData || !currentRoom) return;
    
    console.log('⏭️ Performing skip turn:', turnData.attackerId, 'vs', turnData.defenderId);
    
    // Keep the same roles - don't rotate
    const currentAttacker = turnData.attackerId;
    const currentDefender = turnData.defenderId;
    
    // Check if current attacker has songs
    try {
      const attackerSongs = await songStackService.getUserSongStack(currentAttacker, currentRoom.id);
      if (attackerSongs.length === 0) {
        const attackerName = playerScores.find(p => p.userId === currentAttacker)?.displayName || 'Player';
        Alert.alert(
          'No Songs Available', 
          `${attackerName} has no songs left! Cannot start new turn.`,
          [{ text: 'OK', style: 'default' }]
        );
        return;
      }
    } catch (error) {
      console.error('Error checking attacker songs:', error);
      Alert.alert('Error', 'Failed to check player songs. Please try again.');
      return;
    }
    
    try {
      // Stop any audio
      console.log('🔇 Stopping audio before skip');
      await stopAudio();
      
      // Clear all modal states
      setShowTurnSummary(false);
      setTurnResult(null);
      setShowVotingModal(false);
      setVotes({});
      setHasVoted(false);
      
      // Add a small delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Start new turn with same roles
      console.log('🚀 Skipping to new turn with same roles:', currentAttacker, 'vs', currentDefender);
      await startNewTurn(currentAttacker, currentDefender);
      console.log('✅ Turn skipped successfully');
      
    } catch (error) {
      console.error('❌ Error skipping turn:', error);
      Alert.alert('Error', 'Failed to skip turn. Please try again.');
    }
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
      
      // Sync the acceptance - bypass syncToDatabase for non-host attackers
      if (isHost) {
        await syncToDatabase({
          turn_data: updatedTurnData,
        });
      } else {
        // Non-host attacker can sync their acceptance directly
        await gameSessionService.updateGameSyncState(gameSession.id, {
          turn_data: updatedTurnData,
        }, user!.id);
        console.log('✅ Non-host attacker synced acceptance to database');
      }

      // Trigger defender wins
      handleDefenderWins();
      
    } catch (error) {
      console.error('Error accepting guess:', error);
      Alert.alert('Error', 'Failed to accept guess.');
    }
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
          showsVerticalScrollIndicator={true}
          bounces={true}
          alwaysBounceVertical={true}
          scrollEnabled={true}
          nestedScrollEnabled={true}
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
          
          {/* Dynamic spacer to ensure scrolling works */}
          <View style={{ height: Math.max(100, screenHeight * 0.3) }} />
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
            <ScrollView 
              showsVerticalScrollIndicator={true}
              indicatorStyle="white"
              style={{ maxHeight: screenHeight * 0.8 }}
            >
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
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.nextTurnButton, { flex: 1 }]}
                  onPress={async () => {
                    console.log('🔘 NEXT TURN BUTTON TAPPED!');
                    console.log('🔘 Button state:', { isHost, turnResult: !!turnResult, showTurnSummary });
                    await proceedToNextTurn();
                  }}
                >
                  <Text style={styles.nextTurnButtonText}>Continue to Next Turn →</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.nextTurnButton, { backgroundColor: '#FF6B6B', flex: 1 }]}
                  onPress={skipToNextTurn}
                >
                  <Text style={styles.nextTurnButtonText}>⏭️ Skip Turn</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {!isHost && (
              <Text style={styles.waitingText}>Waiting for host to continue...</Text>
            )}
            

            </ScrollView>
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
    paddingBottom: isSmallDevice ? 50 : 40,
    paddingTop: 10,
    // Remove minHeight constraint that was preventing proper scrolling
  },
  countdownContainer: {
    minHeight: screenHeight - 100, // Use actual height instead of flex
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: isSmallDevice ? 20 : 40,
  },
  countdownTitle: {
    fontSize: getResponsiveFontSize(24),
    fontWeight: 'bold',
    color: '#F5E6D3',
    marginBottom: isSmallDevice ? 10 : 15,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  countdownNumber: {
    fontSize: isSmallDevice ? 60 : isLargeDevice ? 120 : 80,
    fontWeight: 'bold',
    color: '#F5E6D3',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 6,
  },
  countdownSubtitle: {
    fontSize: getResponsiveFontSize(18),
    color: '#8B4B9B',
    marginTop: isSmallDevice ? 10 : 15,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isSmallDevice ? 10 : 15,
    paddingVertical: isSmallDevice ? 8 : 12,
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    borderBottomWidth: isSmallDevice ? 2 : 3,
    borderBottomColor: '#F5E6D3',
    borderRadius: 20,
    marginHorizontal: isSmallDevice ? 8 : 10,
    marginTop: 5,
    marginBottom: isSmallDevice ? 8 : 10,
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
    fontSize: getResponsiveFontSize(22),
    fontWeight: 'bold',
  },
  gameInfo: {
    flex: 1,
    alignItems: 'center',
  },
  gameTitle: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(20),
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  gamePhaseText: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(14),
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
    paddingHorizontal: isSmallDevice ? 10 : 15,
    marginBottom: isSmallDevice ? 10 : 15,
  },
  playersTitle: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(18),
    fontWeight: 'bold',
    marginBottom: isSmallDevice ? 8 : 12,
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
    paddingHorizontal: isSmallDevice ? 10 : 15,
    marginBottom: isSmallDevice ? 10 : 15,
    minHeight: isSmallDevice ? 150 : 200, // Ensure minimum height
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
    fontSize: getResponsiveFontSize(24),
    fontWeight: 'bold',
    backgroundColor: 'rgba(139, 75, 155, 0.7)',
    paddingHorizontal: isSmallDevice ? 10 : 12,
    paddingVertical: isSmallDevice ? 4 : 6,
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
    padding: isSmallDevice ? 15 : 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: isSmallDevice ? 100 : 120, // Ensure minimum height
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
    fontSize: getResponsiveFontSize(24),
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
    paddingHorizontal: isSmallDevice ? 10 : 15,
    marginBottom: isSmallDevice ? 10 : 15,
    minHeight: isSmallDevice ? 120 : 150, // Ensure minimum height
  },
  defenderSection: {
    backgroundColor: 'rgba(245, 230, 211, 0.95)',
    padding: isSmallDevice ? 12 : 15,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#8B4B9B',
    minHeight: isSmallDevice ? 140 : 160, // Ensure minimum height
  },
  spectatorSection: {
    backgroundColor: 'rgba(245, 230, 211, 0.95)',
    padding: isSmallDevice ? 12 : 15,
    borderRadius: 20,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#8B4B9B',
    minHeight: isSmallDevice ? 80 : 100, // Ensure minimum height
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
    padding: isSmallDevice ? 15 : 20,
    borderRadius: 20,
    width: isSmallDevice ? '95%' : '90%',
    maxHeight: isSmallDevice ? '80%' : '70%',
    borderWidth: isSmallDevice ? 2 : 4,
    borderColor: '#8B4B9B',
    maxWidth: 500, // Prevent too wide on large screens
  },
  votingTitle: {
    fontSize: getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#000',
    marginBottom: isSmallDevice ? 12 : 16,
  },
  votingAnswer: {
    fontSize: getResponsiveFontSize(18),
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
    padding: isSmallDevice ? 15 : 20,
    borderRadius: 20,
    width: isSmallDevice ? '95%' : '90%',
    maxHeight: isSmallDevice ? '85%' : '75%',
    borderWidth: isSmallDevice ? 2 : 4,
    borderColor: '#8B4B9B',
    maxWidth: 500, // Prevent too wide on large screens
  },
  summaryTitle: {
    fontSize: getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#000',
    marginBottom: isSmallDevice ? 12 : 16,
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
    padding: isSmallDevice ? 12 : 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 3,
    borderTopColor: '#8B4B9B',
    minHeight: isSmallDevice ? 180 : 220, // Ensure minimum height
    marginBottom: isSmallDevice ? 20 : 30, // Add bottom margin
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
  phaseIndicator: {
    marginTop: 8,
    alignItems: 'center',
  },
  phaseContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    minWidth: 200,
  },
  phaseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  phaseSubtext: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.9,
  },
  challengerPhaseText: {
    color: '#FF6B47',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 4,
  },
  spectatorText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  defenderInstructions: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  guessInputContainer: {
    marginBottom: 16,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  submittedContainer: {
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submittedText: {
    color: '#1DB954',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  submittedSubtext: {
    color: '#666',
    fontSize: 12,
  },
  challengeButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
});

export default GameplayScreen; 