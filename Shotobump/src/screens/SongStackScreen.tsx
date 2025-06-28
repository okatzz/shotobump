import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { SpotifyService } from '../services/spotify';
import { SongStackService, UserSongStack } from '../services/songStackService';
import { SpotifyTrack } from '../types';
import { useRoom } from '../contexts/RoomContext';
import { Audio } from 'expo-av';

interface SongStackScreenProps {
  navigation: any;
}

type TabType = 'search' | 'top_tracks' | 'playlists';

const SongStackScreen: React.FC<SongStackScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const { currentRoom } = useRoom();
  const [activeTab, setActiveTab] = useState<TabType>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<any>(null);
  const [userSongs, setUserSongs] = useState<UserSongStack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTopTracks, setIsLoadingTopTracks] = useState(false);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [showOnlyWithPreview, setShowOnlyWithPreview] = useState(false);

  const spotifyService = SpotifyService.getInstance();
  const songStackService = SongStackService.getInstance();

  useEffect(() => {
    loadUserSongs();
  }, []);

  useEffect(() => {
    if (activeTab === 'top_tracks' && topTracks.length === 0) {
      loadTopTracks();
    } else if (activeTab === 'playlists' && playlists.length === 0) {
      loadPlaylists();
    }
  }, [activeTab]);

  const loadTopTracks = async () => {
    setIsLoadingTopTracks(true);
    try {
      console.log('🔥 Loading user top tracks...');
      const tracks = await spotifyService.getUserTopTracks(20, 'medium_term');
      setTopTracks(tracks);
      console.log('✅ Top tracks loaded:', tracks.length);
    } catch (error) {
      console.error('Error loading top tracks:', error);
      // Show fallback message
      Alert.alert('Info', 'Could not load your top tracks. Try using search instead.');
    } finally {
      setIsLoadingTopTracks(false);
    }
  };

  const loadPlaylists = async () => {
    setIsLoadingPlaylists(true);
    try {
      console.log('📋 Loading user playlists...');
      const userPlaylists = await spotifyService.getUserPlaylists(20);
      setPlaylists(userPlaylists);
      console.log('✅ Playlists loaded:', userPlaylists.length);
    } catch (error) {
      console.error('Error loading playlists:', error);
      Alert.alert('Info', 'Could not load your playlists. Try using search instead.');
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  const loadPlaylistTracks = async (playlist: any) => {
    setIsLoading(true);
    try {
      console.log('🎵 Loading tracks for playlist:', playlist.name);
      const tracks = await spotifyService.getPlaylistTracks(playlist.id, 50);
      setPlaylistTracks(tracks);
      setSelectedPlaylist(playlist);
      console.log('✅ Playlist tracks loaded:', tracks.length);
    } catch (error) {
      console.error('Error loading playlist tracks:', error);
      Alert.alert('Error', 'Could not load playlist tracks.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserSongs = async () => {
    if (!user?.id) return;
    
    try {
      setIsLoading(true);
      const songs = await songStackService.getUserSongStack(user.id, currentRoom?.id);
      setUserSongs(songs);
    } catch (error) {
      console.error('Error loading user songs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const searchSpotifyTracks = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      console.log('🔍 Searching for:', query);
      
      // Use real Spotify search if user is authenticated
      const results = await spotifyService.searchTracks(query, 20);
      setSearchResults(results);
      
      console.log('✅ Search completed:', results.length, 'results');
    } catch (error) {
      console.error('Search error:', error);
      
      // Fallback to mock results if Spotify search fails
      console.log('🔄 Falling back to mock results...');
      const mockResults: SpotifyTrack[] = [
        {
          id: 'mock-1',
          name: 'Bohemian Rhapsody',
          artists: [{ name: 'Queen' }],
          album: {
            name: 'A Night at the Opera',
            images: [{ url: 'https://via.placeholder.com/300x300/FF6B6B/FFFFFF?text=Queen', height: 300, width: 300 }],
          },
          preview_url: undefined,
          external_urls: { spotify: '#' },
          duration_ms: 355000,
          popularity: 85,
          explicit: false,
        },
        {
          id: 'mock-2',
          name: 'Hotel California',
          artists: [{ name: 'Eagles' }],
          album: {
            name: 'Hotel California',
            images: [{ url: 'https://via.placeholder.com/300x300/4ECDC4/FFFFFF?text=Eagles', height: 300, width: 300 }],
          },
          preview_url: undefined,
          external_urls: { spotify: '#' },
          duration_ms: 391000,
          popularity: 90,
          explicit: false,
        },
      ];
      setSearchResults(mockResults);
      
      // Show user-friendly error message
      Alert.alert('Search Error', 'Using sample results. Please check your internet connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const addSongToStack = async (track: SpotifyTrack) => {
    try {
      setIsLoading(true);
      
      // Check if song is already in stack
      if (userSongs.some(song => song.spotify_track_id === track.id)) {
        Alert.alert('Already Added', 'This song is already in your stack!');
        return;
      }

      // Add song to database
      const newSong = await songStackService.addSongToStack(
        user?.id || '',
        track,
        currentRoom?.id
      );

      setUserSongs(prev => [...prev, newSong]);
      Alert.alert('Song Added!', `"${track.name}" has been added to your stack.`);
      
      // Reload songs to ensure consistency
      await loadUserSongs();
      
    } catch (error) {
      console.error('Add song error:', error);
      Alert.alert('Error', 'Failed to add song to your stack.');
    } finally {
      setIsLoading(false);
    }
  };

  const removeSongFromStack = async (songId: string) => {
    Alert.alert(
      'Remove Song',
      'Are you sure you want to remove this song from your stack?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await songStackService.removeSongFromStack(songId, user?.id || '');
              setUserSongs(prev => prev.filter(song => song.id !== songId));
              
              // Reload songs to ensure consistency
              await loadUserSongs();
            } catch (error) {
              console.error('Error removing song:', error);
              Alert.alert('Error', 'Failed to remove song from your stack.');
            }
          },
        },
      ]
    );
  };

  const renderSearchResult = (track: SpotifyTrack) => {
    const hasPreview = !!track.preview_url;
    
    const testAudio = async () => {
      if (!track.preview_url) {
        Alert.alert('No Preview', 'This song does not have an audio preview available.');
        return;
      }
      
      try {
        console.log('🎵 Testing audio for:', track.name);
        const { sound } = await Audio.Sound.createAsync(
          { uri: track.preview_url },
          { shouldPlay: true, volume: 0.7 }
        );
        
        // Auto-stop after 10 seconds
        setTimeout(async () => {
          try {
            await sound.stopAsync();
            await sound.unloadAsync();
          } catch (e) {
            console.error('Error stopping test audio:', e);
          }
        }, 10000);
        
        Alert.alert('Audio Test', `Playing preview of "${track.name}" for 10 seconds...`);
      } catch (error) {
        console.error('Error testing audio:', error);
        Alert.alert('Audio Error', 'Failed to play audio preview. This song may not work in the game.');
      }
    };
    
    return (
      <View key={track.id} style={styles.trackCard}>
        <Image source={{ uri: track.album.images[0]?.url }} style={styles.albumArt} />
        <View style={styles.trackInfo}>
          <View style={styles.trackHeader}>
            <Text style={styles.trackName} numberOfLines={1}>{track.name}</Text>
            {hasPreview ? (
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeText}>🎵</Text>
              </View>
            ) : (
              <View style={styles.noPreviewBadge}>
                <Text style={styles.noPreviewBadgeText}>🔇</Text>
              </View>
            )}
          </View>
          <Text style={styles.artistName} numberOfLines={1}>
            {track.artists.map(artist => artist.name).join(', ')}
          </Text>
          <Text style={styles.albumName} numberOfLines={1}>{track.album.name}</Text>
          <Text style={styles.previewStatus}>
            {hasPreview ? '✅ Audio available' : '❌ No audio preview'}
          </Text>
        </View>
        <View style={styles.trackActions}>
          {/* Test Audio Button */}
          <TouchableOpacity
            style={[
              styles.testButton,
              !hasPreview && styles.testButtonDisabled
            ]}
            onPress={testAudio}
            disabled={!hasPreview}
          >
            <Text style={[
              styles.testButtonText,
              !hasPreview && styles.testButtonTextDisabled
            ]}>▶️</Text>
          </TouchableOpacity>
          
          {/* Add Button */}
          <TouchableOpacity
            style={[
              styles.addButton,
              !hasPreview && styles.addButtonDisabled
            ]}
            onPress={() => addSongToStack(track)}
            disabled={isLoading}
          >
            <Text style={[
              styles.addButtonText,
              !hasPreview && styles.addButtonTextDisabled
            ]}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'search' && styles.activeTab]}
        onPress={() => setActiveTab('search')}
      >
        <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>
          🔍 Search
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'top_tracks' && styles.activeTab]}
        onPress={() => setActiveTab('top_tracks')}
      >
        <Text style={[styles.tabText, activeTab === 'top_tracks' && styles.activeTabText]}>
          🔥 Top Tracks
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'playlists' && styles.activeTab]}
        onPress={() => setActiveTab('playlists')}
      >
        <Text style={[styles.tabText, activeTab === 'playlists' && styles.activeTabText]}>
          📋 Playlists
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSearchTab = () => {
    const filteredResults = showOnlyWithPreview 
      ? searchResults.filter(track => track.preview_url)
      : searchResults;

    return (
      <View style={styles.tabContent}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for songs..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => searchSpotifyTracks(searchQuery)}
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => searchSpotifyTracks(searchQuery)}
            disabled={isSearching}
          >
            <Text style={styles.searchButtonText}>
              {isSearching ? '🔄' : '🔍'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Preview Filter Toggle */}
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterButton, showOnlyWithPreview && styles.filterButtonActive]}
            onPress={() => setShowOnlyWithPreview(!showOnlyWithPreview)}
          >
            <Text style={[styles.filterButtonText, showOnlyWithPreview && styles.filterButtonTextActive]}>
              🎵 Only songs with audio previews
            </Text>
          </TouchableOpacity>
          {searchResults.length > 0 && (
            <Text style={styles.filterInfo}>
              {showOnlyWithPreview 
                ? `${filteredResults.length} of ${searchResults.length} songs have previews`
                : `${searchResults.filter(t => t.preview_url).length} of ${searchResults.length} songs have previews`
              }
            </Text>
          )}
        </View>

        {isSearching && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#1DB954" />
            <Text style={styles.loadingText}>Searching...</Text>
          </View>
        )}

        <ScrollView style={styles.resultsList}>
          {filteredResults.map(renderSearchResult)}
        </ScrollView>
      </View>
    );
  };

  const renderTopTracksTab = () => {
    const filteredTracks = showOnlyWithPreview 
      ? topTracks.filter(track => track.preview_url)
      : topTracks;

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Your Top Tracks</Text>
        <Text style={styles.sectionSubtitle}>Based on your recent listening</Text>

        {/* Preview Filter Toggle */}
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterButton, showOnlyWithPreview && styles.filterButtonActive]}
            onPress={() => setShowOnlyWithPreview(!showOnlyWithPreview)}
          >
            <Text style={[styles.filterButtonText, showOnlyWithPreview && styles.filterButtonTextActive]}>
              🎵 Only songs with audio previews
            </Text>
          </TouchableOpacity>
          {topTracks.length > 0 && (
            <Text style={styles.filterInfo}>
              {showOnlyWithPreview 
                ? `${filteredTracks.length} of ${topTracks.length} tracks have previews`
                : `${topTracks.filter(t => t.preview_url).length} of ${topTracks.length} tracks have previews`
              }
            </Text>
          )}
        </View>

        {isLoadingTopTracks ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#1DB954" />
            <Text style={styles.loadingText}>Loading your top tracks...</Text>
          </View>
        ) : (
          <ScrollView style={styles.resultsList}>
            {filteredTracks.map(renderSearchResult)}
          </ScrollView>
        )}
      </View>
    );
  };

  const renderPlaylistsTab = () => (
    <View style={styles.tabContent}>
      {!selectedPlaylist ? (
        <>
          <Text style={styles.sectionTitle}>Your Playlists</Text>
          <Text style={styles.sectionSubtitle}>Choose a playlist to browse</Text>

          {isLoadingPlaylists ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#1DB954" />
              <Text style={styles.loadingText}>Loading your playlists...</Text>
            </View>
          ) : (
            <ScrollView style={styles.resultsList}>
              {playlists.map((playlist) => (
                <TouchableOpacity
                  key={playlist.id}
                  style={styles.playlistCard}
                  onPress={() => loadPlaylistTracks(playlist)}
                >
                  <Image
                    source={{
                      uri: playlist.images[0]?.url || 'https://via.placeholder.com/60x60/1DB954/FFFFFF?text=♪'
                    }}
                    style={styles.playlistArt}
                  />
                  <View style={styles.playlistInfo}>
                    <Text style={styles.playlistName} numberOfLines={1}>
                      {playlist.name}
                    </Text>
                    <Text style={styles.playlistDescription} numberOfLines={2}>
                      {playlist.description || `${playlist.tracks.total} tracks`}
                    </Text>
                  </View>
                  <Text style={styles.playlistArrow}>→</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        <>
          <View style={styles.playlistHeader}>
            <TouchableOpacity
              style={styles.backToPlaylistsButton}
              onPress={() => {
                setSelectedPlaylist(null);
                setPlaylistTracks([]);
              }}
            >
              <Text style={styles.backButton}>← Back to Playlists</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>{selectedPlaylist.name}</Text>
            <Text style={styles.sectionSubtitle}>
              {playlistTracks.length} tracks
            </Text>
          </View>

          {/* Preview Filter Toggle */}
          <View style={styles.filterContainer}>
            <TouchableOpacity
              style={[styles.filterButton, showOnlyWithPreview && styles.filterButtonActive]}
              onPress={() => setShowOnlyWithPreview(!showOnlyWithPreview)}
            >
              <Text style={[styles.filterButtonText, showOnlyWithPreview && styles.filterButtonTextActive]}>
                🎵 Only songs with audio previews
              </Text>
            </TouchableOpacity>
            {playlistTracks.length > 0 && (
              <Text style={styles.filterInfo}>
                {showOnlyWithPreview 
                  ? `${playlistTracks.filter(track => track.preview_url).length} of ${playlistTracks.length} tracks have previews`
                  : `${playlistTracks.filter(t => t.preview_url).length} of ${playlistTracks.length} tracks have previews`
                }
              </Text>
            )}
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#1DB954" />
              <Text style={styles.loadingText}>Loading playlist tracks...</Text>
            </View>
          ) : (
            <ScrollView style={styles.resultsList}>
              {(showOnlyWithPreview 
                ? playlistTracks.filter(track => track.preview_url)
                : playlistTracks
              ).map(renderSearchResult)}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'search':
        return renderSearchTab();
      case 'top_tracks':
        return renderTopTracksTab();
      case 'playlists':
        return renderPlaylistsTab();
      default:
        return renderSearchTab();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={['#D2691E', '#FF6347', '#FF8C00']} style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Manage Songs</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView}>
          <View style={styles.scrollViewContent}>
            {/* Current Songs Section */}
            <View style={styles.currentSongsSection}>
              <Text style={styles.sectionTitle}>
                Your Songs ({userSongs.length}/10)
              </Text>
              
              {/* Audio Info Section */}
              <View style={styles.audioInfoSection}>
                <Text style={styles.audioInfoTitle}>🎵 Audio Testing Guide</Text>
                <Text style={styles.audioInfoText}>
                  • <Text style={styles.audioInfoHighlight}>🎵 Green badge</Text> = Audio preview available
                </Text>
                <Text style={styles.audioInfoText}>
                  • <Text style={styles.audioInfoHighlight}>🔇 Red badge</Text> = No audio preview
                </Text>
                <Text style={styles.audioInfoText}>
                  • <Text style={styles.audioInfoHighlight}>▶️ Test button</Text> = Hear 10-second preview
                </Text>
                <Text style={styles.audioInfoText}>
                  • Only songs with 🎵 badges will play audio in the game
                </Text>
              </View>
              
              {isLoading && userSongs.length === 0 ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#1DB954" />
                  <Text style={styles.loadingText}>Loading your songs...</Text>
                </View>
              ) : userSongs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No songs in your stack yet</Text>
                  <Text style={styles.emptyStateSubtext}>Add some songs below to get started!</Text>
                </View>
              ) : (
                <View style={styles.songsGrid}>
                  {userSongs.map((userSong) => (
                    <View key={userSong.id} style={styles.songCard}>
                      <Image source={{ uri: userSong.track_data.album.images[0]?.url }} style={styles.songArt} />
                      <View style={styles.songInfo}>
                        <Text style={styles.songName} numberOfLines={2}>{userSong.track_data.name}</Text>
                        <Text style={styles.songArtist} numberOfLines={1}>
                          {userSong.track_data.artists.map((artist) => artist.name).join(', ')}
                        </Text>
                        <Text style={styles.songAlbum} numberOfLines={1}>{userSong.track_data.album.name}</Text>
                        <Text style={styles.songDate}>
                          Added {new Date(userSong.added_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.songRemoveButton}
                        onPress={() => removeSongFromStack(userSong.id)}
                      >
                        <Text style={styles.songRemoveText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Tab Navigation */}
            {renderTabBar()}

            {/* Tab Content */}
            {renderTabContent()}
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
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
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(139, 75, 155, 0.4)',
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    borderBottomWidth: 4,
    borderBottomColor: '#F5E6D3',
  },
  backButton: {
    color: '#F5E6D3',
    fontSize: 20,
    fontWeight: 'bold',
  },
  title: {
    color: '#F5E6D3',
    fontSize: 22,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  searchSection: {
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F5E6D3',
    padding: 18,
    color: '#8B4B9B',
    fontSize: 16,
    marginRight: 15,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#8B4B9B',
    fontWeight: '600',
  },
  searchButton: {
    backgroundColor: '#F5E6D3',
    paddingHorizontal: 25,
    paddingVertical: 18,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#8B4B9B',
  },
  searchButtonText: {
    color: '#8B4B9B',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultsContainer: {
    marginTop: 15,
  },
  resultsTitle: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    opacity: 0.9,
  },
  stackSection: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  songsContainer: {
    gap: 15,
  },
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 75, 155, 0.8)',
    padding: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  albumArt: {
    width: 70,
    height: 70,
    marginRight: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#F5E6D3',
  },
  trackInfo: {
    flex: 1,
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  trackName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F5E6D3',
  },
  previewBadge: {
    backgroundColor: '#32CD32',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  previewBadgeText: {
    color: '#F5E6D3',
    fontSize: 14,
    fontWeight: 'bold',
  },
  noPreviewBadge: {
    backgroundColor: '#DC143C',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  noPreviewBadgeText: {
    color: '#F5E6D3',
    fontSize: 14,
    fontWeight: 'bold',
  },
  previewStatus: {
    fontSize: 14,
    color: '#F5E6D3',
    fontWeight: '600',
    opacity: 0.8,
  },
  artistName: {
    fontSize: 16,
    color: '#F5E6D3',
    marginBottom: 4,
    fontWeight: '600',
    opacity: 0.9,
  },
  albumName: {
    fontSize: 14,
    color: '#F5E6D3',
    fontWeight: '500',
    opacity: 0.8,
  },
  trackActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  testButton: {
    width: 40,
    height: 40,
    backgroundColor: '#32CD32',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#F5E6D3',
    marginRight: 8,
  },
  testButtonDisabled: {
    backgroundColor: '#999',
  },
  testButtonText: {
    color: '#F5E6D3',
    fontSize: 24,
    fontWeight: 'bold',
  },
  testButtonTextDisabled: {
    color: '#666',
  },
  addButton: {
    width: 40,
    height: 40,
    backgroundColor: '#32CD32',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#F5E6D3',
  },
  addButtonText: {
    color: '#F5E6D3',
    fontSize: 24,
    fontWeight: 'bold',
  },
  addButtonDisabled: {
    backgroundColor: '#999',
  },
  addButtonTextDisabled: {
    color: '#666',
  },
  removeButton: {
    width: 40,
    height: 40,
    backgroundColor: '#DC143C',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#F5E6D3',
  },
  removeButtonText: {
    color: '#F5E6D3',
    fontSize: 24,
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
    marginBottom: 12,
  },
  emptyStateSubtext: {
    color: '#F5E6D3',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
    fontWeight: '600',
    opacity: 0.8,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(139, 75, 155, 0.6)',
    margin: 16,
    padding: 6,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeTab: {
    backgroundColor: '#F5E6D3',
    borderColor: '#8B4B9B',
  },
  tabText: {
    color: '#F5E6D3',
    fontSize: 14,
    fontWeight: 'bold',
    opacity: 0.8,
  },
  activeTabText: {
    color: '#8B4B9B',
    opacity: 1,
  },
  tabContent: {
    flex: 1,
  },
  tabContentContainer: {
    flex: 1,
    backgroundColor: 'rgba(139, 75, 155, 0.95)',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    borderTopWidth: 4,
    borderTopColor: '#F5E6D3',
    paddingTop: 20,
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#F5E6D3',
    marginHorizontal: 20,
    marginBottom: 20,
    fontWeight: 'bold',
    opacity: 0.9,
  },
  currentSongsSection: {
    marginBottom: 20,
  },
  currentSongsList: {
    paddingHorizontal: 16,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 75, 155, 0.8)',
    marginHorizontal: 20,
    marginVertical: 6,
    padding: 16,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  playlistArt: {
    width: 70,
    height: 70,
    backgroundColor: '#8B4B9B',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#F5E6D3',
  },
  playlistInfo: {
    flex: 1,
    marginLeft: 16,
  },
  playlistName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F5E6D3',
    marginBottom: 6,
  },
  playlistDescription: {
    fontSize: 14,
    color: '#F5E6D3',
    fontWeight: '600',
    opacity: 0.8,
  },
  playlistArrow: {
    fontSize: 20,
    color: '#F5E6D3',
    marginLeft: 12,
    fontWeight: 'bold',
  },
  playlistHeader: {
    marginBottom: 20,
  },
  backToPlaylistsButton: {
    marginHorizontal: 20,
    marginBottom: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
  },
  resultsList: {
    flex: 1,
  },
  songCount: {
    color: '#F5E6D3',
    fontSize: 14,
    fontWeight: 'bold',
    opacity: 0.9,
  },
  currentSongCard: {
    width: 220,
    height: 90,
    backgroundColor: 'rgba(139, 75, 155, 0.9)',
    marginRight: 15,
    padding: 15,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  currentSongArt: {
    width: 70,
    height: 70,
    marginRight: 15,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#F5E6D3',
  },
  currentSongInfo: {
    flex: 1,
  },
  currentSongName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F5E6D3',
    marginBottom: 4,
  },
  currentSongArtist: {
    fontSize: 14,
    color: '#F5E6D3',
    marginBottom: 4,
    fontWeight: '600',
    opacity: 0.9,
  },
  currentSongRemoveButton: {
    width: 40,
    height: 40,
    backgroundColor: '#DC143C',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#F5E6D3',
  },
  currentSongRemoveText: {
    color: '#F5E6D3',
    fontSize: 24,
    fontWeight: 'bold',
  },
  detailedSongsSection: {
    marginBottom: 20,
  },
  detailedSongsTitle: {
    color: '#F5E6D3',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  addedDate: {
    fontSize: 12,
    color: '#F5E6D3',
    fontWeight: '600',
    opacity: 0.8,
  },
  songsGrid: {
    paddingHorizontal: 20,
  },
  songCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 75, 155, 0.95)',
    padding: 20,
    marginBottom: 15,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5E6D3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  songArt: {
    width: 80,
    height: 80,
    marginRight: 20,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  songInfo: {
    flex: 1,
  },
  songName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F5E6D3',
    marginBottom: 6,
  },
  songArtist: {
    fontSize: 16,
    color: '#F5E6D3',
    marginBottom: 4,
    fontWeight: '600',
    opacity: 0.9,
  },
  songAlbum: {
    fontSize: 14,
    color: '#F5E6D3',
    marginBottom: 6,
    fontWeight: '500',
    opacity: 0.8,
  },
  songDate: {
    fontSize: 12,
    color: '#F5E6D3',
    fontStyle: 'italic',
    fontWeight: '600',
    opacity: 0.8,
  },
  songRemoveButton: {
    width: 45,
    height: 45,
    backgroundColor: '#DC143C',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 15,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: '#F5E6D3',
  },
  songRemoveText: {
    color: '#F5E6D3',
    fontSize: 24,
    fontWeight: 'bold',
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  filterButton: {
    backgroundColor: '#F5E6D3',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#8B4B9B',
  },
  filterButtonActive: {
    backgroundColor: '#8B4B9B',
    borderColor: '#F5E6D3',
  },
  filterButtonText: {
    color: '#8B4B9B',
    fontSize: 14,
    fontWeight: 'bold',
  },
  filterButtonTextActive: {
    color: '#F5E6D3',
    opacity: 1,
  },
  filterInfo: {
    color: '#F5E6D3',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 10,
  },
  audioInfoSection: {
    marginBottom: 20,
  },
  audioInfoTitle: {
    color: '#F5E6D3',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  audioInfoText: {
    color: '#F5E6D3',
    fontSize: 16,
    marginBottom: 5,
  },
  audioInfoHighlight: {
    fontWeight: 'bold',
  },
});

export default SongStackScreen; 