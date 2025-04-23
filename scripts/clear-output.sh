#!/bin/bash
# Script to clear the magi_output Docker volume and .server data folder
# Usage: ./scripts/clear-output.sh

set -e

# Print banner
echo "========================================"
echo "MAGI System - Clear Output Script"
echo "========================================"
echo "This script will clear all content in the magi_output volume and .server data folder."
echo ""

# Confirm with the user
read -p "Are you sure you want to clear all MAGI output and .server data? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    exit 0
fi

echo "Clearing magi_output volume and .server data folder..."

# Create a temporary container to access the volume and clear its contents
docker run --rm -v magi_output:/magi_output alpine:latest sh -c "rm -rf /magi_output/* /magi_output/.[!.]* 2>/dev/null || true"

# Clear the .server data folder (if it exists)
if [ -d ".server" ]; then
    rm -rf .server/* .server/.[!.]* 2> /dev/null || true
    echo "✅ .server data folder has been cleared."
else
    echo "ℹ️ .server data folder not found, skipping."
    mkdir -p .server
fi

# Verify the cleaning
echo "Verifying cleanup..."
OUTPUT=$(docker run --rm -v magi_output:/magi_output alpine:latest sh -c "ls -la /magi_output")
FILECOUNT=$(echo "$OUTPUT" | wc -l)

if [ "$FILECOUNT" -le 3 ]; then
    # Only ".", ".." and possibly ".gitkeep" remain
    echo "✅ magi_output volume has been successfully cleared."

    # Verify .server is empty
    if [ -d ".server" ]; then
        SERVER_FILES=$(ls -la .server | wc -l)
        if [ "$SERVER_FILES" -le 3 ]; then
            echo "✅ .server directory has been successfully cleared."
        else
            echo "⚠️ Some files may remain in the .server directory."
            ls -la .server
        fi
    fi
else
    echo "⚠️ Some files may remain in the volume:"
    echo "$OUTPUT"
fi

echo ""
echo "Done."
