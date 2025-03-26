#!/bin/bash

# No arguments check - now handled by magi.py

# Generate a random container name suffix
RANDOM_SUFFIX=$(openssl rand -hex 4)
CONTAINER_NAME="test-magi-${RANDOM_SUFFIX}"

# Build the docker image with --quiet flag when using cache
echo -e "\nBuilding Docker... "
export DOCKER_CLI_HINTS=false
docker build -t magi-system:latest -f magi/docker/Dockerfile .

# Run the docker container with all env variables from .env (removed -d to see output)
echo -e "\nTesting... "
docker run --rm --name $CONTAINER_NAME \
    -e PROCESS_ID=AI-test \
    -e HOST_HOSTNAME=host.docker.internal \
    -e CONTROLLER_PORT=3010 \
    --env-file .env \
    -v claude_credentials:/claude_shared:rw \
    -v magi_output:/magi_output:rw \
    --add-host=host.docker.internal:host-gateway \
    magi-system:latest \
    -t "$@"
