# 🎵 Spotify Authentication Setup Guide

This guide will help you set up Spotify authentication for both development and production environments.

## 📋 Prerequisites

1. A Spotify account (free or premium)
2. Access to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)

## 🚀 Step-by-Step Setup

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **"Create app"**
3. Fill in the app details:
   - **App name**: `Shotobump` (or your preferred name)
   - **App description**: `Music recognition game for friends`
   - **Website**: `https://github.com/yourusername/shotobump` (optional)
   - **Redirect URI**: Leave blank for now (we'll add this next)
   - **Which API/SDKs are you planning to use?**: Check **Web API**
4. Accept the terms and click **"Save"**

### 2. Configure Redirect URIs

This is the **most important step**! You need to add both redirect URIs:

1. In your newly created app, click **"Settings"**
2. Click **"Edit Settings"** 
3. In the **"Redirect URIs"** section, add **BOTH** of these URIs:
   ```
   http://127.0.0.1:8081/
   shotobump://auth
   ```
   
   **Note**: If your dev server runs on a different port, use that port instead of 8081
4. Click **"Add"** after each URI
5. Click **"Save"** at the bottom

### 3. Get Your Client ID

1. In your app settings, copy the **Client ID**
2. Create a `.env` file in your project root:
   ```bash
   # In Shotobump/.env
   EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_client_id_here
   EXPO_PUBLIC_SUPABASE_URL=https://placeholder-supabase-url.com
   EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder-key
   ```

## 🔧 How It Works

### Development (Web Browser)
- **Redirect URI**: `http://127.0.0.1:8081/`
- **Port**: Your current dev server port (8081 in your case)
- **Usage**: When you run `npm start` and open in web browser
- **Authentication**: Real Spotify OAuth flow
- **Auto-detection**: App automatically uses the correct port

### Production/Mobile
- **Redirect URI**: `shotobump://auth`
- **Usage**: When running on iOS/Android device or simulator
- **Authentication**: Real Spotify OAuth flow

## 🧪 Testing

### Test on Web (Development)
```bash
npm start
# Press 'w' to open in web browser
# Click "Continue with Spotify"
# Should redirect to real Spotify login
```

### Test on Mobile
```bash
npm start
# Press 'i' for iOS simulator or 'a' for Android
# Click "Continue with Spotify"
# Should open Spotify login in mobile browser
```

## 🔍 Troubleshooting

### Common Issues

1. **"Invalid redirect URI" error**
   - Make sure you added BOTH redirect URIs exactly as shown above
   - Check for typos in the URIs
   - Make sure you clicked "Save" after adding them

2. **"Invalid client ID" error**
   - Double-check your `.env` file
   - Make sure the variable name is exactly `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`
   - Restart your development server after changing `.env`

3. **Web authentication not working**
   - Make sure you're accessing via `127.0.0.1:8081` not `localhost:8081`
   - Check that port 8081 is being used (your current dev server port)
   - The app auto-detects the port, but make sure you added the correct port to Spotify

4. **Mobile authentication not working**
   - Make sure you added the custom scheme URI: `shotobump://auth`
   - Test on a real device or simulator, not web browser

### Debug Tips

1. Check the console logs - they'll show which redirect URI is being used
2. Make sure your Spotify app is set to "Development Mode" initially
3. You can test the redirect URIs directly in your browser:
   - Go to your Spotify app settings
   - Copy the authorization URL from the browser network tab
   - Paste it in a new tab to see if it redirects correctly

## 🎯 Next Steps

Once Spotify authentication is working:
1. Test creating and joining rooms with real Spotify users
2. The app will show real user avatars and names from Spotify
3. Ready to implement song searching and playlist management

## 📞 Support

If you encounter issues:
1. Check the console logs for error messages
2. Verify your redirect URIs are exactly correct
3. Make sure your `.env` file is properly configured
4. Try testing on both web and mobile to isolate the issue

---

**Important**: Keep your Client ID secure and never commit your `.env` file to version control! 