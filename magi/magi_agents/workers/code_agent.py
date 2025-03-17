"""
code_agent.py - Specialized agent for writing, explaining and modifying code
"""

from agents import Agent, ModelSettings, function_tool
from magi.utils.claude import run_claude_cli_sync

# Use the decorator (real or mock)
@function_tool
def AICoder(prompt: str, working_directory: str = None) -> str:
    """
    Runs AICoder with the provided prompt to execute any coding tasks, no matter how complicated.
    """
    return run_claude_cli_sync(prompt, working_directory)

def create_code_agent() -> Agent:
    """Creates and returns the code agent with appropriate tools and instructions."""
    return Agent(
        name="CodeAgent",
        instructions="""You manage the tool `AICoder`.

Your `AICoder` tool is the most advanced AI coding tool on the planet. Think of it as a senior developer at a FANG company who is an expert in all programming languages and frameworks. It can write, modify, and explain code in any language. It can also run code and test it.

You work with `AICoder` get the job done. In most cases you should just pass your instructions on to `AICoder` and let it do the work. If there's an error you can try again until it completes the task.

**`AICoder` only knows the information you provide it in each `prompt`, and can read the file system at the `working_directory` - it has no additional context.** Please give `AICoder` all the information it needs to complete the task in your prompt. `AICoder` does not know what previous prompts were sent to it. You should summarize these before passing them to `AICoder` if you want it to have context.

You can let `AICoder` know this if relevant: You run in a virtual docker environment. You are safe to execute any commands via the shell that you would like. Your environment is the latest version of Debian Bookworm with all the default packages including node and python. You can install new packages as needed - there are no restrictions.

SELF-SUFFICIENCY PRINCIPLES:
Assume you have been given all the information necessary to complete the task.
1. Use `AICoder` without requesting additional information
2. If at first you don't succeed, try diverse actions to try again from multiple angles
3. If in doubt, make an educated guess the best possible approach
4. Return your final outcome and include any educated guesses you had to make
    """,
        handoff_description="A specialized agent for writing, explaining and modifying code",
        tools=[AICoder],
        model="gpt-4o-mini",
        model_settings=ModelSettings(tool_choice="required"),
    )
