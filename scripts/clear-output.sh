#!/bin/bash
# Script to clear the magi_output Docker volume
# Usage: ./scripts/clear-output.sh

set -e

# Print banner
echo "========================================"
echo "MAGI System - Clear Output Script"
echo "========================================"
echo "This script will clear all content in the magi_output volume."
echo ""

# Confirm with the user
read -p "Are you sure you want to clear all MAGI output? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    exit 0
fi

echo "Clearing magi_output volume..."

# Create a temporary container to access the volume and clear its contents
docker run --rm -v magi_output:/magi_output alpine:latest sh -c "rm -rf /magi_output/* /magi_output/.[!.]* 2>/dev/null || true"

# Verify the cleaning
echo "Verifying cleanup..."
OUTPUT=$(docker run --rm -v magi_output:/magi_output alpine:latest sh -c "ls -la /magi_output")
FILECOUNT=$(echo "$OUTPUT" | wc -l)

if [ "$FILECOUNT" -le 3 ]; then
    # Only ".", ".." and possibly ".gitkeep" remain
    echo "✅ magi_output volume has been successfully cleared."
else
    echo "⚠️ Some files may remain in the volume:"
    echo "$OUTPUT"
fi

echo ""
echo "Done."