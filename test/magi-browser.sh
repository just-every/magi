#!/bin/bash

# Check if URL argument was provided
if [ $# -eq 0 ]; then
    echo "Error: No URL provided"
    echo "Usage: $0 <url>"
    exit 1
fi

URL=$1

# Load environment variables from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

echo -e "\nInstalling... "
# Change to project root
cd "$(dirname "$0")/.."

cd magi/
npm install --prefer-offline

echo -e "\nBuilding... "
npm run build

echo -e "\nBrowsing... "
node dist/test-browser.js -u "$URL"

# Add a delay to ensure all processes complete
echo -e "\nWaiting for processes to complete..."
sleep 10