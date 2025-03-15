"""
filesystem_agent.py - Specialized agent for file system operations and project organization
"""

from agents import Agent, function_tool
import subprocess
from typing import Optional

@function_tool
def run_shell_command(command: str, working_directory: Optional[str] = None) -> str:
    """Execute a shell command."""
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=working_directory,
            capture_output=True,
            text=True,
            check=False
        )
        return f"STDOUT:\n{result.stdout}\n\nSTDERR:\n{result.stderr}\n\nExit code: {result.returncode}"
    except Exception as e:
        return f"Error executing command: {str(e)}"

def create_filesystem_agent() -> Agent:
    """Creates and returns the filesystem agent with appropriate tools and instructions."""
    return Agent(
        name="FilesystemAgent",
        instructions="""You are a filesystem expert specializing in file operations and project structure.

When working with files and directories:
1. Organize project structures efficiently
2. Create appropriate directory hierarchies
3. Execute file operations (create, move, copy, delete)
4. Handle permissions and access issues
5. Use error handling for file operations

TOOLS AND USAGE:
run_shell_command:
- Executes shell commands for file manipulation and system queries
- Use for creating directories (mkdir), listing files (ls), moving (mv), copying (cp), etc.
- Can specify an optional working directory
- Returns stdout, stderr, and exit code for debugging

SELF-SUFFICIENCY PRINCIPLES:
1. Work autonomously without user intervention
2. Use shell commands to gather filesystem information
3. When operations fail, try alternative approaches
4. Handle errors gracefully with fallback strategies
5. Only request user input as a last resort
    """,
        handoff_description="A specialized agent for file system operations and project organization",
        tools=[run_shell_command],
    )
