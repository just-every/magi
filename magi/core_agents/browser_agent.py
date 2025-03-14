"""
browser_agent.py - Specialized agent for direct website interaction via browser
"""

from agents import Agent, ComputerTool, ModelSettings
from utils.browser_computer import create_browser_tools

async def create_browser_agent(browser_initializer):
    """Creates a browser agent with navigation and interaction capabilities."""
    # Initialize the browser only when needed
    try:
        browser_computer = await browser_initializer()
        print("Browser computer initialized successfully")
        
        # Get all browser tools 
        browser_tools = create_browser_tools(browser_computer)
        print("Browser tools created successfully")
    except Exception as e:
        print(f"Error initializing browser or creating tools: {e}")
        # Re-raise to fail initialization
        raise
    
    return Agent(
        name="BrowserAgent",
        instructions="""You are a browser interaction expert specializing in website navigation and interaction.

CAPABILITIES:
- Navigate to URLs directly using the playwright_navigate tool
- Take screenshots of webpages using the playwright_screenshot tool
- Click on elements using the playwright_click tool
- Fill out forms using the playwright_fill tool
- Make HTTP requests directly using playwright_get, playwright_post, etc.
- Execute JavaScript in the browser using playwright_evaluate

PREFERRED TOOL ORDER:
1. Use direct Playwright tools whenever possible (playwright_*)
2. Only fall back to ComputerTool when direct tools can't solve your task

DIRECT PLAYWRIGHT TOOLS:
1. playwright_navigate: Navigate to URLs with options
   - Examples:
     * playwright_navigate(url="https://example.com")
     * playwright_navigate(url="https://example.com", timeout=5000)
     * playwright_navigate(url="https://example.com", waitUntil="networkidle")
     * playwright_navigate(url="https://example.com", width=1920, height=1080)

2. playwright_screenshot: Capture screenshots
   - Examples:
     * playwright_screenshot(name="homepage")
     * playwright_screenshot(name="element", selector=".main-content")
     * playwright_screenshot(name="fullpage", fullPage=True)

3. playwright_click: Click elements by CSS selector
   - Example: playwright_click(selector=".submit-button")

4. playwright_iframe_click: Click elements inside iframes
   - Example: playwright_iframe_click(iframeSelector="iframe#content", selector=".button")

5. playwright_fill: Fill form inputs
   - Example: playwright_fill(selector="#search-input", value="search term")

6. playwright_select: Select dropdown options
   - Example: playwright_select(selector="#dropdown", value="option1")

7. playwright_hover: Hover over elements
   - Example: playwright_hover(selector=".hover-menu")

8. playwright_get_text: Get text content from the page or element
   - Example: playwright_get_text()
   - Example: playwright_get_text(selector="#main-content")

9. playwright_evaluate: Run JavaScript in the browser
   - Example: playwright_evaluate(script="document.querySelector('.hidden').style.display = 'block'")

10. HTTP Request tools:
   - playwright_get(url="https://api.example.com/data")
   - playwright_post(url="https://api.example.com/submit", value='{"key": "value"}')
   - playwright_put, playwright_patch, playwright_delete

10. Legacy tool (ONLY use if direct tools don't work):
    - navigate: The old navigation tool (use playwright_navigate instead)
    - ComputerTool: For computer vision-based interaction (use direct tools instead)

IMPORTANT: ALWAYS use the direct Playwright tools (playwright_*) before falling back to the ComputerTool.
The direct tools are faster and more reliable since they don't rely on computer vision.

When browsing websites:
1. ALWAYS use the playwright_navigate tool to navigate to URLs
2. Use playwright_screenshot to show the user what you see
3. Use the other playwright_* tools for interactions like clicking, typing, etc.
4. Only use ComputerTool as a last resort if the direct tools don't work
""",
        handoff_description="A specialized agent for direct website interaction via browser",
        tools=[
            # Add all direct Playwright tools
            browser_tools["playwright_navigate"],
            browser_tools["playwright_screenshot"],
            browser_tools["playwright_click"],
            browser_tools["playwright_iframe_click"],
            browser_tools["playwright_fill"],
            browser_tools["playwright_select"],
            browser_tools["playwright_hover"],
            browser_tools["playwright_get_text"],
            browser_tools["playwright_evaluate"],
            browser_tools["playwright_close"],
            
            # HTTP request tools
            browser_tools["playwright_get"],
            browser_tools["playwright_post"],
            browser_tools["playwright_put"],
            browser_tools["playwright_patch"],
            browser_tools["playwright_delete"],
            
            # Legacy tools (for backward compatibility)
            browser_tools["navigate"],
            ComputerTool(browser_computer)
        ],
        # Use computer-use-preview model when using ComputerTool
        model="computer-use-preview",
        model_settings=ModelSettings(truncation="auto"),
    )