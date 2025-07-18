import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { RoomProvider } from './src/contexts/RoomContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import RoomScreen from './src/screens/RoomScreen';
import SongStackScreen from './src/screens/SongStackScreen';
import GameplayScreen from './src/screens/GameplayScreen';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

const Stack = createStackNavigator();
const queryClient = new QueryClient();

function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  console.log('🔍 AppNavigator state:', { isAuthenticated, isLoading });

  if (isLoading) {
    console.log('⏳ Showing loading screen...');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1DB954" />
      </View>
    );
  }

  console.log('🎯 Navigation decision:', isAuthenticated ? 'Authenticated screens' : 'Login screen');
  
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Room" component={RoomScreen} />
            <Stack.Screen name="SongStack" component={SongStackScreen} />
            <Stack.Screen name="Gameplay" component={GameplayScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RoomProvider>
          <AppNavigator />
          <StatusBar style="light" />
        </RoomProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1DB954',
  },
});
