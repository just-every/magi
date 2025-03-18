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
cd magi/
python -m venv venv
source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r docker/requirements.txt
python -m playwright install chromium

echo -e "\nTesting... \n"
python magi.py -t "$@"
