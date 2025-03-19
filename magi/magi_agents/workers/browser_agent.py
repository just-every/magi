"""
browser_agent.py - Specialized agent for direct website interaction via browser
"""

import os
import asyncio
from playwright.async_api import Browser, Page, Playwright, async_playwright
from agents import (
    Agent,
    ComputerTool,
    ModelSettings
)
from magi.utils.computer import (
    LocalPlaywrightComputer,
    CustomAgentHooks,
    navigate,
    get_HTML,
    get_text,
    take_screenshot,
    element_click,
    element_hover,
    element_fill,
    element_check,
    execute_javascript,
    reset_session
)
from magi.utils.file_utils import write_file, read_file
from magi.magi_agents.workers.code_agent import create_code_agent
from magi.magi_agents.workers.browser_vision_agent import create_browser_vision_agent
from magi.magi_agents import FILE_TOOLS_TEXT


def create_browser_agent() -> Agent:
    """Creates a browser agent with full navigation, content extraction and interaction capabilities."""
    # Initialize computer tool with LocalPlaywrightComputer when needed
    # Only create the browser computer when the tool is used
    computer = LocalPlaywrightComputer()

    # Setup signal handlers to properly close resources
    import signal
    import sys
    
    # Store original handlers
    original_sigint = signal.getsignal(signal.SIGINT)
    original_sigterm = signal.getsignal(signal.SIGTERM)
    
    def signal_handler(sig, frame):
        """Handle signals by nullifying browser resources before exit"""
        print("Closing browser resources...")
        
        # Simply set resources to None to prevent further access
        if hasattr(computer, '_browser'):
            computer._browser = None
            
        if hasattr(computer, '_playwright'):
            computer._playwright = None
            
        # Call original handler
        if sig == signal.SIGINT and original_sigint:
            if original_sigint != signal.SIG_DFL and original_sigint != signal.SIG_IGN:
                original_sigint(sig, frame)
            else:
                sys.exit(0)
        elif sig == signal.SIGTERM and original_sigterm:
            if original_sigterm != signal.SIG_DFL and original_sigterm != signal.SIG_IGN:
                original_sigterm(sig, frame)
            else:
                sys.exit(0)
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    return Agent(
        name="BrowserAgent",
        instructions="""You are a browser interaction expert specializing in website navigation and interaction.

Choose the most appropriate tools in series to complete the requested task in full. You have access to a chrome web browser with full control over it. You always start with a fresh browser session with no stored cookies or data - you do not need to call reset_session at the start. All tools operate on the same browser session.

**Your tools only know the information you provide them in their input - they have no additional context.**
When using JavaScriptCodeAgent or BrowserVisionAgent you should provide a full explanation of the task to they can be effective at finding a solution.

PREFERRED APPROACH:
1. Start by using `navigate` to go to the desired URL
2. Use either `get_HTML`, `get_text` or `take_screenshot` to read the page
3. If needed, use one of the `element_*` tools to interact with the page - you will need to read the HTML to determine the correct selector
4. Use `execute_javascript` to perform advanced actions - it gives you full control over the web page. Use JavaScriptCodeAgent to write complex scripts.
5. If all else fails, you can attempt to interact with the browser using the BrowserVisionAgent which uses computer vision. It is expensive and slow, so best avoided unless necessary. It uses the same browser session as your other tools.

COMMON ARGUMENTS:
- selector: A CSS selector to limit the tool to
- has_text: In addition to the selector, also limits to elements containing text somewhere inside (case-insensitive sub-string)

SCREENSHOT USAGE:
Screenshots are saved to a file and the file path is returned. The requesting agent can access the screenshot filename, so you do not need to send the full file in your response.
Your screenshots may show errors as you are running a headless browser, that's fine, don't attempt a perfect image unless explicitly asked.

{FILE_TOOLS_TEXT}

SELF-SUFFICIENCY PRINCIPLES:
Assume you have been given all the information necessary to complete the task.
1. Complete task without requesting additional information
2. If at first you don't succeed, try diverse actions to try again from multiple angles
3. If in doubt, make an educated guess the best possible approach
4. After several attempts return your best result and include any educated guesses or issues you experienced
""",
        handoff_description="A specialized agent for direct website interaction via browser",
        tools=[
            navigate,
            get_HTML,
            get_text,
            take_screenshot,
            element_click,
            element_hover,
            element_fill,
            element_check,
            execute_javascript,
            reset_session,
            write_file,
            read_file,
            create_code_agent().as_tool(
                tool_name="JavaScriptCodeAgent",
                tool_description="JavaScript programming expert - can write any code requested",
            ),
            create_browser_vision_agent(computer).as_tool(
                tool_name="BrowserVisionAgent",
                tool_description="A fallback browser agent which can be used when the browser agent fails. It uses computer vision to interact with the browser.",
            ),
        ],
        model=os.environ.get("MAGI_BROWSER_MODEL", "computer-use-preview"),  # Default to vision-capable model
        model_settings=ModelSettings(parallel_tool_calls=True),
        hooks=CustomAgentHooks(display_name="BrowserAgent", computer=computer),
    )
