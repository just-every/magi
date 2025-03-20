"""
magi.magi_agents package - A collection of agents for the MAGI system

Use direct paths to avoid circular imports
"""

from agents import Agent
from magi.utils import output_directory

# Dictionary of agent descriptions
AGENT_DESCRIPTIONS = {
    "CodeAgent": "CodeAgent -The most advanced AI coding tool on the planet. Think of it as a senior developer at a FANG company who is an expert in all programming languages and frameworks. It can write, modify, and explain code in any language. It can also run code and test it. Has full access to the file system and an expert at analysing code bases. Can run shell commands.",
    "BrowserAgent": "BrowserAgent - Has full control over a web browser and can perform any kind of navigation, content extraction, and interaction. It can write and use advanced JavaScript to interact with websites. It can also take screenshots and perform other browser-related tasks.",
    "SearchAgent": "SearchAgent - A web search expert specializing in finding information online. Can perform a series of searches to return highly targeting information and choose the appropriate level of information to return.",
    "ShellAgent": "ShellAgent - Shell commands and file system operations expert. Can read the current file system and perform any kind of bash command requested.",
    "ReasoningAgent": "ReasoningAgent - An expert at thinking through complicated problems. Has more skills, experience and ability to solve complicated problems than standard agents. Particularly useful for breaking down complex tasks that have multiple possible solutions or require deeper analysis.",
    "ManagerAgent": "ManagerAgent - A highly knowledgeable AI manager who is given discrete tasks to work on. Manages groups of workers who are specialized at writing code, searching the web, using a browser, and running shell commands. Managers can also think for themselves and can be largely autonomous.",
    "SelfOptimizationAgent": "SelfOptimizationAgent - A specialized agent for optimizing the MAGI codebase to better handle specific tasks. It can analyze tasks, plan code modifications, implement changes, and test them. This agent enables MAGI to adapt itself for improved performance on specific tasks.",
}

# Common warnings text
COMMON_WARNINGS = """WARNINGS:
Your agents only have the information you provide them in their input. They have no other context beyond this. As all your agents are AI agents, you should provide them with sufficient context to complete their tasks. The best approach is to give them an overall view of the general task and their specific goal within that task.
Agents are expected to work autonomously, so will rarely ask additional questions. It's important to provide as much information as needed up front.
Some agents may return incorrect results or even return an error. If you are uncertain of the result, you should try again a different way to confirm."""

# File tools description text
FILE_TOOLS_TEXT = """FILE TOOLS:
- Use `write_file` to pass files around as there are token limits to your output. Include the filename you saved to.
- Use `read_file` to read a filename which has been sent to you by another agent."""

# Docker environment text
DOCKER_ENV_TEXT = f"""ENVIRONMENT:
You and all your agents run in a virtual docker environment. You are safe to execute any commands that you would like. Your environment is the latest version of Debian Bookworm with all the default packages. Your agents and your supervisor all have access to either the shared {output_directory()} directory."""

# Self sufficiency text
SELF_SUFFICIENCY_TEXT = """SELF-SUFFICIENCY PRINCIPLES:
Assume you have been given all the information necessary to complete the task.
- If in doubt, make an educated guess the best possible approach
- Return your best possible response and include any educated guesses you had to make"""


def create_agent(agent: str = "supervisor", model: str = None) -> Agent:
    """
    Create a single agent.
    
    Args:
        agent: The type of agent to create
        model: Optional model override
    
    Returns:
        Agent: The configured agent
    """
    # Create the agent based on the type
    if agent == "supervisor":
        from magi.magi_agents.supervisor_agent import create_supervisor_agent
        agent_instance = create_supervisor_agent()
    elif agent == "code":
        from magi.magi_agents.workers.code_agent import create_code_agent
        agent_instance = create_code_agent()
    elif agent == "browser":
        from magi.magi_agents.workers.browser_agent import create_browser_agent
        agent_instance = create_browser_agent()
    elif agent == "shell":
        from magi.magi_agents.workers.shell_agent import create_shell_agent
        agent_instance = create_shell_agent()
    elif agent == "search":
        from magi.magi_agents.workers.search_agent import create_search_agent
        agent_instance = create_search_agent()
    elif agent == "reasoning":
        from magi.magi_agents.workers.reasoning_agent import create_reasoning_agent
        agent_instance = create_reasoning_agent()
    elif agent == "worker":
        from magi.magi_agents.workers.manager_agent import create_manager_agent
        agent_instance = create_manager_agent()
    elif agent == "self-optimization":
        from magi.magi_agents.self_optimization_agent import create_self_optimization_agent
        agent_instance = create_self_optimization_agent()
    else:
        raise ValueError(f"Unknown agent type: {agent}")
    
    # Override the model if specified
    if model:
        agent_instance.model = model
        
        # Apply model-specific settings
        from agents import ModelSettings
        from magi.utils.model_provider import MODEL_TO_PROVIDER
        
        # Get the provider for this model
        provider = MODEL_TO_PROVIDER.get(model)
        
        # If this is a Claude model, modify settings
        if provider == "anthropic":
            import logging
            logging.info(f"Applying Claude-specific settings for model {model}")
            
            # Claude models don't support parallel_tool_calls
            agent_instance.model_settings = ModelSettings(
                truncation="auto", 
                parallel_tool_calls=False  # Disable parallel tool calls for Claude
            )
            
            # Limit max tokens used by Claude 
            max_tokens = 4096
            if "-sonnet-" in model:
                max_tokens = 32000
            if "claude-3-7-sonnet" in model:
                max_tokens = 32000
                
            # Store the max tokens as an attribute on the agent
            agent_instance.max_tokens = max_tokens
        
        # If this is a Grok model, modify settings
        elif provider == "xai":
            import logging
            logging.info(f"Applying Grok-specific settings for model {model}")
            
            # Grok models don't support parallel_tool_calls
            agent_instance.model_settings = ModelSettings(
                truncation="auto", 
                parallel_tool_calls=False  # Disable parallel tool calls for Grok
            )
            
            # Limit max tokens used by Grok
            max_tokens = 4096
            if "grok-2" in model:
                max_tokens = 8192
                
            # Store the max tokens as an attribute on the agent
            agent_instance.max_tokens = max_tokens
        
        # If this is a Gemini model, modify settings 
        elif provider == "google":
            import logging
            logging.info(f"Applying Gemini-specific settings for model {model}")
            
            # Gemini models might not support parallel_tool_calls
            agent_instance.model_settings = ModelSettings(
                truncation="auto", 
                parallel_tool_calls=False  # Disable parallel tool calls for Gemini
            )
            
            # Limit max tokens used by Gemini
            max_tokens = 4096
            if "gemini-2.0-ultra" in model or "gemini-1.5-pro" in model:
                max_tokens = 16384
            elif "gemini-2.0-flash" in model or "gemini-1.5-flash" in model or "gemini-pro" in model:
                max_tokens = 8192
                
            # Store the max tokens as an attribute on the agent
            agent_instance.max_tokens = max_tokens
            
    return agent_instance


def worker_agents_as_tools(include_reasoning = True) -> list:
    """Get worker agents as tools."""
    from magi.magi_agents.workers.code_agent import create_code_agent
    from magi.magi_agents.workers.browser_agent import create_browser_agent
    from magi.magi_agents.workers.search_agent import create_search_agent
    from magi.magi_agents.workers.shell_agent import create_shell_agent

    tools = [
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

    if include_reasoning:
        from magi.magi_agents.workers.reasoning_agent import create_reasoning_agent
        tools.append(
            create_reasoning_agent().as_tool(
                tool_name="ReasoningAgent",
                tool_description="An expert at thinking through complicated problems.",
            )
        )

    return tools
