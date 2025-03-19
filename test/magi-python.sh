#!/bin/bash

# No arguments check - now handled by magi.py

# Load environment variables from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

echo -e "\nInitializing... "
# Change to project root
cd "$(dirname "$0")/.."
# Set up venv if it doesn't exist
if [ ! -d "magi/venv" ]; then
    cd magi/
    python3 -m venv venv
    source venv/bin/activate
    pip install -q --upgrade pip
    pip install -q -r docker/requirements.txt
    python -m playwright install chromium
    cd ..
else
    source magi/venv/bin/activate
fi

python magi/magi.py -t "$@"
