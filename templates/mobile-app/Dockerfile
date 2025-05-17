# Use Node.js as the base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install Expo CLI globally
RUN npm install -g expo-cli eas-cli

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Expose port 19000, 19001, and 19002 (Expo ports)
EXPOSE 19000 19001 19002

# Start the Expo development server
CMD ["npm", "start"]