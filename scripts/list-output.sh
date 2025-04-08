#!/bin/bash
# Script to list all process directories in the magi_output Docker volume
# Usage: ./scripts/list-output.sh

set -e

# Print banner
echo "========================================"
echo "MAGI System - List Output Script"
echo "========================================"

echo "Listing processes in magi_output volume..."
echo ""

# Create a temporary container to access the volume and list its contents
OUTPUT=$(docker run --rm -v magi_output:/magi_output alpine:latest sh -c "find /magi_output -maxdepth 1 -type d | grep -v '^/magi_output$' | sort")

if [ -z "$OUTPUT" ]; then
    echo "No process directories found in magi_output volume."
else
    echo "Process directories:"
    echo "$OUTPUT" | while read -r dir; do
        process_id=$(basename "$dir")
        size=$(docker run --rm -v magi_output:/magi_output alpine:latest sh -c "du -sh $dir | cut -f1")
        echo "  - $process_id (Size: $size)"
    done
fi

# Show total size of the volume
TOTAL_SIZE=$(docker run --rm -v magi_output:/magi_output alpine:latest sh -c "du -sh /magi_output | cut -f1")
echo ""
echo "Total volume size: $TOTAL_SIZE"
echo ""
echo "To clear a specific process: ./scripts/clear-process-output.sh <process_id>"
echo "To clear all output: ./scripts/clear-output.sh"