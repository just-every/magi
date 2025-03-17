#!/bin/bash

# Check if command argument was provided
if [ $# -eq 0 ]; then
    echo "Error: No command provided"
    echo "Usage: $0 \"your command here\""
    exit 1
fi

# Build the docker image with --quiet flag when using cache
echo -e "\nBuilding... "
export DOCKER_CLI_HINTS=false
docker build --quiet -t magi-system:latest -f magi/docker/Dockerfile .

# Run the docker container with all env variables from .env (removed -d to see output)
echo -e "\nRunning... "
docker run --rm --name test-magi \
    -e PROCESS_ID=AI-test \
    -e COMMAND="$1" \
    -e TEST_SCRIPT=true \
    --env-file .env \
    -v "$(pwd)/magi:/app/magi:rw" \
    -v claude_credentials:/claude_shared:rw \
    magi-system:latest
