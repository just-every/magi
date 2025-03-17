"""
claude.py - Utilities for interacting with Claude CLI
"""

import os
import sys
import subprocess
from typing import Optional

def setup_claude_symlinks() -> bool:
    """Set up Claude authentication files by creating symlinks to shared volume."""

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

    elif os.path.exists(local_claude_dir) or os.path.islink(local_claude_dir):
        print(f"Using local claude")

    else:
        print(f"Warning: Shared directory {shared_dir} does not exist")

    return True


def run_claude_cli_sync(prompt: str, working_directory: Optional[str] = None) -> str:
    """
    Runs Claude Code CLI with the provided prompt to execute code tasks.
    Uses --print and --dangerously-skip-permissions flags for non-interactive execution.
    """
    # Run claude with specific flags for non-interactive usage

    result = subprocess.run(
        ["claude", "--dangerously-skip-permissions", "-p", prompt],
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
