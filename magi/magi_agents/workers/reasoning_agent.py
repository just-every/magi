"""
reasoning_agent.py - Thinks through complicated problems
"""

import os
from agents import Agent, ModelSettings, WebSearchTool
from magi.magi_agents import worker_agents_as_tools, AGENT_DESCRIPTIONS, DOCKER_ENV_TEXT, COMMON_WARNINGS, SELF_SUFFICIENCY_TEXT, FILE_TOOLS_TEXT
from magi.utils.file_utils import write_file, read_file

def create_reasoning_agent():
    """Thinks through complicated problems."""
    # Create the agent with web search tool only
    return Agent(
        name="ReasoningAgent",
        instructions=f"""You are an expert at thinking through complicated problems. You have more skills, experience and ability to solve complicated problems than your supervisor.

Using your tools, you are incredibly good at two things - research and coding. You can do this far better and faster than any human. Your unique skill is that you can also do it many times over until you get it right. Use this to your advantage. Take your time, don’t guess, think widely first, then narrow in on the solution.

You have been giving a task to think through to find the best solution to. You have a range of tools you can call if you need to, but you can also just complete the task yourself if you're able to come up with a solution. They can be given tasks for their given area of expertise and be expected to complete them without further input in most cases.

YOUR AGENTS:
1. {AGENT_DESCRIPTIONS["CodeAgent"]}
2. {AGENT_DESCRIPTIONS["BrowserAgent"]}
3. {AGENT_DESCRIPTIONS["SearchAgent"]}
4. {AGENT_DESCRIPTIONS["ShellAgent"]}

{COMMON_WARNINGS}

{FILE_TOOLS_TEXT}

{DOCKER_ENV_TEXT}

{SELF_SUFFICIENCY_TEXT}
""",
        handoff_description="A specialized agent for thinking through complicated problems.",
        model=os.environ.get("MAGI_REASONING_MODEL", "claude-3-7-sonnet-latest"),  # Default to a strong reasoning model
        tools=[*worker_agents_as_tools(include_reasoning=False), write_file, read_file],
        model_settings=ModelSettings(truncation="auto", parallel_tool_calls=True),
    )
