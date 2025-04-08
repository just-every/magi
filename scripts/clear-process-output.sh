#!/bin/bash
# Script to clear a specific process directory in the magi_output Docker volume
# Usage: ./scripts/clear-process-output.sh <process_id>

set -e

# Check if process ID was provided
if [ -z "$1" ]; then
    echo "Error: Process ID is required."
    echo "Usage: ./scripts/clear-process-output.sh <process_id>"
    exit 1
fi

PROCESS_ID="$1"

# Print banner
echo "========================================"
echo "MAGI System - Clear Process Output Script"
echo "========================================"
echo "This script will clear the output for process: $PROCESS_ID"
echo ""

# Confirm with the user
read -p "Are you sure you want to clear output for process $PROCESS_ID? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    exit 0
fi

echo "Clearing output for process $PROCESS_ID..."

# Create a temporary container to access the volume and clear the specific process directory
docker run --rm -v magi_output:/magi_output alpine:latest sh -c "rm -rf /magi_output/$PROCESS_ID/* /magi_output/$PROCESS_ID/.[!.]* 2>/dev/null || true"

# Verify the cleaning
echo "Verifying cleanup..."
EXISTS=$(docker run --rm -v magi_output:/magi_output alpine:latest sh -c "[ -d /magi_output/$PROCESS_ID ] && echo 'yes' || echo 'no'")

if [ "$EXISTS" = "no" ]; then
    echo "✅ Process directory doesn't exist anymore."
else
    OUTPUT=$(docker run --rm -v magi_output:/magi_output alpine:latest sh -c "ls -la /magi_output/$PROCESS_ID")
    FILECOUNT=$(echo "$OUTPUT" | wc -l)

    if [ "$FILECOUNT" -le 3 ]; then
        # Only ".", ".." and possibly ".gitkeep" remain
        echo "✅ Process directory has been successfully cleared."
    else
        echo "⚠️ Some files may remain in the directory:"
        echo "$OUTPUT"
    fi
fi

echo ""
echo "Done."