"""
shell_agent.py - Specialized agent for file system operations and project organization
"""

import os
from agents import Agent, ModelSettings, function_tool
import subprocess
from typing import Optional
from magi.utils.file_utils import write_file, read_file
from magi.magi_agents import FILE_TOOLS_TEXT

@function_tool
def bash(command: str, working_directory: Optional[str] = None) -> str:
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

def create_shell_agent() -> Agent:
    """Creates and returns the shell agent with appropriate tools and instructions."""
    return Agent(
        name="ShellAgent",
        instructions="""You are a shell expert specializing in shell commands and file operations.

You run in a virtual docker environment. You are safe to execute any commands via the shell that you would like.
Your environment is the latest version of Debian Bookworm with all the default packages including node and python.
You can install new packages as needed - there are no restrictions.

**Your tools only know the information you provide them in their input - they have no additional context.**

Provide your commands to the `bash` tool in series. Look at their output and complete the next command until your task is complete.

{FILE_TOOLS_TEXT}

SELF-SUFFICIENCY PRINCIPLES:
Assume you have been given all the information necessary to complete the task.
1. Run your commands without requesting additional information
2. If at first you don't succeed, try diverse commands to try again from multiple angles
3. If in doubt, make an educated guess the best possible approach
4. Return your final outcome and include any educated guesses you had to make
    """,
        handoff_description="A specialized agent for file system operations and project organization",
        tools=[bash, write_file, read_file],
        model=os.environ.get("MAGI_SHELL_MODEL", "gpt-4o-mini"),  # Default to mini model
        model_settings=ModelSettings(truncation="auto", parallel_tool_calls=True),
    )
