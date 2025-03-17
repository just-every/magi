"""
magi.core_agents package - A collection of agents for the MAGI system
"""

from agents import Agent
from magi.core_agents.code_agent import create_code_agent
from magi.core_agents.shell_agent import create_shell_agent
from magi.core_agents.search_agent import create_search_agent
from magi.core_agents.browser_agent import create_browser_agent
from magi.core_agents.worker_agent import create_worker_agent

def create_agent(agent: str = "supervisor") -> Agent:
    """Create a single agent."""

    if agent == "supervisor":
        from magi.core_agents.supervisor_agent import create_supervisor_agent
        return create_supervisor_agent()
    elif agent == "code":
        return create_code_agent()
    elif agent == "shell":
        return create_shell_agent()
    elif agent == "search":
        return create_search_agent()
    elif agent == "worker":
        return create_worker_agent()

    raise ValueError(f"Unknown agent type: {agent}")


def agents_as_tools() -> list:
    """Get agents which are run as tools."""

    return [
        create_code_agent().as_tool(
            tool_name="CodeAgent",
            tool_description="Programming expert - one of the best programmers in the world who can handle new projects, editing, debugging, refactoring and has advanced knowledge about how programs work.",
        ),
        create_browser_agent().as_tool(
            tool_name="BrowserAgent",
            tool_description="An expert at using a browser. Full navigation, content extraction and interaction capabilities. Can write and use advanced JavaScript to interact with website.",
        ),
        create_search_agent().as_tool(
            tool_name="SearchAgent",
            tool_description="An expert at performing web searches and returning targeted results.",
        ),
        create_shell_agent().as_tool(
            tool_name="ShellAgent",
            tool_description="Talks to your shell and can run shell commands, create files and directories, and manage your file system.",
        ),
    ]
