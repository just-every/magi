#!/bin/bash

# Controller Development Start Script

echo "Starting controller in development mode..."

# Ensure database is running
if ! docker ps | grep -q magi-postgres; then
    echo "Starting PostgreSQL database..."
    (cd .. && docker compose up -d db)
    sleep 3
fi

# Build initial files
echo "Building initial files..."
npm run build:initial

# Start development server
echo "Starting development server..."
npm run dev