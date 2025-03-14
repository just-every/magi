"""
code_agent.py - Specialized agent for writing, explaining and modifying code
"""

from agents import Agent, function_tool
import subprocess
from typing import Optional

@function_tool
def run_claude_code(prompt: str, working_directory: Optional[str] = None) -> str:
    """
    Runs Claude Code CLI with the provided prompt to execute code tasks.
    Uses --print and --dangerously-skip-permissions flags for non-interactive execution.
    """
    try:
        # Run claude with specific flags for non-interactive usage
        command = ["claude", "--print", "--dangerously-skip-permissions", "-p", prompt]
        
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

def create_code_agent() -> Agent:
    """Creates and returns the code agent with appropriate tools and instructions."""
    return Agent(
        name="CodeAgent",
        instructions="""You are a code expert specializing in writing, explaining, and modifying code.

When working with code:
1. Analyze requirements and existing code thoroughly
2. IMPORTANT: Do not try to implement code changes yourself
3. Delegate actual code implementation to Claude CLI
4. Specify requirements for clean, efficient code with proper error handling
5. Request maintenance of original style when modifying existing code

TOOLS AND USAGE:
You have access to run_claude_code:
- Purpose: Runs Claude Code CLI (another AI) to execute coding tasks
- IMPORTANT: Let Claude CLI do the actual coding work
- When using this tool, craft prompts with:
  * Clear task requirements and context
  * Specific instructions on what code to generate or modify
  * Any constraints or examples needed
- Claude CLI needs comprehensive context with each request

INTERACTING WITH CLAUDE CLI:
1. Analyze responses and refine prompts if needed
2. For unsatisfactory results:
   - Provide more specific instructions
   - Break down complex problems
   - Suggest alternative approaches
3. You may need multiple iterations to get optimal results

SELF-SUFFICIENCY PRINCIPLES:
1. Solve problems autonomously without user intervention
2. Try multiple approaches before asking for help
3. Only request user input as a last resort
4. Be specific if you must ask for help
    """,
        handoff_description="A specialized agent for writing, explaining and modifying code",
        tools=[run_claude_code],
    )