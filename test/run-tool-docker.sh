#!/usr/bin/env bash
set -euo pipefail
# Usage: ./run-tool-docker.sh path/to/tool.ts '{"json":"args"}' [agent_id]
#
# This script runs a TypeScript file inside the magi-base Docker container
# using the magi-run-tool command. This ensures that the execution environment
# matches the one used in production.
#
# Arguments:
#   1. Path to TypeScript file (relative to repo root)
#   2. JSON-encoded arguments string (defaults to '{}')
#   3. Agent ID (defaults to 'docker-test-agent')
#
# Example:
#   ./run-tool-docker.sh examples/hello-world.ts '{"name":"World"}'
#
# Returns the exit code from the container, and outputs stdout/stderr.

SCRIPT_PATH=$1
JSON_ARGS=${2:-'{}'}
AGENT_ID=${3:-'docker-test-agent'}

# Ensure script path exists and is a TypeScript file
if [ ! -f "$SCRIPT_PATH" ]; then
  echo "❌ Error: File not found: $SCRIPT_PATH"
  exit 1
fi

# Verify it's a TypeScript file
if [[ ! "$SCRIPT_PATH" == *.ts ]]; then
  echo "❌ Error: Only TypeScript (.ts) files are supported. Got: $SCRIPT_PATH"
  exit 1
fi

# Get absolute path for mapping into container
ABS_PATH=$(realpath "$SCRIPT_PATH")
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# Convert to path inside container
CONTAINER_PATH=${ABS_PATH#$REPO_ROOT/}

# Generate a random container name suffix
RANDOM_SUFFIX=$(openssl rand -hex 4)
CONTAINER_NAME="test-tool-${RANDOM_SUFFIX}"

# Build the docker image with --quiet flag when using cache
echo "🔄 Building magi-system:latest image (if needed)..."
export DOCKER_CLI_HINTS=false
docker build -t magi-system:latest -f magi/docker/Dockerfile "$REPO_ROOT" >/dev/null

echo "ℹ️ Script path: $SCRIPT_PATH"
echo "ℹ️ Agent ID: $AGENT_ID"
echo "ℹ️ JSON args: $JSON_ARGS"
echo "🚀 Running magi-run-tool inside container..."

# Run the container with a direct mount of the TypeScript file to /tmp/tool_script.ts
# Use the container's entrypoint script which handles proper user switching
docker run --rm --name $CONTAINER_NAME \
    -e PROCESS_ID=AI-test-tool \
    -e HOST_HOSTNAME=host.docker.internal \
    -e CONTROLLER_PORT=3010 \
    -e TZ=$(date +%Z) \
    --env-file .env \
    -v claude_credentials:/claude_shared:rw \
    -v magi_output:/magi_output:rw \
    -v "$ABS_PATH:/tmp/tool_script.ts:ro" \
    --add-host=host.docker.internal:host-gateway \
    magi-system:latest \
    magi-run-tool "$AGENT_ID" "/tmp/tool_script.ts" "$JSON_ARGS"

# Capture exit code
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Tool executed successfully"
else
  echo "❌ Tool execution failed with exit code $EXIT_CODE"
fi

exit $EXIT_CODE
