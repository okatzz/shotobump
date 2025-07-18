# Use Node.js 18 as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Install Expo CLI globally
RUN npm install -g @expo/cli

# Build the web version
RUN npx expo export:web

# Install serve to host the static files
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Start the server
CMD ["serve", "-s", "web-build", "-l", "3000"] 