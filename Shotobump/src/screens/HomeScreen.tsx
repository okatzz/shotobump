import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useRoom } from '../contexts/RoomContext';

interface HomeScreenProps {
  navigation: any;
}

const { width, height } = Dimensions.get('window');
const isSmallDevice = width < 380 || height < 700;
const isLargeDevice = width > 500;

// Responsive font size function
const getResponsiveFontSize = (baseSize: number) => {
  if (isSmallDevice) return baseSize * 0.8;
  if (isLargeDevice) return baseSize * 1.1;
  return baseSize;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const [roomCode, setRoomCode] = useState('');
  const { user, signOut } = useAuth();
  const { createRoom, joinRoom, isLoading, error, clearError } = useRoom();

  const handleCreateRoom = async () => {
    clearError();
    const newRoomCode = await createRoom();
    
    if (newRoomCode) {
      navigation.navigate('Room');
    }
  };

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      Alert.alert('Error', 'Please enter a room code');
      return;
    }

    clearError();
    const success = await joinRoom(roomCode);
    
    if (success) {
      navigation.navigate('Room');
    }
  };

  const handleSignOut = async () => {
    try {
      console.log('🚪 Sign out initiated...');
      await signOut();
      console.log('✅ Sign out completed successfully');
    } catch (error) {
      console.error('❌ Sign out failed:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#D2691E', '#FF6347', '#FF8C00']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
          bounces={true}
          alwaysBounceVertical={true}
          scrollEnabled={true}
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
          overScrollMode="always"

        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.userInfo}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {user?.display_name?.charAt(0) || '?'}
                  </Text>
                </View>
              )}
              <View style={styles.userDetails}>
                <Text style={styles.welcomeText}>Welcome back,</Text>
                <Text style={styles.userName}>{user?.display_name || 'Player'}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>

          {/* Main Actions */}
          <View style={styles.actionsContainer}>
            <Text style={styles.title}>Ready to Play?</Text>
            
            {/* Create Room */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCreateRoom}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <View style={styles.buttonGradient}>
                <View style={styles.buttonContent}>
                  <Text style={styles.buttonIcon}>🎮</Text>
                  <View>
                    <Text style={styles.buttonTitle}>Create Room</Text>
                    <Text style={styles.buttonSubtitle}>
                      {isLoading ? 'Creating...' : 'Start a new game'}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            {/* Join Room */}
            <View style={styles.joinSection}>
              <Text style={styles.sectionTitle}>Join a Room</Text>
              <View style={styles.joinInputContainer}>
                <TextInput
                  style={styles.roomCodeInput}
                  placeholder="Enter room code"
                  placeholderTextColor="rgba(255, 255, 255, 0.6)"
                  value={roomCode}
                  onChangeText={setRoomCode}
                  autoCapitalize="characters"
                  maxLength={6}
                />
                <TouchableOpacity
                  style={styles.joinButton}
                  onPress={handleJoinRoom}
                  disabled={isLoading || !roomCode.trim()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.joinButtonText}>
                    {isLoading ? '...' : 'Join'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Error Display */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={clearError} style={styles.errorDismiss}>
                  <Text style={styles.errorDismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* How to Play */}
            <View style={styles.howToPlayContainer}>
              <Text style={styles.howToPlayTitle}>How to Play</Text>
              <View style={styles.steps}>
                <View style={styles.step}>
                  <Text style={styles.stepNumber}>1</Text>
                  <Text style={styles.stepText}>Create or join a room with friends</Text>
                </View>
                <View style={styles.step}>
                  <Text style={styles.stepNumber}>2</Text>
                  <Text style={styles.stepText}>Add songs to your stack from Spotify</Text>
                </View>
                <View style={styles.step}>
                  <Text style={styles.stepNumber}>3</Text>
                  <Text style={styles.stepText}>Challenge each other to guess songs</Text>
                </View>
                <View style={styles.step}>
                  <Text style={styles.stepNumber}>4</Text>
                  <Text style={styles.stepText}>Score points for correct answers</Text>
                </View>
              </View>
            </View>

            {/* Additional Info Section */}
            <View style={styles.additionalInfoContainer}>
              <Text style={styles.additionalInfoTitle}>Game Features</Text>
              <View style={styles.featuresList}>
                <View style={styles.featureItem}>
                  <Text style={styles.featureIcon}>🎵</Text>
                  <Text style={styles.featureText}>Real-time music playback</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureIcon}>🏆</Text>
                  <Text style={styles.featureText}>Score tracking and leaderboards</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureIcon}>👥</Text>
                  <Text style={styles.featureText}>Multiplayer support</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureIcon}>🎯</Text>
                  <Text style={styles.featureText}>Challenge and voting system</Text>
                </View>
              </View>
            </View>

            {/* Footer Section */}
            <View style={styles.footerContainer}>
              <Text style={styles.footerTitle}>Ready to Start?</Text>
              <Text style={styles.footerText}>
                Create a room and invite your friends to begin the ultimate music challenge!
              </Text>
              <View style={styles.footerStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>🎵</Text>
                  <Text style={styles.statLabel}>Spotify Integration</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>⚡</Text>
                  <Text style={styles.statLabel}>Real-time Sync</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>🏅</Text>
                  <Text style={styles.statLabel}>Competitive</Text>
                </View>
              </View>
            </View>
          </View>
          
          {/* Dynamic spacer to ensure scrolling works */}
          <View style={{ height: Math.max(50, height * 0.1) }} />
        </ScrollView>
      </LinearGradient>
      

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: Platform.OS === 'web' ? undefined : 1,
    height: Platform.OS === 'web' ? height : undefined, // Fixed height for web
    // Ensure gradient doesn't interfere with scrolling
  },
  scrollView: {
    height: Platform.OS === 'web' ? height - 100 : undefined, // Fixed height for web only
    flex: Platform.OS === 'web' ? undefined : 1, // Use flex for mobile
    // Explicitly set height to constrain ScrollView
  },
  content: {
    padding: isSmallDevice ? 12 : 15,
    paddingBottom: isSmallDevice ? 20 : 30,
    minHeight: Platform.OS === 'web' ? height + 800 : height + 500, // Extra height for web
    // Remove flexGrow to allow proper scrolling
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isSmallDevice ? 20 : 30,
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    padding: isSmallDevice ? 15 : 20,
    borderRadius: 25,
    borderWidth: isSmallDevice ? 3 : 4,
    borderColor: '#F5E6D3',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: isSmallDevice ? 50 : 60,
    height: isSmallDevice ? 50 : 60,
    marginRight: isSmallDevice ? 12 : 15,
    borderRadius: isSmallDevice ? 25 : 30,
    borderWidth: isSmallDevice ? 3 : 4,
    borderColor: '#F5E6D3',
  },
  avatarPlaceholder: {
    width: isSmallDevice ? 50 : 60,
    height: isSmallDevice ? 50 : 60,
    backgroundColor: '#8B4B9B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: isSmallDevice ? 12 : 15,
    borderRadius: isSmallDevice ? 25 : 30,
    borderWidth: isSmallDevice ? 3 : 4,
    borderColor: '#F5E6D3',
  },
  avatarText: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(24),
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  welcomeText: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(16),
    fontWeight: '600',
    opacity: 0.9,
  },
  userName: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(20),
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  signOutButton: {
    backgroundColor: '#DC143C',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  signOutText: {
    color: '#F5E6D3',
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionsContainer: {
    // Remove flex: 1 to allow proper scrolling
  },
  title: {
    fontSize: getResponsiveFontSize(36),
    fontWeight: 'bold',
    color: '#F5E6D3',
    textAlign: 'center',
    marginBottom: isSmallDevice ? 25 : 40,
    textShadowColor: '#8B4B9B',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 8,
    letterSpacing: isSmallDevice ? 1 : 2,
  },
  actionButton: {
    marginBottom: isSmallDevice ? 20 : 30,
    overflow: 'hidden',
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  buttonGradient: {
    backgroundColor: '#F5E6D3',
    padding: isSmallDevice ? 20 : 25,
    borderWidth: isSmallDevice ? 3 : 4,
    borderColor: '#8B4B9B',
    borderRadius: 30,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    fontSize: getResponsiveFontSize(40),
    marginRight: isSmallDevice ? 15 : 20,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  buttonTitle: {
    color: '#8B4B9B',
    fontSize: getResponsiveFontSize(24),
    fontWeight: 'bold',
  },
  buttonSubtitle: {
    color: '#8B4B9B',
    fontSize: getResponsiveFontSize(16),
    fontWeight: '600',
    opacity: 0.8,
  },
  joinSection: {
    marginBottom: isSmallDevice ? 20 : 30,
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    padding: isSmallDevice ? 15 : 20,
    borderRadius: 25,
    borderWidth: isSmallDevice ? 3 : 4,
    borderColor: '#F5E6D3',
  },
  sectionTitle: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(22),
    fontWeight: 'bold',
    marginBottom: isSmallDevice ? 15 : 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  joinInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomCodeInput: {
    flex: 1,
    backgroundColor: '#F5E6D3',
    padding: isSmallDevice ? 15 : 18,
    color: '#8B4B9B',
    fontSize: getResponsiveFontSize(18),
    marginRight: isSmallDevice ? 12 : 15,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#8B4B9B',
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: '#32CD32',
    paddingHorizontal: isSmallDevice ? 20 : 25,
    paddingVertical: isSmallDevice ? 15 : 18,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  joinButtonText: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(18),
    fontWeight: 'bold',
  },
  howToPlayContainer: {
    backgroundColor: 'rgba(139, 75, 155, 0.6)',
    padding: 25,
    borderRadius: 25,
    borderWidth: 4,
    borderColor: '#F5E6D3',
  },
  howToPlayTitle: {
    color: '#F5E6D3',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  steps: {
    gap: 15,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepNumber: {
    color: '#F5E6D3',
    fontSize: 20,
    fontWeight: 'bold',
    marginRight: 20,
    width: 35,
    height: 35,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#8B4B9B',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#F5E6D3',
    lineHeight: 30,
  },
  stepText: {
    color: '#F5E6D3',
    fontSize: 16,
    flex: 1,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: 'rgba(220, 20, 60, 0.3)',
    padding: 20,
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#DC143C',
  },
  errorText: {
    color: '#F5E6D3',
    fontSize: 16,
    marginBottom: 15,
    fontWeight: 'bold',
  },
  errorDismiss: {
    alignSelf: 'flex-end',
    backgroundColor: '#DC143C',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#F5E6D3',
  },
  errorDismissText: {
    color: '#F5E6D3',
    fontSize: 14,
    fontWeight: 'bold',
  },
  additionalInfoContainer: {
    backgroundColor: 'rgba(139, 75, 155, 0.6)',
    padding: 25,
    borderRadius: 25,
    borderWidth: 4,
    borderColor: '#F5E6D3',
    marginTop: isSmallDevice ? 20 : 30,
  },
  additionalInfoTitle: {
    color: '#F5E6D3',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  featuresList: {
    gap: 15,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    fontSize: 28,
    marginRight: 15,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  featureText: {
    color: '#F5E6D3',
    fontSize: 16,
    fontWeight: '600',
  },
  footerContainer: {
    backgroundColor: 'rgba(139, 75, 155, 0.6)',
    padding: 25,
    borderRadius: 25,
    borderWidth: 4,
    borderColor: '#F5E6D3',
    marginTop: isSmallDevice ? 20 : 30,
    alignItems: 'center',
  },
  footerTitle: {
    color: '#F5E6D3',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  footerText: {
    color: '#F5E6D3',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  footerStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 30,
    marginBottom: 5,
  },
  statLabel: {
    color: '#F5E6D3',
    fontSize: 14,
    fontWeight: '600',
  },

}); 