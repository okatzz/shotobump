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

  private async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const hashed = await sha256(codeVerifier);
    return base64encode(hashed);
  }

  async authenticate(): Promise<{ user: SpotifyUser; accessToken: string; refreshToken: string }> {
    try {
      // Check if we're handling a redirect (web only)
      const isWebBrowser = typeof window !== 'undefined' && window.location.hostname;
      if (isWebBrowser && isSpotifyRedirect()) {
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
          // Try timestamped keys as last resort
          const timestampedKeys = Object.keys(localStorage).filter(key => 
            key.startsWith('shotobump_cv_')
          );
          
          if (timestampedKeys.length > 0) {
            // Sort by timestamp (newest first) and take the most recent
            timestampedKeys.sort().reverse();
            const mostRecentKey = timestampedKeys[0];
            storedCodeVerifier = localStorage.getItem(mostRecentKey);
            console.log(`🔍 Found code verifier in timestamped key: ${mostRecentKey}`);
          }
        }
        
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
          
          console.log('✅ Spotify authentication completed successfully');
          
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
      const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);
      
      // Store code verifier with timestamp for better cleanup
      const timestamp = Date.now();
      const storageKey = `shotobump_cv_${timestamp}`;
      
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, this.codeVerifier);
        // Also store in standard location for compatibility
        localStorage.setItem('spotify_code_verifier', this.codeVerifier);
        localStorage.setItem('shotobump_code_verifier', this.codeVerifier);
        sessionStorage.setItem('spotify_code_verifier', this.codeVerifier);
        
        console.log('💾 Code verifier stored in multiple locations for reliability');
      }

      // Build authorization URL
      const redirectUri = getWebRedirectUri();
      const authUrl = new URL('https://accounts.spotify.com/authorize');
      authUrl.searchParams.set('client_id', CLIENT_ID);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('scope', 'user-read-private user-read-email user-top-read playlist-read-private user-read-playback-state user-modify-playback-state');

      console.log('🔗 Redirecting to Spotify authorization...');
      console.log('📍 Redirect URI:', redirectUri);
      
      if (typeof window !== 'undefined') {
        window.location.href = authUrl.toString();
        throw new Error('Redirecting to Spotify...');
      } else {
        throw new Error('Spotify authentication is only supported in web browsers');
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
      
      // DEBUG: Log the raw API response for diagnosis
      console.log('🟣 RAW Spotify search response:', JSON.stringify(data, null, 2));
      
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
      
      // DEBUG: Log the raw API response for diagnosis
      console.log('🟣 RAW Spotify top tracks response:', JSON.stringify(data, null, 2));
      
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
    
    // Clear all Spotify-related storage (web only)
    if (typeof window !== 'undefined') {
      // Clear localStorage
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.includes('spotify') || key.includes('shotobump_cv_') || key.includes('code_verifier')
      );
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Clear sessionStorage
      const sessionKeysToRemove = Object.keys(sessionStorage).filter(key => 
        key.includes('spotify') || key.includes('code_verifier')
      );
      sessionKeysToRemove.forEach(key => {
        sessionStorage.removeItem(key);
      });
      
      console.log('🧹 Cleared all Spotify-related storage');
    }
  }

  // Test function to verify redirect URI detection
  getRedirectUri(): string {
    if (typeof window !== 'undefined' && __DEV__) {
      return getWebRedirectUri();
    } else {
      return 'shotobump://auth';
    }
  }

  /**
   * Play a track on the user's active Spotify device (requires Premium)
   * @param trackUri - The Spotify track URI (e.g., 'spotify:track:4iz9lGMjU1lXS51oPmUmTe')
   * @param positionMs - Optional: start position in ms
   * @param deviceId - Optional: Spotify device ID to target
   */
  async playTrackOnActiveDevice(trackUri: string, positionMs: number = 0, deviceId?: string): Promise<void> {
    if (!this.accessToken) throw new Error('Not authenticated with Spotify');
    if (!trackUri) throw new Error('No track URI provided');

    let endpoint = 'https://api.spotify.com/v1/me/player/play';
    if (deviceId) {
      endpoint += `?device_id=${deviceId}`;
    }
    const body = JSON.stringify({ uris: [trackUri], position_ms: positionMs });

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (response.status === 404) {
      throw new Error('No active Spotify device found. Please open the Spotify app and start playing any song, then try again.');
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to play track: ${response.status} - ${errorText}`);
    }
    console.log('✅ Track playback started on active Spotify device.');
  }

  /**
   * Fetch the user's available Spotify devices
   * @returns Array of devices
   */
  async getAvailableDevices(): Promise<any[]> {
    if (!this.accessToken) throw new Error('Not authenticated with Spotify');
    const endpoint = 'https://api.spotify.com/v1/me/player/devices';
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      if (response.status === 401) {
        await this.refreshAccessToken();
        return this.getAvailableDevices();
      }
      throw new Error(`Failed to fetch devices: ${response.status}`);
    }
    const data = await response.json();
    return data.devices || [];
  }

  /**
   * Pause playback on the user's active Spotify device
   */
  async pausePlayback(deviceId?: string): Promise<void> {
    if (!this.accessToken) throw new Error('Not authenticated with Spotify');
    
    let endpoint = 'https://api.spotify.com/v1/me/player/pause';
    if (deviceId) {
      endpoint += `?device_id=${deviceId}`;
    }

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      console.log('No active Spotify device found to pause.');
      return;
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to pause playback: ${response.status} - ${errorText}`);
    }
    console.log('✅ Spotify playback paused.');
  }
} 