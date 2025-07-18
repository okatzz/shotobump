// Utility to detect current development port
export const getCurrentPort = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.port || '8081';
  }
  return '8081'; // Default fallback
};

export const getWebRedirectUri = (): string => {
  if (typeof window !== 'undefined') {
    // Check if we're in production (shotobump.com domain)
    const hostname = window.location.hostname;
    if (hostname === 'shotobump.com' || hostname === 'www.shotobump.com') {
      return 'https://www.shotobump.com/';
    }
    
    // Development environment
    const port = getCurrentPort();
    return `http://127.0.0.1:${port}/`;
  }
  return 'https://www.shotobump.com/'; // Default to production
};

export const logRedirectUriInfo = (): void => {
  if (typeof window !== 'undefined') {
    const redirectUri = getWebRedirectUri();
    const hostname = window.location.hostname;
    
    console.log('🔧 Spotify Redirect URI Info:');
    console.log(`   Current Hostname: ${hostname}`);
    console.log(`   Redirect URI: ${redirectUri}`);
    console.log(`   Environment: ${__DEV__ ? 'Development' : 'Production'}`);
    console.log(`   Make sure this URI is added to your Spotify app!`);
  }
}; 