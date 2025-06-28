// Handle Spotify OAuth redirect in web environment
export const handleSpotifyRedirect = (): string | null => {
  if (typeof window === 'undefined') return null;
  
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  
  if (error) {
    console.error('Spotify OAuth error:', error);
    throw new Error(`Spotify authentication error: ${error}`);
  }
  
  if (code) {
    console.log('✅ Spotify authorization code received:', code.substring(0, 20) + '...');
    
    // Clean up the URL by removing the query parameters
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    
    return code;
  }
  
  return null;
};

// Check if current URL contains Spotify redirect parameters
export const isSpotifyRedirect = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('code') || urlParams.has('error');
}; 