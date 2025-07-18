# AWS App Runner Deployment Guide for Shotobump

## Prerequisites
- AWS Account with App Runner access
- GitHub repository: https://github.com/okatzz/shotobump
- Route53 domain: shotobump.com

## Step 1: Create App Runner Service via AWS Console

1. **Open AWS Console**
   - Go to https://console.aws.amazon.com/apprunner/
   - Make sure you're in the `us-east-1` region

2. **Create Service**
   - Click "Create service"
   - Choose "Source code repository"
   - Select "GitHub" as provider

3. **Connect to GitHub**
   - Click "Connect to GitHub"
   - Authorize AWS App Runner to access your GitHub account
   - Select repository: `okatzz/shotobump`
   - Select branch: `main`

4. **Configure Build Settings**
   - Build command: `npm install && npx expo export:web`
   - Start command: `npx serve -s web-build -l 3000`
   - Port: `3000`

5. **Configure Service**
   - Service name: `shotobump`
   - CPU: 1 vCPU
   - Memory: 2 GB
   - Auto scaling: Enabled (min: 1, max: 10)

6. **Create Service**
   - Click "Create & deploy"

## Step 2: Configure Custom Domain

1. **Add Custom Domain**
   - Go to your App Runner service
   - Click "Custom domains"
   - Add domain: `shotobump.com`
   - Add subdomain: `www.shotobump.com`

2. **Update Route53**
   - Go to Route53 console
   - Select your hosted zone for shotobump.com
   - Create CNAME records pointing to your App Runner service URL

## Step 3: Environment Variables

Add these environment variables in App Runner:
- `EXPO_PUBLIC_SUPABASE_URL` (from your .env file)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` (from your .env file)
- `SPOTIFY_CLIENT_ID` (from your .env file)
- `SPOTIFY_CLIENT_SECRET` (from your .env file)

## Step 4: Update Dockerfile

The Dockerfile in this repository is configured for the deployment.

## Estimated Cost
- App Runner: ~$13/month for 1 instance running 24/7
- Route53: ~$0.50/month for domain hosting
- **Total: ~$13.50/month**

## Next Steps
1. Follow the console steps above
2. Test the deployment
3. Configure SSL certificate (automatic with App Runner)
4. Set up monitoring and alerts 