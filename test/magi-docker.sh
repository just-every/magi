#!/bin/bash

# Ensure the script exists if build fails
set -e

# Generate a random container name suffix
RANDOM_SUFFIX=$(openssl rand -hex 4)
CONTAINER_NAME="test-magi-${RANDOM_SUFFIX}"

# No timezone detection needed - handled in dateFormat()

# Start the database if not already running
echo -e "\nChecking database... "
if ! docker ps | grep -q "magi-db-1"; then
    echo "Starting database..."
    docker compose up -d db
    # Wait for database to be ready
    echo "Waiting for database to be ready..."
    sleep 5
else
    echo "Database already running"
fi

# Build the docker image with --quiet flag when using cache
echo -e "\nBuilding Docker... "
export DOCKER_CLI_HINTS=false
docker build -t magi-engine:latest -f engine/docker/Dockerfile ./

# Run the docker container with all env variables from .env (removed -d to see output)
echo -e "\nTesting... "
docker run --rm --name $CONTAINER_NAME \
    -e PROCESS_ID=AI-test \
    -e HOST_HOSTNAME=host.docker.internal \
    -e CONTROLLER_PORT=3010 \
    -e TZ=$(date +%Z) \
    -e DATABASE_HOST=host.docker.internal \
    -e DATABASE_PORT=5432 \
    --env-file .env \
    -v claude_credentials:/claude_shared:rw \
    -v magi_output:/magi_output:rw \
    -v custom_tools:/custom_tools:rw \
    --add-host=host.docker.internal:host-gateway \
    --network host \
    magi-engine:latest \
    -t "$@"
