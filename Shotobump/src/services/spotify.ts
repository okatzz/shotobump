import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { SpotifyUser, SpotifyTrack, SpotifySearchResponse } from '../types';
import { getWebRedirectUri, logRedirectUriInfo } from '../utils/portDetection';
import { handleSpotifyRedirect, isSpotifyRedirect } from '../utils/redirectHandler';

// Only call maybeCompleteAuthSession on mobile (not web)
if (typeof window === 'undefined') {
  WebBrowser.maybeCompleteAuthSession();
}

// Spotify OAuth configuration
const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || 'YOUR_SPOTIFY_CLIENT_ID';
const SCOPES = [
  'user-read-email',
  'user-read-private',
  'user-library-read',
  'user-top-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
];

// Generate a random string for PKCE
const generateRandomString = (length: number): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
};

// Create code challenge for PKCE
const sha256 = async (plain: string): Promise<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest('SHA-256', data);
};

const base64encode = (input: ArrayBuffer): string => {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

export class SpotifyService {
  private static instance: SpotifyService;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private codeVerifier: string | null = null;

  static getInstance(): SpotifyService {
    if (!SpotifyService.instance) {
      SpotifyService.instance = new SpotifyService();
    }
    return SpotifyService.instance;
  }

  async authenticate(): Promise<{ user: SpotifyUser; accessToken: string; refreshToken: string }> {
    try {
      // Check if we're handling a redirect (web only)
      if (typeof window !== 'undefined' && __DEV__ && isSpotifyRedirect()) {
        console.log('🔄 Handling Spotify redirect...');
        
        // Clear any old tokens that might be confusing the process
        const oldTokenKeys = Object.keys(localStorage).filter(key => 
          key.includes('spotify') && key.includes('token')
        );
        oldTokenKeys.forEach(key => {
          console.log(`🧹 Removing old token: ${key}`);
          localStorage.removeItem(key);
        });
        
        const code = handleSpotifyRedirect();
        
        // Retrieve code verifier from localStorage
        let storedCodeVerifier = localStorage.getItem('spotify_code_verifier');
        
        // If not found, try alternative storage approaches
        if (!storedCodeVerifier) {
          // Try sessionStorage
          storedCodeVerifier = sessionStorage.getItem('spotify_code_verifier');
          if (storedCodeVerifier) {
            console.log('🔍 Found code verifier in sessionStorage');
          }
        }
        
        if (!storedCodeVerifier) {
          // Try backup localStorage keys
          const backupKeys = ['shotobump_code_verifier'];
          for (const key of backupKeys) {
            const value = localStorage.getItem(key);
            if (value) {
              console.log(`🔍 Found code verifier in backup key: ${key}`);
              storedCodeVerifier = value;
              break;
            }
          }
        }
        
        if (!storedCodeVerifier) {
          // Try to find it in specific code verifier keys only
          const possibleKeys = Object.keys(localStorage).filter(key => 
            (key.includes('code_verifier') || key.includes('cv_')) &&
            !key.includes('token') && !key.includes('access') && !key.includes('refresh')
          );
          
          for (const key of possibleKeys) {
            const value = localStorage.getItem(key);
            if (value && value.length > 40) { // Code verifiers are typically 43+ chars
              console.log(`🔍 Found potential code verifier in key: ${key}`);
              storedCodeVerifier = value;
              break;
            }
          }
        }
        
        console.log('🔍 Debug info:');
        console.log('   Authorization code:', code ? 'Present' : 'Missing');
        console.log('   Stored code verifier:', storedCodeVerifier ? 'Present' : 'Missing');
        console.log('   localStorage keys:', Object.keys(localStorage));
        console.log('   All localStorage data:', localStorage);
        
        // Try to find any key that might contain our code verifier
        const allKeys = Object.keys(localStorage);
        const spotifyKeys = allKeys.filter(key => key.includes('spotify') || key.includes('code'));
        console.log('   Spotify-related keys:', spotifyKeys);
        spotifyKeys.forEach(key => {
          console.log(`   ${key}:`, localStorage.getItem(key)?.substring(0, 20) + '...');
        });
        
        if (code && storedCodeVerifier) {
          this.codeVerifier = storedCodeVerifier;
          console.log('✅ Both code and verifier found, proceeding with token exchange...');
          
          // Exchange code for tokens
          const redirectUri = getWebRedirectUri();
          const tokenResponse = await this.exchangeCodeForTokens(code, redirectUri);
          
          // Clean up all stored code verifiers
          const keysToClean = [
            'spotify_code_verifier',
            'shotobump_code_verifier'
          ];
          
          keysToClean.forEach(key => {
            localStorage.removeItem(key);
          });
          
          // Clean up sessionStorage
          sessionStorage.removeItem('spotify_code_verifier');
          
          // Clean up timestamped keys
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('shotobump_cv_')) {
              localStorage.removeItem(key);
            }
          });
          
          console.log('🧹 Cleaned up all code verifier storage');
          
          this.accessToken = tokenResponse.access_token;
          this.refreshToken = tokenResponse.refresh_token || null;

          // Get user profile
          const user = await this.getCurrentUser();
          
          return {
            user,
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token || '',
          };
        } else {
          console.log('❌ Missing code verifier, clearing URL and showing login button again...');
          
          // Clean up the URL
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
          
          throw new Error('Code verifier was lost. Please try signing in again.');
        }
      }

      // Generate PKCE parameters
      this.codeVerifier = generateRandomString(64);
      const hashed = await sha256(this.codeVerifier);
      const codeChallenge = base64encode(hashed);

      // Store code verifier for web redirect (localStorage is web-only)
      if (typeof window !== 'undefined' && __DEV__) {
        // Store in multiple keys as backup
        const keys = [
          'spotify_code_verifier',
          'shotobump_code_verifier',
          `shotobump_cv_${Date.now()}`
        ];
        
                 keys.forEach(key => {
           localStorage.setItem(key, this.codeVerifier!);
         });
        
                 // Also store in sessionStorage as backup
         sessionStorage.setItem('spotify_code_verifier', this.codeVerifier!);
        
        console.log('💾 Stored code verifier in multiple locations:', this.codeVerifier.substring(0, 10) + '...');
        console.log('💾 Verification - localStorage:', localStorage.getItem('spotify_code_verifier') ? 'Yes' : 'No');
        console.log('💾 Verification - sessionStorage:', sessionStorage.getItem('spotify_code_verifier') ? 'Yes' : 'No');
      }

      // Determine redirect URI based on environment
      let redirectUri: string;
      
      if (typeof window !== 'undefined' && __DEV__) {
        // Web development - use 127.0.0.1 with current port (Spotify allows this)
        redirectUri = getWebRedirectUri();
        logRedirectUriInfo();
      } else {
        // Mobile/production - use custom scheme
        redirectUri = 'shotobump://auth';
        console.log('📱 Mobile mode - using custom scheme redirect URI:', redirectUri);
      }
      
      console.log('Redirect URI:', redirectUri);

      // Build authorization URL
      const authUrl = new URL('https://accounts.spotify.com/authorize');
      authUrl.searchParams.append('client_id', CLIENT_ID);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('redirect_uri', redirectUri);
      authUrl.searchParams.append('code_challenge_method', 'S256');
      authUrl.searchParams.append('code_challenge', codeChallenge);
      authUrl.searchParams.append('scope', SCOPES.join(' '));

      console.log('Auth URL:', authUrl.toString());

      if (typeof window !== 'undefined' && __DEV__) {
        // Web environment - redirect directly
        console.log('🌐 Web environment - redirecting to Spotify...');
        window.location.href = authUrl.toString();
        
        // This will cause a page redirect, so we won't reach the return statement
        // The actual token exchange will happen when the user is redirected back
        throw new Error('Redirecting to Spotify...');
      } else {
        // Mobile environment - use WebBrowser
        console.log('📱 Mobile environment - opening auth session...');
        const result = await WebBrowser.openAuthSessionAsync(
          authUrl.toString(),
          redirectUri
        );

        if (result.type === 'success') {
          const url = new URL(result.url);
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            throw new Error(`Spotify auth error: ${error}`);
          }

          if (!code) {
            throw new Error('No authorization code received');
          }

          // Exchange code for tokens
          const tokenResponse = await this.exchangeCodeForTokens(code, redirectUri);
          
          this.accessToken = tokenResponse.access_token;
          this.refreshToken = tokenResponse.refresh_token || null;

          // Get user profile
          const user = await this.getCurrentUser();
          
          return {
            user,
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token || '',
          };
        } else if (result.type === 'cancel') {
          throw new Error('Authentication was cancelled');
        } else {
          throw new Error('Authentication failed');
        }
      }
    } catch (error) {
      console.error('Spotify authentication error:', error);
      throw error;
    }
  }

  private async exchangeCodeForTokens(code: string, redirectUri: string) {
    if (!this.codeVerifier) {
      throw new Error('Code verifier not available');
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: this.codeVerifier,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Token exchange failed: ${errorData}`);
    }

    return response.json();
  }

  async getCurrentUser(): Promise<SpotifyUser> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, try to refresh
        try {
          await this.refreshAccessToken();
          return this.getCurrentUser();
        } catch (refreshError) {
          throw new Error('Authentication expired. Please sign in again.');
        }
      }
      throw new Error('Failed to fetch user profile');
    }

    return response.json();
  }

  async searchTracks(query: string, limit: number = 20): Promise<SpotifyTrack[]> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Spotify');
    }

    if (!query.trim()) {
      return [];
    }

    try {
      console.log('🔍 Searching Spotify for:', query);
      
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&market=US`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try to refresh
          await this.refreshAccessToken();
          // Retry the search with new token
          return this.searchTracks(query, limit);
        }
        throw new Error(`Spotify search failed: ${response.status}`);
      }

      const data: SpotifySearchResponse = await response.json();
      
      console.log('✅ Spotify search results:', data.tracks.items.length, 'tracks found');
      
      return data.tracks.items.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists,
        album: track.album,
        preview_url: track.preview_url,
        external_urls: track.external_urls,
        duration_ms: track.duration_ms,
        popularity: track.popularity,
        explicit: track.explicit,
      }));
    } catch (error) {
      console.error('Spotify search error:', error);
      throw error;
    }
  }

  async getTrack(trackId: string): Promise<SpotifyTrack> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Spotify');
    }

    try {
      console.log('🎵 Fetching Spotify track:', trackId);
      
      const response = await fetch(
        `https://api.spotify.com/v1/tracks/${trackId}?market=US`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try to refresh
          await this.refreshAccessToken();
          // Retry with new token
          return this.getTrack(trackId);
        }
        throw new Error(`Failed to fetch track: ${response.status}`);
      }

      const track = await response.json();
      
      console.log('✅ Spotify track fetched:', track.name);
      
      return {
        id: track.id,
        name: track.name,
        artists: track.artists,
        album: track.album,
        preview_url: track.preview_url,
        external_urls: track.external_urls,
        duration_ms: track.duration_ms,
        popularity: track.popularity,
        explicit: track.explicit,
      };
    } catch (error) {
      console.error('Error fetching Spotify track:', error);
      throw error;
    }
  }

  async getUserTopTracks(limit: number = 20, timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term'): Promise<SpotifyTrack[]> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Spotify');
    }

    try {
      console.log('🔥 Fetching user top tracks...');
      
      const response = await fetch(
        `https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${timeRange}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          await this.refreshAccessToken();
          return this.getUserTopTracks(limit, timeRange);
        }
        throw new Error(`Failed to fetch top tracks: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('✅ User top tracks fetched:', data.items.length, 'tracks');
      
      return data.items.map((track: any) => ({
        id: track.id,
        name: track.name,
        artists: track.artists,
        album: track.album,
        preview_url: track.preview_url,
        external_urls: track.external_urls,
        duration_ms: track.duration_ms,
        popularity: track.popularity,
        explicit: track.explicit,
      }));
    } catch (error) {
      console.error('Error fetching user top tracks:', error);
      throw error;
    }
  }

  async getUserPlaylists(limit: number = 20): Promise<Array<{
    id: string;
    name: string;
    description: string;
    images: Array<{ url: string }>;
    tracks: { total: number };
    external_urls: { spotify: string };
  }>> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Spotify');
    }

    try {
      console.log('📋 Fetching user playlists...');
      
      const response = await fetch(
        `https://api.spotify.com/v1/me/playlists?limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          await this.refreshAccessToken();
          return this.getUserPlaylists(limit);
        }
        throw new Error(`Failed to fetch playlists: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('✅ User playlists fetched:', data.items.length, 'playlists');
      
      return data.items.map((playlist: any) => ({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || '',
        images: playlist.images || [],
        tracks: playlist.tracks,
        external_urls: playlist.external_urls,
      }));
    } catch (error) {
      console.error('Error fetching user playlists:', error);
      throw error;
    }
  }

  async getPlaylistTracks(playlistId: string, limit: number = 50): Promise<SpotifyTrack[]> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Spotify');
    }

    try {
      console.log('🎵 Fetching playlist tracks for:', playlistId);
      
      const response = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&market=US`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          await this.refreshAccessToken();
          return this.getPlaylistTracks(playlistId, limit);
        }
        throw new Error(`Failed to fetch playlist tracks: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('✅ Playlist tracks fetched:', data.items.length, 'tracks');
      
      return data.items
        .filter((item: any) => item.track && item.track.type === 'track')
        .map((item: any) => ({
          id: item.track.id,
          name: item.track.name,
          artists: item.track.artists,
          album: item.track.album,
          preview_url: item.track.preview_url,
          external_urls: item.track.external_urls,
          duration_ms: item.track.duration_ms,
          popularity: item.track.popularity,
          explicit: item.track.explicit,
        }));
    } catch (error) {
      console.error('Error fetching playlist tracks:', error);
      throw error;
    }
  }

  async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: CLIENT_ID,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }

    return data.access_token;
  }

  setTokens(accessToken: string, refreshToken?: string) {
    this.accessToken = accessToken;
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.codeVerifier = null;
  }

  // Test function to verify redirect URI detection
  getRedirectUri(): string {
    if (typeof window !== 'undefined' && __DEV__) {
      return getWebRedirectUri();
    } else {
      return 'shotobump://auth';
    }
  }
} 