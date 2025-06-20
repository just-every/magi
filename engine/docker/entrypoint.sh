#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# Fix for Node.js io_uring bug that causes PTY disconnects
# This bug affects Node versions after 20.3.0 (including Node 23)
export UV_USE_IO_URING=0

# --- Claude Config Linking ---
# Target directory and file paths in the user's home
CLAUSE_DIR_TARGET="/home/magi_user/.claude"
CLAUSE_JSON_TARGET="/home/magi_user/.claude.json"

# Source directory and file paths from the mounted volume
CLAUSE_DIR_SOURCE="/claude_shared/.claude"
CLAUSE_JSON_SOURCE="/claude_shared/.claude.json"

# Check if source directory exists in the volume mount
if [ -d "$CLAUSE_DIR_SOURCE" ]; then
    # Ensure target exists as a directory before removing (safety)
    if [ -e "$CLAUSE_DIR_TARGET" ]; then
        rm -rf "$CLAUSE_DIR_TARGET"
    fi
    # Link the source directory to the target location
    ln -sf "$CLAUSE_DIR_SOURCE" "$CLAUSE_DIR_TARGET"
    echo "Linked $CLAUSE_DIR_SOURCE to $CLAUSE_DIR_TARGET"
fi

# Check if source file exists in the volume mount
if [ -f "$CLAUSE_JSON_SOURCE" ]; then
    # Ensure target exists as a file before removing (safety)
    if [ -e "$CLAUSE_JSON_TARGET" ]; then
        rm -f "$CLAUSE_JSON_TARGET"
    fi
    # Link the source file to the target location
    ln -sf "$CLAUSE_JSON_SOURCE" "$CLAUSE_JSON_TARGET"
    echo "Linked $CLAUSE_JSON_SOURCE to $CLAUSE_JSON_TARGET"
fi

# --- Git Safe Directory Configuration ---
# Configure Git to trust the /magi_output directory and subdirectories
echo "Configuring Git to trust directories in /magi_output..."
gosu magi_user git config --global --add safe.directory '*'
echo "Git safe.directory configuration set"

# --- Fix /magi_output Permissions (lightweight) ---
echo "Ensuring /magi_output is owned by magi_user..."
chown magi_user:magi_user /magi_output 2>/dev/null || true
echo "Ownership checked for /magi_output"

# --- Fix /claude_shared Permissions ---
echo "Ensuring /claude_shared is owned by magi_user..."
chown -R magi_user:magi_user /claude_shared 2>/dev/null || true
echo "Ownership set for /claude_shared"

# Check if PROCESS_ID environment variable is set
if [ -n "$PROCESS_ID" ]; then
    PROCESS_DIR="/magi_output/$PROCESS_ID"
    echo "Ensuring directory $PROCESS_DIR exists and has correct permissions..."
    # Create the directory if it doesn't exist
    mkdir -p "$PROCESS_DIR"
    # Change ownership to magi_user:magi_user
    # This would be redundant if we fixed ownership above, but we keep it for safety
    chown magi_user:magi_user "$PROCESS_DIR"
    echo "Permissions set for $PROCESS_DIR"
else
    echo "Warning: PROCESS_ID environment variable not set. Cannot fix permissions for specific process directory."
fi

# --- Handle SSL certificate issues ---
# This helps with network environments that have certificate issues
# Only enable in development mode (when explicitly requested)
if [ "$DISABLE_TLS_VERIFICATION" = "true" ]; then
    export NODE_TLS_REJECT_UNAUTHORIZED=0
    echo "WARNING: Disabling TLS certificate validation (development mode)"
fi

# --- Check for shared directory ---
SHARED_DIR="/magi_output/shared"
echo "Checking if $SHARED_DIR exists..."
if [ ! -d "$SHARED_DIR" ]; then
    echo "Creating $SHARED_DIR directory..."
    mkdir -p "$SHARED_DIR"
    # Set ownership to magi_user
    chown -R magi_user:magi_user "$SHARED_DIR"
    echo "Created $SHARED_DIR with correct permissions"
else
    echo "$SHARED_DIR already exists"
fi

# --- Move projects directory ---
# If PROCESS_ID is set and projects exist, move the entire projects directory
if [ -n "$PROCESS_ID" ]; then
    PROJECTS_SOURCE_DIR="/magi_output/$PROCESS_ID/projects"

    # Only proceed if the source directory exists
    if [ -d "$PROJECTS_SOURCE_DIR" ]; then
        echo "Moving projects directory from $PROJECTS_SOURCE_DIR to /app/projects..."

        # Remove existing /app/projects if it exists
        if [ -d "/app/projects" ]; then
            echo "  Removing existing /app/projects directory..."
            rm -rf "/app/projects"
        fi

        # Move the entire projects directory
        mv "$PROJECTS_SOURCE_DIR" "/app/projects"

        # Ensure correct ownership
        chown -R magi_user:magi_user "/app/projects"

        echo "Projects directory moved successfully"
    else
        echo "Projects source directory $PROJECTS_SOURCE_DIR does not exist yet"
        # Create empty /app/projects directory as fallback
        if [ ! -d "/app/projects" ]; then
            echo "Creating empty /app/projects directory..."
            mkdir -p "/app/projects"
            chown magi_user:magi_user "/app/projects"
        fi
    fi
fi

# --- Determine Command ---
# Check if the first argument passed ($1) starts with '-' or is empty
# If it is, assume the arguments are options for the default CMD
# Note: [ "${1#-}" != "$1" ] is a portable way to check if $1 starts with -
if [ -z "$1" ] || [ "${1#-}" != "$1" ]; then
    # 'set --' modifies the script's positional parameters ($@)
    # Prepend the default command 'node dist/magi.js' to the arguments
    set -- node --no-deprecation --experimental-vm-modules dist/magi.js "$@"
fi

# --- Execute Command as magi_user ---
# Use gosu to drop privileges and execute the final command as magi_user
# 'exec' replaces the shell process, ensuring signals are handled correctly.
echo "Executing command as user magi_user: $@"
exec gosu magi_user "$@"
