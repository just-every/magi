#!/bin/bash

# Exit on any error
set -e

# Check if .env exists, run setup if not
if [ ! -f .env ]; then
    npm run setup
fi

# Build host tools
npm run build:host

# Ensure magi_home volume exists as bind mount
MAGI_HOME_DIR=".magi_home"
if [ ! -d "$MAGI_HOME_DIR" ]; then
    mkdir -p "$MAGI_HOME_DIR"
fi

# Check if volume exists and is properly configured
if ! docker volume inspect magi_home >/dev/null 2>&1; then
    echo "📁 Creating magi_home volume..."
    docker volume create --driver local --opt type=none --opt o=bind --opt device="$(pwd)/$MAGI_HOME_DIR" magi_home
elif ! docker volume inspect magi_home | grep -q "$(pwd)/$MAGI_HOME_DIR"; then
    # Volume exists but might not be bind-mounted correctly
    echo "🔄 Recreating magi_home volume with correct bind mount..."
    docker volume rm magi_home 2>/dev/null || true
    docker volume create --driver local --opt type=none --opt o=bind --opt device="$(pwd)/$MAGI_HOME_DIR" magi_home
fi

# Sync HOME_LINKS if configured
if [ -f .env ]; then
    # Check if HOME_LINKS is set in .env
    if grep -q "^HOME_LINKS=" .env && [ -n "$(grep "^HOME_LINKS=" .env | cut -d'=' -f2-)" ]; then
        echo "🔄 Checking HOME_LINKS..."
        node host/dist/setup/sync-home-quiet.js
    fi
fi

# Start browser
npm run browser:start

# Build Docker images
npm run build:docker

# If a command was provided, export it as an environment variable
if [ -n "$1" ]; then
    export MAGI_INITIAL_COMMAND="$1"
else
    echo "No initial command provided"
fi

# Start docker compose with the environment variable
MAGI_INITIAL_COMMAND="$MAGI_INITIAL_COMMAND" docker compose up