import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  SafeAreaView,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';

const { width, height } = Dimensions.get('window');
const isSmallDevice = width < 380 || height < 700;
const isLargeDevice = width > 500;

// Responsive font size function
const getResponsiveFontSize = (baseSize: number) => {
  if (isSmallDevice) return baseSize * 0.8;
  if (isLargeDevice) return baseSize * 1.1;
  return baseSize;
};

export const LoginScreen: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signInAsMockUser } = useAuth();

  const handleSpotifyLogin = async () => {
    try {
      setIsLoading(true);
      await signIn();
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert(
        'Login Failed',
        'Unable to connect to Spotify. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleMockLogin = async (userNumber: number) => {
    try {
      setIsLoading(true);
      await signInAsMockUser(userNumber);
    } catch (error) {
      console.error('Mock login error:', error);
      Alert.alert(
        'Mock Login Failed',
        'Unable to sign in as mock user. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
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
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
          bounces={true}
          alwaysBounceVertical={true}
          scrollEnabled={true}
          nestedScrollEnabled={true}
        >
          {/* Logo and Title */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>🎵</Text>
            </View>
            <Text style={styles.title}>Shotobump</Text>
            <Text style={styles.subtitle}>
              The Ultimate Music Recognition Game
            </Text>
          </View>

          {/* Features */}
          <View style={styles.featuresContainer}>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>🎯</Text>
              <Text style={styles.featureText}>Challenge Friends</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>⏱️</Text>
              <Text style={styles.featureText}>Fast-Paced Rounds</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>🏆</Text>
              <Text style={styles.featureText}>Competitive Scoring</Text>
            </View>
          </View>

          {/* Login Button */}
          <View style={styles.loginContainer}>
            <TouchableOpacity
              style={styles.spotifyButton}
              onPress={handleSpotifyLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                <Text style={styles.spotifyIcon}>♪</Text>
                <Text style={styles.buttonText}>
                  {isLoading ? 'Connecting...' : 'Continue with Spotify'}
                </Text>
              </View>
            </TouchableOpacity>
            
            <Text style={styles.disclaimer}>
              Connect your Spotify account to start playing with friends
            </Text>

            {/* Development Mock Users */}
            {__DEV__ && (
              <View style={styles.mockUsersContainer}>
                <Text style={styles.mockUsersTitle}>Development Only</Text>
                <View style={styles.mockUsersRow}>
                  <TouchableOpacity
                    style={styles.mockUserButton}
                    onPress={() => handleMockLogin(1)}
                    disabled={isLoading}
                  >
                    <Text style={styles.mockUserText}>Player 1</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.mockUserButton}
                    onPress={() => handleMockLogin(2)}
                    disabled={isLoading}
                  >
                    <Text style={styles.mockUserText}>Player 2</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.mockUserButton}
                    onPress={() => handleMockLogin(3)}
                    disabled={isLoading}
                  >
                    <Text style={styles.mockUserText}>Player 3</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
  content: {
    paddingHorizontal: isSmallDevice ? 20 : 30,
    paddingVertical: isSmallDevice ? 20 : 40,
    minHeight: Platform.OS === 'web' ? height + 800 : height + 500, // Extra height for web
    // Remove flexGrow to allow proper scrolling
  },
  header: {
    alignItems: 'center',
    marginTop: isSmallDevice ? 20 : height * 0.05,
  },
  logoContainer: {
    width: isSmallDevice ? 100 : isLargeDevice ? 160 : 140,
    height: isSmallDevice ? 100 : isLargeDevice ? 160 : 140,
    backgroundColor: '#8B4B9B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: isSmallDevice ? 20 : 30,
    borderRadius: isSmallDevice ? 50 : isLargeDevice ? 80 : 70,
    borderWidth: isSmallDevice ? 4 : 6,
    borderColor: '#F5E6D3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  logoText: {
    fontSize: isSmallDevice ? 50 : isLargeDevice ? 80 : 70,
    color: '#F5E6D3',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  title: {
    fontSize: getResponsiveFontSize(48),
    fontWeight: 'bold',
    color: '#F5E6D3',
    marginBottom: isSmallDevice ? 10 : 15,
    textAlign: 'center',
    letterSpacing: isSmallDevice ? 2 : 3,
    textShadowColor: '#8B4B9B',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: getResponsiveFontSize(20),
    color: '#F5E6D3',
    textAlign: 'center',
    fontWeight: '600',
    textShadowColor: 'rgba(139, 75, 155, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  featuresContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: isSmallDevice ? 30 : 50,
    backgroundColor: 'rgba(139, 75, 155, 0.3)',
    paddingVertical: isSmallDevice ? 20 : 30,
    borderRadius: 25,
    borderWidth: isSmallDevice ? 3 : 4,
    borderColor: '#F5E6D3',
  },
  feature: {
    alignItems: 'center',
    flex: 1,
  },
  featureIcon: {
    fontSize: getResponsiveFontSize(40),
    marginBottom: isSmallDevice ? 8 : 12,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  featureText: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(16),
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  loginContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  spotifyButton: {
    backgroundColor: '#F5E6D3',
    paddingVertical: isSmallDevice ? 16 : 20,
    paddingHorizontal: isSmallDevice ? 30 : 40,
    width: isSmallDevice ? width * 0.9 : width * 0.8,
    borderRadius: 50,
    borderWidth: isSmallDevice ? 3 : 4,
    borderColor: '#8B4B9B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotifyIcon: {
    fontSize: getResponsiveFontSize(28),
    color: '#8B4B9B',
    marginRight: isSmallDevice ? 10 : 15,
    fontWeight: 'bold',
  },
  buttonText: {
    color: '#8B4B9B',
    fontSize: getResponsiveFontSize(20),
    fontWeight: 'bold',
  },
  disclaimer: {
    color: '#F5E6D3',
    fontSize: getResponsiveFontSize(16),
    textAlign: 'center',
    marginTop: isSmallDevice ? 20 : 25,
    paddingHorizontal: isSmallDevice ? 15 : 20,
    lineHeight: isSmallDevice ? 20 : 22,
    fontWeight: '600',
    textShadowColor: 'rgba(139, 75, 155, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  mockUsersContainer: {
    marginTop: 40,
    alignItems: 'center',
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    padding: 20,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  mockUsersTitle: {
    color: '#F5E6D3',
    fontSize: 14,
    marginBottom: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  mockUsersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
  },
  mockUserButton: {
    backgroundColor: '#8B4B9B',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  mockUserText: {
    color: '#F5E6D3',
    fontSize: 14,
    fontWeight: 'bold',
  },
}); 