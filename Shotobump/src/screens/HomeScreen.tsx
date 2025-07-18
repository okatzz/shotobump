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

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    );
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
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={true}
          alwaysBounceVertical={true}
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
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: isSmallDevice ? 12 : 15,
    paddingBottom: isSmallDevice ? 20 : 30,
    minHeight: height + 100, // Ensure content can scroll
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    padding: 20,
    borderRadius: 25,
    borderWidth: 4,
    borderColor: '#F5E6D3',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 60,
    height: 60,
    marginRight: 15,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: '#F5E6D3',
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    backgroundColor: '#8B4B9B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: '#F5E6D3',
  },
  avatarText: {
    color: '#F5E6D3',
    fontSize: 24,
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  welcomeText: {
    color: '#F5E6D3',
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.9,
  },
  userName: {
    color: '#F5E6D3',
    fontSize: 20,
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
    flex: 1,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#F5E6D3',
    textAlign: 'center',
    marginBottom: 40,
    textShadowColor: '#8B4B9B',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 8,
    letterSpacing: 2,
  },
  actionButton: {
    marginBottom: 30,
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
    padding: 25,
    borderWidth: 4,
    borderColor: '#8B4B9B',
    borderRadius: 30,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    fontSize: 40,
    marginRight: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  buttonTitle: {
    color: '#8B4B9B',
    fontSize: 24,
    fontWeight: 'bold',
  },
  buttonSubtitle: {
    color: '#8B4B9B',
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.8,
  },
  joinSection: {
    marginBottom: 30,
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    padding: 20,
    borderRadius: 25,
    borderWidth: 4,
    borderColor: '#F5E6D3',
  },
  sectionTitle: {
    color: '#F5E6D3',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
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
    padding: 18,
    color: '#8B4B9B',
    fontSize: 18,
    marginRight: 15,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#8B4B9B',
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: '#32CD32',
    paddingHorizontal: 25,
    paddingVertical: 18,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  joinButtonText: {
    color: '#F5E6D3',
    fontSize: 18,
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
}); 