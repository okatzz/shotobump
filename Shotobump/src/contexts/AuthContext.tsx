import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, SpotifyUser } from '../types';
import { SpotifyService } from '../services/spotify';
import { supabase } from '../services/supabase';
import { isSpotifyRedirect } from '../utils/redirectHandler';

interface AuthContextType {
  user: User | null;
  isPremium: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signInAsMockUser: (userNumber?: number) => Promise<void>;
  signOut: () => Promise<void>;
  refreshTokens: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const redirectHandledRef = useRef(false);
  const initialLoadCompleteRef = useRef(false);

  const spotifyService = SpotifyService.getInstance();

  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Handle Spotify redirect on page load (web only)
  useEffect(() => {
    const isWebBrowser = typeof window !== 'undefined' && window.location.hostname;
    const hasRedirect = isWebBrowser ? isSpotifyRedirect() : false;
    
    console.log('🔍 AuthContext redirect check:', {
      isWebBrowser,
      hasRedirect,
      isAuthenticated,
      isLoading,
      redirectHandled: redirectHandledRef.current,
      initialLoadComplete: initialLoadCompleteRef.current,
      url: typeof window !== 'undefined' ? window.location.href : 'N/A',
      search: typeof window !== 'undefined' ? window.location.search : 'N/A'
    });
    
    // Handle Spotify redirect - this should happen regardless of current auth state
    // But only after initial load is complete
    if (isWebBrowser && hasRedirect && !isLoading && !redirectHandledRef.current && initialLoadCompleteRef.current) {
      console.log('🔄 Spotify redirect detected, attempting sign in...');
      redirectHandledRef.current = true;
      signIn().catch(error => {
        console.error('Auto sign-in from redirect failed:', error);
        redirectHandledRef.current = false; // Reset on error
        setIsLoading(false); // Ensure loading is set to false on error
      });
    } else if (isWebBrowser && hasRedirect) {
      console.log('⚠️ Redirect detected but conditions not met:', {
        isLoading,
        redirectHandled: redirectHandledRef.current,
        initialLoadComplete: initialLoadCompleteRef.current
      });
    }
  }, [isLoading]); // Only depend on isLoading, not isAuthenticated

  const loadStoredAuth = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user');
      const storedAccessToken = await AsyncStorage.getItem('spotify_access_token');
      const storedRefreshToken = await AsyncStorage.getItem('spotify_refresh_token');

      if (storedUser && storedAccessToken) {
        const userData: User = JSON.parse(storedUser);
        setUser(userData);
        setIsAuthenticated(true);
        
        // Set tokens in Spotify service
        spotifyService.setTokens(storedAccessToken, storedRefreshToken || undefined);
        
        // Try to refresh tokens to ensure they're valid
        try {
          await spotifyService.refreshAccessToken();
          console.log('✅ Stored authentication restored successfully');
        } catch (error) {
          console.log('⚠️ Token refresh failed, user needs to re-authenticate');
          await signOut();
        }
      } else {
        console.log('ℹ️ No stored authentication found');
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
    } finally {
      setIsLoading(false);
      initialLoadCompleteRef.current = true; // Mark initial load as complete
    }
  };

  const signIn = async () => {
    try {
      setIsLoading(true);
      
      // Authenticate with Spotify
      const { user: spotifyUser, accessToken, refreshToken } = await spotifyService.authenticate();
      
      // Store premium status
      setIsPremium(spotifyUser.product === 'premium');
      
      // Check if user exists in our database (skip if using placeholder Supabase)
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const isUsingRealSupabase = supabaseUrl && !supabaseUrl.includes('placeholder');
      
      let existingUser = null;
      
      if (isUsingRealSupabase) {
        let { data, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('spotify_id', spotifyUser.id)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          throw fetchError;
        }
        
        existingUser = data;
      }

      let userData: User;

      if (isUsingRealSupabase) {
        if (existingUser) {
          // Update existing user
          const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({
              display_name: spotifyUser.display_name,
              avatar_url: spotifyUser.images[0]?.url || null,
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            .eq('id', existingUser.id)
            .select()
            .single();

          if (updateError) throw updateError;
          userData = updatedUser;
        } else {
          // Create new user
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
              spotify_id: spotifyUser.id,
              display_name: spotifyUser.display_name,
              avatar_url: spotifyUser.images[0]?.url || null,
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            .select()
            .single();

          if (insertError) throw insertError;
          userData = newUser;
        }
      } else {
        // Create mock user data for development
        console.log('📝 Using mock user data (Supabase not configured)');
        userData = {
          id: `mock-${spotifyUser.id}`,
          spotify_id: spotifyUser.id,
          display_name: spotifyUser.display_name,
          avatar_url: spotifyUser.images[0]?.url || undefined,
          access_token: accessToken,
          refresh_token: refreshToken || undefined,
          created_at: new Date().toISOString(),
        };
      }

      // Store in AsyncStorage
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      await AsyncStorage.setItem('spotify_access_token', accessToken);
      if (refreshToken) {
        await AsyncStorage.setItem('spotify_refresh_token', refreshToken);
      }

      setUser(userData);
      setIsAuthenticated(true);
      
      console.log('✅ User successfully authenticated:', userData.display_name);
    } catch (error) {
      console.error('Sign in error:', error);
      
      // Don't throw error if it's just a redirect message (web only)
      if (error instanceof Error && error.message === 'Redirecting to Spotify...') {
        console.log('🔄 Redirecting to Spotify for authentication...');
        // Keep loading state during redirect, don't set loading to false
        return;
      }
      
      // Handle code verifier lost error gracefully
      if (error instanceof Error && error.message.includes('Code verifier was lost')) {
        console.log('🔄 Code verifier lost, user needs to try again...');
        setIsLoading(false);
        return; // Don't throw, just show login screen again
      }
      
      // Handle other authentication errors
      setIsLoading(false);
      throw error;
    } finally {
      // Only set loading to false if we're not redirecting
      const isWebBrowser = typeof window !== 'undefined' && window.location.hostname;
      const hasRedirectCode = isWebBrowser && window.location.search.includes('code=');
      
      if (!hasRedirectCode) {
        setIsLoading(false);
      } else {
        console.log('🔄 Keeping loading state during redirect...');
      }
    }
  };



  const signOut = async () => {
    try {
      console.log('🚪 AuthContext signOut started...');
      setIsLoading(true);
      
      // Clear AsyncStorage
      console.log('🧹 Clearing AsyncStorage...');
      await AsyncStorage.multiRemove([
        'user',
        'spotify_access_token',
        'spotify_refresh_token',
      ]);
      console.log('✅ AsyncStorage cleared');
      
      // Clear Spotify service tokens
      console.log('🧹 Clearing Spotify service tokens...');
      spotifyService.clearTokens();
      console.log('✅ Spotify service tokens cleared');
      
      // Reset redirect handled flag
      console.log('🔄 Resetting redirect flags...');
      redirectHandledRef.current = false;
      
      // Update state
      console.log('🔄 Updating authentication state...');
      setUser(null);
      setIsAuthenticated(false);
      
      console.log('✅ User signed out successfully');
    } catch (error) {
      console.error('❌ Sign out error:', error);
      throw error; // Re-throw to let the calling function handle it
    } finally {
      console.log('🏁 Setting loading to false...');
      setIsLoading(false);
    }
  };

  // Cleanup effect to reset redirect flag when component unmounts
  useEffect(() => {
    return () => {
      redirectHandledRef.current = false;
      initialLoadCompleteRef.current = false;
    };
  }, []);

  const refreshTokens = async () => {
    try {
      const newAccessToken = await spotifyService.refreshAccessToken();
      
      // Update stored token
      await AsyncStorage.setItem('spotify_access_token', newAccessToken);
      
      // Update user in database
      if (user) {
        await supabase
          .from('users')
          .update({ access_token: newAccessToken })
          .eq('id', user.id);
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      // If refresh fails, sign out user
      await signOut();
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isPremium,
    isLoading,
    isAuthenticated,
    signIn,
    signInAsMockUser: async (userNumber: number = 1) => {
      try {
        setIsLoading(true);
        
        const mockUsers = [
          {
            id: `11111111-1111-1111-1111-111111111111`,
            spotify_id: `mock-spotify-1`,
            display_name: `Test Player 1`,
            avatar_url: `https://via.placeholder.com/150/FF6B6B/FFFFFF?text=P1`,
            access_token: `mock-access-token-1`,
            refresh_token: `mock-refresh-token-1`,
            created_at: new Date().toISOString(),
          },
          {
            id: `22222222-2222-2222-2222-222222222222`,
            spotify_id: `mock-spotify-2`,
            display_name: `Test Player 2`,
            avatar_url: `https://via.placeholder.com/150/4ECDC4/FFFFFF?text=P2`,
            access_token: `mock-access-token-2`,
            refresh_token: `mock-refresh-token-2`,
            created_at: new Date().toISOString(),
          },
          {
            id: `33333333-3333-3333-3333-333333333333`,
            spotify_id: `mock-spotify-3`,
            display_name: `Test Player 3`,
            avatar_url: `https://via.placeholder.com/150/45B7D1/FFFFFF?text=P3`,
            access_token: `mock-access-token-3`,
            refresh_token: `mock-refresh-token-3`,
            created_at: new Date().toISOString(),
          },
        ];
        
        const userData = mockUsers[userNumber - 1] || mockUsers[0];
        
        // Check if we're using real Supabase and create/update the user
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const isUsingRealSupabase = supabaseUrl && !supabaseUrl.includes('placeholder');
        
        if (isUsingRealSupabase) {
          // Check if user exists in database
          let { data: existingUser, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userData.id)
            .single();

          if (fetchError && fetchError.code !== 'PGRST116') {
            throw fetchError;
          }

          if (!existingUser) {
            // Create the mock user in the database
            const { error: insertError } = await supabase
              .from('users')
              .insert({
                id: userData.id,
                spotify_id: userData.spotify_id,
                display_name: userData.display_name,
                avatar_url: userData.avatar_url,
                access_token: userData.access_token,
                refresh_token: userData.refresh_token,
              });

            if (insertError) {
              console.error('Error creating mock user in database:', insertError);
              throw insertError;
            }
            
            console.log('✅ Mock user created in database:', userData.display_name);
          } else {
            console.log('✅ Mock user already exists in database:', userData.display_name);
          }
        }
        
        // Store in AsyncStorage
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        await AsyncStorage.setItem('spotify_access_token', userData.access_token);
        await AsyncStorage.setItem('spotify_refresh_token', userData.refresh_token || '');
        
        setUser(userData);
        setIsAuthenticated(true);
        
        console.log('🎭 Signed in as mock user:', userData.display_name);
      } catch (error) {
        console.error('Mock sign in error:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    signOut,
    refreshTokens,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 