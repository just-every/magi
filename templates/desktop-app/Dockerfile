# Base image
FROM node:20-slim AS build

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run package

# Create production image
FROM ubuntu:22.04

# Install dependencies for running Electron
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libxcb-dri3-0 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy from build stage
COPY --from=build /app/out /app

# Set executable permissions
RUN chmod +x /app/*/electron-desktop-app

# Expose port for remote debugging (if needed)
EXPOSE 9222

# Set entrypoint
ENTRYPOINT ["/app/electron-desktop-app-linux-x64/electron-desktop-app"]