#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

echo "Entrypoint: Setting up Claude credential links..."

# Target directory and file paths in the user's home
CLAUSE_DIR_TARGET="/home/magi_user/.claude"
CLAUSE_JSON_TARGET="/home/magi_user/.claude.json"

# Source directory and file paths from the mounted volume
CLAUSE_DIR_SOURCE="/claude_shared/.claude"
CLAUSE_JSON_SOURCE="/claude_shared/.claude.json"

# Check if source directory exists in the volume mount
if [ -d "$CLAUSE_DIR_SOURCE" ]; then
    rm -rf "$CLAUSE_DIR_TARGET"
    ln -sf "$CLAUSE_DIR_SOURCE" "$CLAUSE_DIR_TARGET"
    echo "Linked $CLAUSE_DIR_SOURCE -> $CLAUSE_DIR_TARGET"
else
    echo "Warning: Source directory $CLAUSE_DIR_SOURCE not found in /claude_shared."
fi

# Check if source file exists in the volume mount
if [ -f "$CLAUSE_JSON_SOURCE" ]; then
    rm -f "$CLAUSE_JSON_TARGET"
    ln -sf "$CLAUSE_JSON_SOURCE" "$CLAUSE_JSON_TARGET"
    echo "Linked $CLAUSE_JSON_SOURCE -> $CLAUSE_JSON_TARGET"
else
    echo "Warning: Source file $CLAUSE_JSON_SOURCE not found in /claude_shared."
fi

echo "Entrypoint: Setup complete."

# --- > Logic to handle command execution < ---

# Check if the first argument passed ($1) starts with '-' or is empty
# If it is, assume the arguments are options for the default CMD
# Note: [ "${1#-}" != "$1" ] is a portable way to check if $1 starts with -
if [ -z "$1" ] || [ "${1#-}" != "$1" ]; then
  echo "Entrypoint: Prepending default command 'node dist/magi.js' to arguments: $@"
  # 'set --' modifies the script's positional parameters ($@)
  set -- node dist/magi.js "$@"
else
  # If the first argument doesn't start with '-', assume the user wants
  # to run that command instead of the default CMD.
  echo "Entrypoint: Executing command provided: $@"
fi

# Execute the command (either the default with args, or the user-provided one)
# 'exec' replaces the shell process, ensuring signals are handled correctly.
exec "$@"
