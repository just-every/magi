#!/bin/bash

# Ensure the script exists if build fails
set -e

# Use the SAME UID/GID you defined in the Dockerfile (e.g., 1001)
MAGI_UID=1001
MAGI_GID=1001

echo "Setting permissions for volume 'magi_output' to ${MAGI_UID}:${MAGI_GID}..."
docker run --rm --user root \
  -v magi_output:/magi_output \
  alpine:latest chown "${MAGI_UID}:${MAGI_GID}" /magi_output

echo "Setting permissions for volume 'claude_credentials' to ${MAGI_UID}:${MAGI_GID}..."
docker run --rm --user root \
  -v claude_credentials:/claude_shared \
  alpine:latest chown -R "${MAGI_UID}:${MAGI_GID}" /claude_shared
