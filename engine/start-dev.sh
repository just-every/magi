#!/bin/bash

# Task Development Start Script

echo "Starting task (MAGI agents) in development mode..."

# Ensure database is running
if ! docker ps | grep -q magi-postgres; then
    echo "Starting PostgreSQL database..."
    (cd .. && docker compose up -d db)
    sleep 3
fi

# Check for .env file
if [ ! -f .env ]; then
    echo "No .env file found. Creating from example..."
    cp .env.example .env
    echo "Please edit .env with your API keys before running agents."
    exit 1
fi

# Build initial
echo "Building TypeScript..."
npm run build

# Start with arguments or in dev mode
if [ $# -eq 0 ]; then
    echo "Starting in watch mode..."
    npm run dev
else
    echo "Running with arguments: $@"
    npm start -- "$@"
fi