#!/bin/bash
# Runner script for MAGI Native Messaging Host.
# Uses 'exec' to replace itself with the Node process.
# Logs only critical startup errors to stderr.

# Get the absolute path of the script's directory
# Handles spaces and symlinks correctly.
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
    DIR="$(cd -P "$(dirname "$SOURCE")" &> /dev/null && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE" # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" &> /dev/null && pwd)"

# --- Find Node.js executable ---
NODE_PATH=""
# Try common paths first, including 'which'
for path_cmd in \
    "which node" \
    "command -v node"; do
    node_loc=$($path_cmd 2> /dev/null)
    if [ -x "$node_loc" ]; then
        NODE_PATH="$node_loc"
        break
    fi
done

# If not found via which/command, check specific common locations
if [ -z "$NODE_PATH" ]; then
    for path in \
        "/usr/local/bin/node" \
        "/opt/homebrew/bin/node" \
        "$NVM_DIR/current/bin/node" \
        "$HOME/.nvm/current/bin/node" \
        "$HOME/.nvm/versions/node/*/bin/node" \
        "/opt/node/bin/node" \
        "/usr/bin/node"; do
        # Use parameter expansion for safer path checking if needed, but direct check is often fine
        if [ -x "$path" ]; then
            NODE_PATH="$path"
            break
        fi
    done
fi

# Final check if Node was found
if [ -z "$NODE_PATH" ] || [ ! -x "$NODE_PATH" ]; then
    # Log error to stderr - Chrome *might* capture this in its logs
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [RUNNER_ERROR] Could not find executable Node.js." >&2
    exit 1 # Exit runner if Node not found
fi

# --- Check JS File ---
JS_FILE="$SCRIPT_DIR/dist/bridge.js"
if [ ! -f "$JS_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [RUNNER_ERROR] Bridge JS file not found at $JS_FILE" >&2
    # NOTE: Compilation should happen *before* Chrome tries to launch this runner.
    exit 1 # Exit runner if JS file not found
fi

# --- Execute Node.js Script using exec ---
cd "$SCRIPT_DIR" # Ensure correct working directory

# Construct a potentially more useful PATH for the Node process
NODE_DIR=$(dirname "$NODE_PATH")
# Prioritize Node's directory, then common paths, then the PATH inherited from Chrome
FULL_PATH="$NODE_DIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Use exec to replace the shell process with the Node process.
# Node will inherit stdin/stdout from the runner.
# Node's own stderr logging should work.
exec env "PATH=$FULL_PATH" "$NODE_PATH" "$JS_FILE" "$@"

# --- Lines below this point will not be executed ---
exit 1 # Should not be reached, but exit with error just in case exec fails
