#!/bin/bash

echo "===== Testing All Tools ====="

# Generate a random container name suffix
RANDOM_SUFFIX=$(openssl rand -hex 4)
CONTAINER_NAME="magi-tools-test-${RANDOM_SUFFIX}"

# Build the docker image with --quiet flag
echo -e "\nBuilding docker image..."
export DOCKER_CLI_HINTS=false
docker build --quiet -t magi-system:latest -f magi/docker/Dockerfile .

# First test our Python test script
echo -e "\n\n===== Testing Tools with Python Script ====="
echo "Running test_tools.py outside of Docker..."
python test/test_tools.py

# Test within Docker
echo -e "\n\n===== Testing Tools with Docker ====="
echo "Running test_tools.py inside Docker..."
docker run --rm --name "${CONTAINER_NAME}-py" \
    --env-file .env \
    magi-system:latest \
    python /app/test/test_tools.py

# Test each model provider with a simple prompt that requires tool usage
echo -e "\n\n===== Testing OpenAI Model ====="
./test/magi-docker.sh -p "Calculate 25 plus 17" -m "gpt-4o-mini"

echo -e "\n\n===== Testing Claude Model ====="
./test/magi-docker.sh -p "Calculate 25 plus 17" -m "claude-3-5-haiku-latest"

echo -e "\n\n===== Testing Gemini Model ====="
./test/magi-docker.sh -p "Calculate 25 plus 17" -m "gemini-2.0-flash"

echo -e "\n\n===== Testing Grok Model ====="
./test/magi-docker.sh -p "Calculate 25 plus 17" -m "grok-2"

echo -e "\n\nAll tests completed."