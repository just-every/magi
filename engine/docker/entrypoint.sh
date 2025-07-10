#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# Fix for Node.js io_uring bug that causes PTY disconnects
# This bug affects Node versions after 20.3.0 (including Node 23)
export UV_USE_IO_URING=0

# --- Home File/Directory Linking ---
# Dynamically link all files and directories from /magi_home/ to the user's home
HOME_SOURCE_DIR="/magi_home"
USER_HOME="/home/magi_user"

if [ -d "$HOME_SOURCE_DIR" ]; then
    echo "Linking home directory files from $HOME_SOURCE_DIR..."
    
    # Iterate through all items in /magi_home/
    for item in "$HOME_SOURCE_DIR"/.* "$HOME_SOURCE_DIR"/*; do
        # Skip . and .. entries
        basename_item=$(basename "$item")
        if [ "$basename_item" = "." ] || [ "$basename_item" = ".." ]; then
            continue
        fi
        
        # Skip if the glob didn't match anything
        if [ ! -e "$item" ]; then
            continue
        fi
        
        # Determine target path
        target="$USER_HOME/$basename_item"
        
        # Remove existing target if it exists
        if [ -e "$target" ]; then
            rm -rf "$target"
        fi
        
        # Create symlink
        ln -sf "$item" "$target"
        
        # Log what was linked
        if [ -d "$item" ]; then
            echo "Linked directory: $item -> $target"
        else
            echo "Linked file: $item -> $target"
        fi
    done
    
    echo "Home directory file linking complete"
else
    echo "No /magi_home directory found, skipping home linking"
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

# --- Fix /magi_home Permissions ---
echo "Ensuring /magi_home is owned by magi_user..."
chown -R magi_user:magi_user /magi_home 2>/dev/null || true
echo "Ownership set for /magi_home"

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
