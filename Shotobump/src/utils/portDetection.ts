// Utility to detect current development port
export const getCurrentPort = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.port || '8081';
  }
  return '8081'; // Default fallback
};

export const getWebRedirectUri = (): string => {
  const port = getCurrentPort();
  return `http://127.0.0.1:${port}/`;
};

export const logRedirectUriInfo = (): void => {
  if (typeof window !== 'undefined' && __DEV__) {
    const port = getCurrentPort();
    const redirectUri = getWebRedirectUri();
    
    console.log('🔧 Spotify Redirect URI Info:');
    console.log(`   Current Port: ${port}`);
    console.log(`   Redirect URI: ${redirectUri}`);
    console.log(`   Make sure this URI is added to your Spotify app!`);
  }
}; 