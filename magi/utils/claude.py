"""
claude.py - Utilities for interacting with Claude CLI
"""

import os
import sys
import subprocess
from typing import Optional

def setup_claude_symlinks() -> bool:
    """Set up Claude authentication files by creating symlinks to shared volume."""
    try:
        # Get the user's home directory
        home_dir = os.path.expanduser("~")

        # Claude credentials should be in the shared volume
        shared_dir = "/claude_shared"
        shared_claude_dir = os.path.join(shared_dir, ".claude")
        shared_claude_json = os.path.join(shared_dir, ".claude.json")

        # Local paths for symlinks
        local_claude_dir = os.path.join(home_dir, ".claude")
        local_claude_json = os.path.join(home_dir, ".claude.json")

        # Create symlinks to the shared volume
        if os.path.exists(shared_dir):
            # Remove existing files/symlinks if they exist
            if os.path.exists(local_claude_dir) or os.path.islink(local_claude_dir):
                try:
                    if os.path.islink(local_claude_dir):
                        os.unlink(local_claude_dir)
                    else:
                        import shutil
                        shutil.rmtree(local_claude_dir)
                except Exception as e:
                    print(f"Warning: Could not remove existing .claude directory: {str(e)}")

            if os.path.exists(local_claude_json) or os.path.islink(local_claude_json):
                try:
                    os.unlink(local_claude_json)
                except Exception as e:
                    print(f"Warning: Could not remove existing .claude.json file: {str(e)}")

            # Create the directory in shared volume if it doesn't exist
            if not os.path.exists(shared_claude_dir):
                try:
                    os.makedirs(shared_claude_dir, exist_ok=True)
                except Exception as e:
                    print(f"Warning: Could not create {shared_claude_dir}: {str(e)}")

            # Create the JSON file in shared volume if it doesn't exist
            if not os.path.exists(shared_claude_json):
                try:
                    with open(shared_claude_json, 'w') as f:
                        f.write('{"default_profile": "default"}')
                except Exception as e:
                    print(f"Warning: Could not create {shared_claude_json}: {str(e)}")

            # Create symlinks
            try:
                os.symlink(shared_claude_dir, local_claude_dir)
            except Exception as e:
                print(f"Warning: Could not create symlink to .claude directory: {str(e)}")

            try:
                os.symlink(shared_claude_json, local_claude_json)
            except Exception as e:
                print(f"Warning: Could not create symlink to .claude.json file: {str(e)}")
        else:
            print(f"Warning: Shared directory {shared_dir} does not exist")

        return True
    except Exception as e:
        print(f"Error setting up Claude credentials: {str(e)}")
        return False

async def run_claude_cli(command: str) -> str:
    """
    Run a command using the Claude CLI directly.
    
    Args:
        command: The command string to process
        
    Returns:
        Result string
    """
    try:
        process = subprocess.Popen(
            ["claude", "--dangerously-skip-permissions", "-p", command],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,  # Line buffered
            universal_newlines=True
        )

        # Collect all output for return value
        fallback_output = []

        # Stream stdout in real-time
        for line in process.stdout:
            print(line, end='')  # Print to docker logs
            sys.stdout.flush()   # Ensure output is flushed
            fallback_output.append(line)

        # Get return code
        process.wait()

        # Check for any stderr output
        stderr_output = process.stderr.read()
        if stderr_output:
            print(f"Claude error: {stderr_output}")

        result = ''.join(fallback_output)
        return result
    except Exception as fallback_error:
        error_msg = f"Error using Claude CLI: {str(fallback_error)}"
        print(error_msg)
        return error_msg

def run_claude_cli_sync(prompt: str, working_directory: Optional[str] = None) -> str:
    """
    Runs Claude Code CLI with the provided prompt to execute code tasks.
    Uses --print and --dangerously-skip-permissions flags for non-interactive execution.
    """
    try:
        # Run claude with specific flags for non-interactive usage
        command = ["claude", "--dangerously-skip-permissions", "-p", prompt]

        result = subprocess.run(
            command,
            cwd=working_directory,
            capture_output=True,
            text=True,
            check=False
        )

        # Check for any errors
        if result.returncode != 0:
            return f"ERROR: Claude execution failed with code {result.returncode}\nSTDERR: {result.stderr}"

        # Return the output
        return result.stdout

    except Exception as e:
        return f"Error executing Claude Code: {str(e)}"