import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Clipboard,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoom } from '../contexts/RoomContext';
import { useAuth } from '../contexts/AuthContext';
import { RoomMember } from '../types';
import { GameSessionService, GameSession } from '../services/gameSessionService';
import { SongStackService } from '../services/songStackService';
import { SpotifyService } from '../services/spotify';

const { width, height } = Dimensions.get('window');
const isSmallDevice = width < 380 || height < 700;
const isLargeDevice = width > 500;

// Responsive font size function
const getResponsiveFontSize = (baseSize: number) => {
  if (isSmallDevice) return baseSize * 0.8;
  if (isLargeDevice) return baseSize * 1.1;
  return baseSize;
};

interface RoomScreenProps {
  navigation: any;
}

const RoomScreen: React.FC<RoomScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const { currentRoom, roomMembers, isLoading, error, leaveRoom, refreshRoom, setSelectedSpotifyDeviceId } = useRoom();
  const [refreshing, setRefreshing] = useState(false);
  const [currentGameSession, setCurrentGameSession] = useState<GameSession | null>(null);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [showGameStartBanner, setShowGameStartBanner] = useState(false);
  const [gameStartCountdown, setGameStartCountdown] = useState(5);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isTestingPlayback, setIsTestingPlayback] = useState(false);

  const [deviceError, setDeviceError] = useState<string | null>(null);

  const gameSessionService = GameSessionService.getInstance();
  const songStackService = SongStackService.getInstance();
  const spotifyService = SpotifyService.getInstance();

  useEffect(() => {
    // Don't navigate away if we're still loading
    if (isLoading) {
      return;
    }
    
    if (!currentRoom) {
      // Add a small delay to avoid race conditions
      setTimeout(() => {
        navigation.navigate('Home');
      }, 100);
      return;
    }

    // Refresh room data when screen loads
    refreshRoom();
    
    // Load current game session if exists
    if (currentRoom?.id) {
      loadCurrentGameSession();
    }

    // Set up SINGLE polling interval for both room updates and game session
    const pollInterval = setInterval(async () => {
      if (currentRoom?.id) {
        try {
          // Refresh room data
          await refreshRoom();
          
          // Check for game session
          const gameSession = await gameSessionService.getCurrentGameSession(currentRoom.id);
          setCurrentGameSession(gameSession);
          
          // If game session is playing, navigate to gameplay
          if (gameSession && gameSession.state === 'playing') {
            console.log('🎮 Game session detected, navigating to gameplay...');
            clearInterval(pollInterval); // Stop polling before navigation
            navigation.navigate('Gameplay', { gameSession });
          }
        } catch (error) {
          console.error('Error in polling:', error);
        }
      }
    }, 2000); // Poll every 2 seconds instead of 1 second

    // Cleanup interval on unmount
    return () => {
      clearInterval(pollInterval);
    };
  }, [currentRoom, navigation, refreshRoom, isLoading]);

  // Monitor for game session changes
  useEffect(() => {
    if (currentGameSession && currentGameSession.state === 'playing') {
      // If a game session exists and is playing, show countdown for all players
      if (!showGameStartBanner) {
        setShowGameStartBanner(true);
        setGameStartCountdown(3); // Shorter countdown for joining players
        
        const countdownInterval = setInterval(() => {
          setGameStartCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              setTimeout(() => {
                setShowGameStartBanner(false);
                // Navigate all players to gameplay
                navigation.navigate('Gameplay', { gameSession: currentGameSession });
              }, 1000);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    }
  }, [currentGameSession]);

  const loadCurrentGameSession = async () => {
    if (!currentRoom?.id) return;
    
    try {
      const session = await gameSessionService.getCurrentGameSession(currentRoom.id);
      setCurrentGameSession(session);
    } catch (error) {
      console.error('Error loading game session:', error);
    }
  };

  const handleCopyRoomCode = () => {
    if (currentRoom?.code) {
      Clipboard.setString(currentRoom.code);
      Alert.alert('Copied!', 'Room code copied to clipboard');
    }
  };

  const handleLeaveRoom = () => {
    Alert.alert(
      'Leave Room',
      'Are you sure you want to leave this room?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await leaveRoom();
            navigation.navigate('Home');
          },
        },
      ]
    );
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshRoom();
    await loadCurrentGameSession();
    setRefreshing(false);
  };

  const startGame = async () => {
    if (!currentRoom || !user) return;

    try {
      setIsStartingGame(true);
      console.log('🎮 Starting game...');

      // Create game session
      const gameSession = await gameSessionService.createGameSession(currentRoom.id, user.id);
      console.log('✅ Game session created:', gameSession.id);

      // Start the game session (this will trigger navigation sync for all players)
      const startedSession = await gameSessionService.startGameSession(gameSession.id);
      console.log('🚀 Game session started:', startedSession.id);

      // Host navigates immediately, others will follow via polling
      navigation.navigate('Gameplay', { gameSession: startedSession });

    } catch (error) {
      console.error('❌ Error starting game:', error);
      Alert.alert('Error', 'Failed to start game. Please try again.');
    } finally {
      setIsStartingGame(false);
    }
  };

  const isHost = user?.id === currentRoom?.host_id;

  // Fetch devices when modal opens
  useEffect(() => {
    if (showDeviceModal) {
      (async () => {
        try {
          setDeviceError(null);
          const foundDevices = await spotifyService.getAvailableDevices();
          setDevices(foundDevices);
        } catch (err) {
          setDeviceError('Failed to fetch devices. Make sure you are logged in and have the Spotify app open.');
        }
      })();
    }
  }, [showDeviceModal]);



  const handleTestPlayback = async () => {
    if (!selectedDeviceId) return;
    setIsTestingPlayback(true);
    setDeviceError(null);
    try {
      // Use a short, public Spotify track URI (e.g., "spotify:track:11dFghVXANMlKmJXsNCbNl" = Daft Punk - Get Lucky (Radio Edit))
      await spotifyService.playTrackOnActiveDevice('spotify:track:11dFghVXANMlKmJXsNCbNl', 0, selectedDeviceId);
      Alert.alert('Test Playback', 'If your device is active, you should hear music now!');
      // Store the selected device in context for use in gameplay
      setSelectedSpotifyDeviceId(selectedDeviceId);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsTestingPlayback(false);
    }
  };

  const renderMember = (member: RoomMember, index: number) => (
    <View key={member.user_id} style={styles.memberCard}>
      <Image
        source={{ uri: member.user?.avatar_url || 'https://via.placeholder.com/50' }}
        style={styles.memberAvatar}
      />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{member.user?.display_name || 'Unknown Player'}</Text>
        <Text style={styles.memberScore}>Score: {member.score}</Text>
      </View>
      {isHost && member.user_id === currentRoom?.host_id && (
        <View style={styles.hostBadge}>
          <Text style={styles.hostBadgeText}>HOST</Text>
        </View>
      )}
    </View>
  );

  if (!currentRoom) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Loading room...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
          <LinearGradient colors={['#D2691E', '#FF6347', '#FF8C00']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          bounces={true}
          alwaysBounceVertical={true}
          scrollEnabled={true}
          nestedScrollEnabled={true}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Game Room</Text>
            <TouchableOpacity onPress={handleLeaveRoom} style={styles.leaveButton}>
              <Text style={styles.leaveButtonText}>Leave</Text>
            </TouchableOpacity>
          </View>

          {/* Room Code Section */}
          <View style={styles.roomCodeSection}>
            <Text style={styles.roomCodeLabel}>Room Code</Text>
            <TouchableOpacity onPress={handleCopyRoomCode} style={styles.roomCodeContainer}>
              <Text style={styles.roomCode}>{currentRoom.code}</Text>
              <Text style={styles.copyHint}>Tap to copy</Text>
            </TouchableOpacity>
          </View>

          {/* Room Status */}
          <View style={styles.statusSection}>
            <Text style={styles.statusLabel}>Status</Text>
            <View style={[styles.statusBadge, { backgroundColor: currentRoom.state === 'waiting' ? '#FFA500' : '#1DB954' }]}>
              <Text style={styles.statusText}>
                {currentRoom.state === 'waiting' ? 'Waiting for players' : currentRoom.state.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Members Section */}
          <View style={styles.membersSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Players ({roomMembers.length})</Text>
              <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
                <Text style={styles.refreshButtonText}>🔄</Text>
              </TouchableOpacity>
            </View>
            {roomMembers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No players yet</Text>
                <Text style={styles.emptyStateSubtext}>Share the room code to invite friends!</Text>
              </View>
            ) : (
              <View style={styles.membersList}>
                {roomMembers.map(renderMember)}
              </View>
            )}
          </View>



          {/* Game Controls */}
          <View style={styles.gameControls}>
            {/* Manage Songs Button - Always visible */}
            <TouchableOpacity 
              style={styles.manageSongsButton} 
              onPress={() => navigation.navigate('SongStack')}
            >
              <Text style={styles.manageSongsButtonText}>🎵 Manage My Songs</Text>
            </TouchableOpacity>
            {/* Set up Spotify Device - Host only */}
            {isHost && (
              <TouchableOpacity style={styles.manageSongsButton} onPress={() => setShowDeviceModal(true)}>
                <Text style={styles.manageSongsButtonText}>🎧 Set up Spotify Device</Text>
              </TouchableOpacity>
            )}

            {/* Game Status and Controls */}
            {currentGameSession ? (
              <View style={styles.gameSessionContainer}>
                <Text style={styles.gameSessionTitle}>🎮 Game in Progress</Text>
                <Text style={styles.gameSessionStatus}>
                  Status: {currentGameSession.state.charAt(0).toUpperCase() + currentGameSession.state.slice(1)}
                </Text>
                {isHost && (
                  <TouchableOpacity style={styles.gameControlButton}>
                    <Text style={styles.gameControlButtonText}>Game Controls</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                {/* Start Game Button - Only for host with 2+ players */}
                {isHost && currentRoom.state === 'waiting' && roomMembers.length >= 2 && (
                  <TouchableOpacity 
                    style={[styles.startGameButton, isStartingGame && styles.startGameButtonDisabled]} 
                    onPress={() => {
                      console.log('🔥 Start Game button pressed!');
                      startGame();
                    }}
                    disabled={isStartingGame}
                  >
                    <Text style={styles.startGameButtonText}>
                      {isStartingGame ? 'Starting Game...' : 'Start Game'}
                    </Text>
                  </TouchableOpacity>
                )}
                
                {/* Game Requirements Info */}
                {isHost && roomMembers.length < 2 && (
                  <View style={styles.gameRequirementsContainer}>
                    <Text style={styles.gameRequirementsText}>
                      Need at least 2 players to start the game
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Error Display */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          
          {/* Dynamic spacer to ensure scrolling works */}
          <View style={{ height: Math.max(50, height * 0.1) }} />
        </ScrollView>

        {/* Game Starting Banner */}
        {showGameStartBanner && (
          <View style={styles.gameStartBanner}>
            <View style={styles.bannerContent}>
              <Text style={styles.bannerTitle}>🎮 Game Starting!</Text>
              <Text style={styles.bannerCountdown}>{gameStartCountdown}</Text>
              <Text style={styles.bannerSubtitle}>Get ready to play Shotobump!</Text>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* Device Setup Modal */}
      <Modal
        visible={showDeviceModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDeviceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select a Spotify Device</Text>
            {deviceError && <Text style={styles.errorText}>{deviceError}</Text>}
            {devices.length === 0 ? (
              <Text style={styles.noDevicesText}>
                No devices found. Open Spotify on your phone or computer and play any song to activate a device.
              </Text>
            ) : (
              <ScrollView style={styles.devicesList}>
                {devices.map(device => (
                  <TouchableOpacity
                    key={device.id}
                    style={[
                      styles.deviceItem,
                      selectedDeviceId === device.id && styles.deviceItemSelected
                    ]}
                    onPress={() => setSelectedDeviceId(device.id)}
                  >
                    <Text style={[
                      styles.deviceText,
                      selectedDeviceId === device.id && styles.deviceTextSelected
                    ]}>
                      {device.name} ({device.type}){device.is_active ? ' - Active' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[
                styles.testButton,
                (!selectedDeviceId || isTestingPlayback) && styles.testButtonDisabled
              ]}
              onPress={handleTestPlayback}
              disabled={!selectedDeviceId || isTestingPlayback}
            >
              <Text style={styles.testButtonText}>
                {isTestingPlayback ? 'Testing...' : 'Test Playback'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowDeviceModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    height: Platform.OS === 'web' ? height - 100 : undefined, // Fixed height for web only
    flex: Platform.OS === 'web' ? undefined : 1, // Use flex for mobile
    // Explicitly set height to constrain ScrollView
  },
  scrollViewContent: {
    paddingBottom: isSmallDevice ? 30 : 20,
    minHeight: Platform.OS === 'web' ? height + 800 : height + 500, // Extra height for web
    // Remove flexGrow to allow proper scrolling
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#8B4B9B',
  },
  loadingText: {
    color: '#F5E6D3',
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isSmallDevice ? 15 : 20,
    paddingVertical: isSmallDevice ? 12 : 16,
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    borderBottomWidth: isSmallDevice ? 3 : 4,
    borderBottomColor: '#F5E6D3',
  },
  backButton: {
    width: isSmallDevice ? 45 : 50,
    height: isSmallDevice ? 45 : 50,
    backgroundColor: '#8B4B9B',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: isSmallDevice ? 22 : 25,
    borderWidth: isSmallDevice ? 2 : 3,
    borderColor: '#F5E6D3',
  },
  backButtonText: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(28),
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(22),
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  leaveButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#DC143C',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  leaveButtonText: {
    color: '#F5E6D3',
    fontSize: 16,
    fontWeight: 'bold',
  },
  roomCodeSection: {
    alignItems: 'center',
    paddingHorizontal: isSmallDevice ? 15 : 20,
    marginBottom: isSmallDevice ? 20 : 30,
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    paddingVertical: isSmallDevice ? 20 : 25,
    marginHorizontal: isSmallDevice ? 15 : 20,
    borderRadius: 25,
    borderWidth: isSmallDevice ? 3 : 4,
    borderColor: '#F5E6D3',
  },
  roomCodeLabel: {
    color: '#F5E6D3',
    fontSize: 18,
    marginBottom: 15,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  roomCodeContainer: {
    backgroundColor: '#F5E6D3',
    paddingHorizontal: 30,
    paddingVertical: 20,
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#8B4B9B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  roomCode: {
    fontSize: getResponsiveFontSize(36),
    fontWeight: 'bold',
    color: '#8B4B9B',
    letterSpacing: isSmallDevice ? 4 : 6,
  },
  copyHint: {
    fontSize: 14,
    color: '#8B4B9B',
    marginTop: 8,
    fontWeight: '600',
    opacity: 0.8,
  },
  statusSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  statusLabel: {
    color: '#F5E6D3',
    fontSize: 18,
    marginBottom: 12,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#32CD32',
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  statusText: {
    color: '#F5E6D3',
    fontSize: 16,
    fontWeight: 'bold',
  },
  membersSection: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    color: '#F5E6D3',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  refreshButton: {
    width: 40,
    height: 40,
    backgroundColor: '#8B4B9B',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  refreshButtonText: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
  },
  membersList: {
    gap: 15,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 75, 155, 0.8)',
    padding: 20,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  memberAvatar: {
    width: 60,
    height: 60,
    marginRight: 20,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F5E6D3',
  },
  memberScore: {
    fontSize: 16,
    color: '#F5E6D3',
    marginTop: 4,
    fontWeight: '600',
    opacity: 0.8,
  },
  hostBadge: {
    backgroundColor: '#F5E6D3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#8B4B9B',
  },
  hostBadgeText: {
    color: '#8B4B9B',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyStateText: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyStateSubtext: {
    color: '#F5E6D3',
    fontSize: 16,
    marginTop: 10,
    fontWeight: '600',
    opacity: 0.8,
  },
  gameControls: {
    paddingHorizontal: 20,
    marginBottom: 30,
    gap: 15,
  },
  manageSongsButton: {
    backgroundColor: '#8B4B9B',
    paddingVertical: 18,
    alignItems: 'center',
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  manageSongsButtonText: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
  },
  startGameButton: {
    backgroundColor: '#F5E6D3',
    paddingVertical: 20,
    alignItems: 'center',
    borderRadius: 30,
    borderWidth: 4,
    borderColor: '#8B4B9B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  startGameButtonText: {
    color: '#8B4B9B',
    fontSize: 20,
    fontWeight: 'bold',
  },
  startGameButtonDisabled: {
    opacity: 0.5,
  },
  gameSessionContainer: {
    backgroundColor: 'rgba(139, 75, 155, 0.6)',
    padding: 20,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  gameSessionTitle: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  gameSessionStatus: {
    color: '#F5E6D3',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 15,
    fontWeight: '600',
    opacity: 0.9,
  },
  gameControlButton: {
    backgroundColor: '#8B4B9B',
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  gameControlButtonText: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
  },
  gameRequirementsContainer: {
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    padding: 15,
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#F5E6D3',
  },
  gameRequirementsText: {
    color: '#F5E6D3',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorContainer: {
    margin: 20,
    padding: 20,
    backgroundColor: 'rgba(220, 20, 60, 0.3)',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#DC143C',
  },
  errorText: {
    color: '#F5E6D3',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: 'bold',
  },

  gameStartBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(139, 75, 155, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  bannerContent: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 30,
    borderWidth: 6,
    borderColor: '#F5E6D3',
    backgroundColor: 'rgba(139, 75, 155, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
  },
  bannerTitle: {
    color: '#F5E6D3',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 25,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 6,
  },
  bannerCountdown: {
    color: '#F5E6D3',
    fontSize: 140,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 8,
  },
  bannerSubtitle: {
    color: '#F5E6D3',
    fontSize: 20,
    marginTop: 25,
    textAlign: 'center',
    fontWeight: '600',
    opacity: 0.9,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalTitle: {
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 16,
    textAlign: 'center',
    color: '#333',
  },
  devicesList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  deviceItem: {
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginBottom: 8,
  },
  deviceItemSelected: {
    backgroundColor: '#1DB954',
  },
  deviceText: {
    color: '#333',
    fontSize: 14,
  },
  deviceTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  noDevicesText: {
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 14,
  },

  testButton: {
    backgroundColor: '#1DB954',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  testButtonDisabled: {
    backgroundColor: '#ccc',
  },
  testButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  closeButton: {
    alignItems: 'center',
    padding: 8,
  },
  closeButtonText: {
    color: '#888',
    fontSize: 16,
  },
});

export default RoomScreen; 