#!/bin/sh
set -e

# Entrypoint script for MAGI controller container
# Handles proper signal forwarding and different start modes

# Define cleanup function
cleanup() {
  echo "Container is shutting down..."
  echo "IMPORTANT: Stopping all MAGI child containers first..."
  
  # Stop and remove all magi-AI* containers directly from Docker, excluding file-server
  echo "1. Stopping all MAGI AI process containers..."
  docker ps -a --filter 'name=magi-AI' -q | xargs -r docker stop --time=2 2>/dev/null || true
  docker ps -a --filter 'name=magi-AI' -q | xargs -r docker rm -f 2>/dev/null || true
  
  # Verify file-server is still running (it should not be included in cleanup)
  file_server=$(docker ps -q --filter 'name=magi-file-server')
  if [ -n "$file_server" ]; then
    echo "File server container is still running (good)"
  else
    echo "Note: File server container not found or not running"
  fi
  
  # Check if any containers are still running
  remaining=$(docker ps --filter 'name=magi-AI' -q | wc -l)
  if [ "$remaining" -gt "0" ]; then
    echo "WARNING: $remaining containers still running after first cleanup attempt!"
    echo "2. Force killing all remaining MAGI containers..."
    docker ps -q --filter 'name=magi-AI' | xargs -r docker kill 2>/dev/null || true
    docker ps -a -q --filter 'name=magi-AI' | xargs -r docker rm -f 2>/dev/null || true
  else
    echo "All MAGI containers successfully stopped"
  fi
  
  # Now terminate the Node.js process
  if [ -n "$child_pid" ]; then
    echo "3. Sending SIGTERM to child process $child_pid"
    kill -TERM "$child_pid" 2>/dev/null || true
    
    # Wait for process to terminate with timeout
    wait_count=0
    while kill -0 "$child_pid" 2>/dev/null && [ $wait_count -lt 10 ]; do
      echo "Waiting for process to terminate ($wait_count)..."
      sleep 1
      wait_count=$((wait_count + 1))
    done
    
    # Force kill if still running
    if kill -0 "$child_pid" 2>/dev/null; then
      echo "Process did not terminate gracefully, force killing..."
      kill -9 "$child_pid" 2>/dev/null || true
    else
      echo "Child process has terminated."
    fi
  fi
  
  # Final check for any remaining containers
  final_check=$(docker ps --filter 'name=magi-AI' -q | wc -l)
  if [ "$final_check" -gt "0" ]; then
    echo "CRITICAL: Still found $final_check containers after all cleanup attempts!"
    echo "4. Executing final emergency cleanup..."
    # Only kill/remove magi-AI containers, not everything (to preserve file-server)
    docker ps -q --filter 'name=magi-AI' | xargs -r docker kill 2>/dev/null || true
    docker ps -a -q --filter 'name=magi-AI' | xargs -r docker rm -f 2>/dev/null || true
  fi
  
  echo "Cleanup complete, exiting..."
  exit 0
}

# Trap SIGTERM and SIGINT
trap cleanup TERM INT

# Print environment for debugging
echo "Starting MAGI controller with NODE_ENV=${NODE_ENV:-production}"

# Determine what mode to start in
if [ "$1" = "dev" ]; then
  echo "Starting in development mode with nodemon..."
  # Start nodemon in foreground
  nodemon --config nodemon.json &
elif [ "$1" = "prod" ]; then
  echo "Starting in production mode..."
  # Start node in foreground
  node dist/server/server.js &
else
  # Default to running whatever command was passed
  echo "Running custom command: $@"
  exec "$@" &
fi

# Capture the child PID to forward signals
child_pid=$!
echo "Started process with PID $child_pid"

# Wait for child to exit
wait $child_pid
exit_code=$?

echo "Process exited with code $exit_code"
exit $exit_code