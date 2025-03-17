"""
computer.py - Helper functions for working with playwright
"""

import os
import time
import io
import asyncio
from typing import Literal, Union, Any, Optional
from pathlib import Path

from PIL import Image

from playwright.async_api import Browser, Page, Playwright, async_playwright
from magi.utils import output_directory

from agents import (
    Agent,
    AgentHooks,
    RunContextWrapper,
    AsyncComputer,
    Button,
    Environment,
    Tool,
    function_tool,
)

NAVIGATE_TIMEOUT = 10000
ACTION_TIMEOUT = 10000

CUA_KEY_TO_PLAYWRIGHT_KEY = {
    "/": "Divide",
    "\\": "Backslash",
    "alt": "Alt",
    "arrowdown": "ArrowDown",
    "arrowleft": "ArrowLeft",
    "arrowright": "ArrowRight",
    "arrowup": "ArrowUp",
    "backspace": "Backspace",
    "capslock": "CapsLock",
    "cmd": "Meta",
    "ctrl": "Control",
    "delete": "Delete",
    "end": "End",
    "enter": "Enter",
    "esc": "Escape",
    "home": "Home",
    "insert": "Insert",
    "option": "Alt",
    "pagedown": "PageDown",
    "pageup": "PageUp",
    "shift": "Shift",
    "space": " ",
    "super": "Meta",
    "tab": "Tab",
    "win": "Meta",
}

async def write_file(filename: str, content: str, binary: Optional[bool]) -> str:
    """
    Save content to a file into a shared directory accessible to agents and users.

    Args:
        filename: Name of the file to save
        content: Content to write to the file
        binary: Whether the content is binary data encoded as a string (default False)

    Returns:
        Path to the saved file - accessible to add agents
    """
    # Get the output directory
    directory = output_directory()

    # Ensure the directory exists
    os.makedirs(directory, exist_ok=True)

    # Ensure directory for the file exists (for subdirectories like screenshots/)
    os.makedirs(os.path.dirname(os.path.join(directory, filename)), exist_ok=True)

    # Create the full path
    filepath = os.path.join(directory, filename)

    # Write the content to the file
    if binary:
        with open(filepath, "wb") as f:
            f.write(content.encode('latin1'))
    else:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

    return filepath


class LocalPlaywrightComputer(AsyncComputer):
    """A computer, implemented using a local Playwright browser."""

    def __init__(self):
        self._playwright: Union[Playwright, None] = None
        self._browser: Union[Browser, None] = None
        self._page: Union[Page, None] = None

    async def _get_browser_and_page(self) -> tuple[Browser, Page]:
        width, height = (768, 600)  # Fixed dimensions for consistent screenshots
        launch_args = [
            f"--window-size={width},{height}",
            '--disable-dev-shm-usage',  # Avoid memory issues in Docker
            '--no-sandbox',             # Required in some containerized environments
            '--disable-setuid-sandbox'  # Required in some containerized environments
        ]
        browser = await self.playwright.chromium.launch(
            headless=True,  # Use headless mode for server environments
            args=launch_args
        )
        context = await browser.new_context()
        page = await context.new_page()
        await page.set_viewport_size({"width": width, "height": height})
        return browser, page

    async def _reset_session(self) -> None:
        try:
            if self._page:
                # First close the current page
                await self._page.close()
                
            # Create a new context
            context = await self._browser.new_context()
            self._page = await context.new_page()
            await self._page.set_viewport_size({"width": 768, "height": 600})
        except Exception as e:
            print(f"Error resetting session: {e}")
            return f"Error resetting session: {e}"
        return "Session reset successfully"

    async def __aenter__(self):
        # Start Playwright and call the subclass hook for getting browser/page
        self._playwright = await async_playwright().start()
        self._browser, self._page = await self._get_browser_and_page()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        try:
            # Close browser first if it exists
            if self._browser:
                await self._browser.close()
            
            # Then stop playwright if it exists
            if self._playwright:
                await self._playwright.stop()
                
            # Clean up references
            self._browser = None
            self._playwright = None
            self._page = None
        except Exception as e:
            print(f"Error during browser cleanup: {e}")
            # Still clean up references
            self._browser = None
            self._playwright = None
            self._page = None

    @property
    def playwright(self) -> Playwright:
        assert self._playwright is not None
        return self._playwright

    @property
    def browser(self) -> Browser:
        assert self._browser is not None
        return self._browser

    @property
    def page(self) -> Page:
        assert self._page is not None
        return self._page

    @property
    def environment(self) -> Environment:
        return "browser"

    @property
    def dimensions(self) -> tuple[int, int]:
        return (768, 600)  # Fixed dimensions for consistent screenshots

    # Screenshots are now saved using write_file which handles directory creation

    async def screenshot(self, full_page=False) -> str:
        """
        Capture a screenshot with max 1200px height.

        Args:
            full_page: Whether to capture the full page or viewport

        Returns:
            Path to the saved screenshot file
        """
        quality = 70

        print(f"### URL IS {self.page.url}")

        # Generate a unique filename
        timestamp = int(time.time())
        url_part = self.page.url.replace("://", "_").replace("/", "_").replace(".", "_")[:50]
        filename = f"{timestamp}_{url_part}{'_full' if full_page else ''}.jpg"

        # Take screenshot
        png_bytes = await self.page.screenshot(full_page=full_page)

        try:
            # Process the image
            image = Image.open(io.BytesIO(png_bytes))
            width, height = image.size

            # Crop if height exceeds 1200px
            if height > 1200:
                image = image.crop((0, 0, width, 1200))

            # Save processed image
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format="JPEG", quality=quality, optimize=True)
            processed_image_bytes = img_byte_arr.getvalue()

            # Use write_file to save the image as binary
            filepath = await write_file(f"screenshots/{filename}", processed_image_bytes.decode('latin1'), binary=True)

        except Exception as e:
            print(f"Error processing image: {str(e)}. Saving uncompressed.")

            # Use write_file to save the unprocessed image as binary
            filepath = await write_file(f"screenshots/{filename}", png_bytes.decode('latin1'), binary=True)

        return filepath

    async def click(self, x: int, y: int, button: Button = "left") -> None:
        playwright_button: Literal["left", "middle", "right"] = "left"

        # Playwright only supports left, middle, right buttons
        if button in ("left", "right", "middle"):
            playwright_button = button  # type: ignore

        await self.page.mouse.click(x, y, button=playwright_button)

    async def double_click(self, x: int, y: int) -> None:
        await self.page.mouse.dblclick(x, y)

    async def scroll(self, x: int, y: int, scroll_x: int, scroll_y: int) -> None:
        await self.page.mouse.move(x, y)
        await self.page.evaluate(f"window.scrollBy({scroll_x}, {scroll_y})")

    async def type(self, text: str) -> None:
        await self.page.keyboard.type(text)

    async def wait(self) -> None:
        await asyncio.sleep(1)

    async def move(self, x: int, y: int) -> None:
        await self.page.mouse.move(x, y)

    async def keypress(self, keys: list[str]) -> None:
        for key in keys:
            mapped_key = CUA_KEY_TO_PLAYWRIGHT_KEY.get(key.lower(), key)
            await self.page.keyboard.press(mapped_key)

    async def drag(self, path: list[tuple[int, int]]) -> None:
        if not path:
            return
        await self.page.mouse.move(path[0][0], path[0][1])
        await self.page.mouse.down()
        for px, py in path[1:]:
            await self.page.mouse.move(px, py)
        await self.page.mouse.up()


class CustomAgentHooks(AgentHooks):
    def __init__(self, display_name: str, computer: LocalPlaywrightComputer):
        self.event_counter = 0
        self.display_name = display_name
        self.computer = computer

    async def prepare(self, context: RunContextWrapper) -> None:
        if self.computer and not self.computer._page:
            await self.computer.__aenter__()
        context.computer = self.computer

    async def on_start(self, context: RunContextWrapper, agent: Agent) -> None:
        self.event_counter += 1
        await self.prepare(context)
        print(f"### ({self.display_name}) {self.event_counter}: Agent {agent.name} started")

    async def on_end(self, context: RunContextWrapper, agent: Agent, output: Any) -> None:
        self.event_counter += 1
        print(
            f"### ({self.display_name}) {self.event_counter}: Agent {agent.name} ended with output {output}"
        )
        
        # Ensure computer resources are properly cleaned up
        try:
            if self.computer:
                # Set resources to None to help with garbage collection
                if hasattr(self.computer, '_browser'):
                    self.computer._browser = None
                if hasattr(self.computer, '_playwright'):
                    self.computer._playwright = None
                if hasattr(self.computer, '_page'):
                    self.computer._page = None
        except Exception as e:
            print(f"Error during computer cleanup in on_end: {e}")

    async def on_handoff(self, context: RunContextWrapper, agent: Agent, source: Agent) -> None:
        self.event_counter += 1
        await self.prepare(context)
        print(
            f"### ({self.display_name}) {self.event_counter}: Agent {source.name} handed off to {agent.name}"
        )

    async def on_tool_start(self, context: RunContextWrapper, agent: Agent, tool: Tool) -> None:
        self.event_counter += 1
        await self.prepare(context)
        print(
            f"### ({self.display_name}) {self.event_counter}: Agent {agent.name} started tool {tool.name}"
        )

    async def on_tool_end(
        self, context: RunContextWrapper, agent: Agent, tool: Tool, result: str
    ) -> None:
        self.event_counter += 1
        print(
            f"### ({self.display_name}) {self.event_counter}: Agent {agent.name} ended tool {tool.name} with result {result}"
        )



@function_tool
async def navigate(context: RunContextWrapper, url: str, wait_until: Optional[str] = None) -> str:
    """
    Navigate to a URL and returns the final URL the browser goes to.

    `wait_until` can be one of:
    - "commit" (default): when network response is received and the document started loading (very fast - recommended when you don't need all content to load)
    - "domcontentloaded": when the `DOMContentLoaded` event is fired
    - "load": when the `load` event is fired (slow, best avoided unless you need all content to load completely)
    - "networkidle": Wait for no network connections for at least 500 ms (highly not recommended)
    """
    if not wait_until:
        wait_until = "commit"

    await context.computer._page.goto(url, wait_until=wait_until, timeout=NAVIGATE_TIMEOUT)
    return context.computer._page.url


@function_tool
async def get_HTML(context: RunContextWrapper, selector: Optional[str] = None, has_text: Optional[str] = None) -> str:
    """
    Extract the HTML content for the page or a specific selector.
    Uses emmetify to reduce the HTML size to be more suitable for LLMs.
    """
    from emmetify import emmetify
    
    if not selector:
        selector = "body"
    
    html = await context.computer._page.locator(selector, has_text=has_text).inner_html(timeout=ACTION_TIMEOUT)
    
    # Use emmetify to reduce the HTML size
    reduced_html = emmetify(html)
    return reduced_html

@function_tool
async def get_text(context: RunContextWrapper, selector: Optional[str] = None, has_text: Optional[str] = None) -> str:
    """
    Extract the text content for the page or a specific selector.
    """
    if not selector:
        selector = "body"
    return await context.computer._page.locator(selector, has_text=has_text).inner_text(timeout=ACTION_TIMEOUT)

@function_tool
async def take_screenshot(context: RunContextWrapper, selector: Optional[str] = None, has_text: Optional[str] = None, animations: Optional[str] = None, quality: Optional[int] = None) -> str:
    """
    Take a screenshot of the page or a specific element.

    Args:
        selector: CSS selector for element to screenshot
        has_text: Find element containing specific text
        animations: "disabled" or "allow" (default is "disabled")
        quality: Image quality (default is 70)

    Returns:
        Path to the saved screenshot file
    """
    if not quality:
        quality = 70
    if not animations:
        animations = "disabled"

    timestamp = int(time.time())
    url_part = context.computer._page.url.replace("://", "_").replace("/", "_").replace(".", "_")[:50]

    # Create filename
    selector_part = ""
    if selector:
        selector_part = f"_selector_{selector.replace(' ', '_').replace('[', '').replace(']', '').replace('=', '')[:30]}"

    filename = f"{timestamp}_{url_part}{selector_part}.jpg"

    # Take the screenshot
    if selector:
        png_bytes = await context.computer._page.locator(selector, has_text=has_text).screenshot(
            animations=animations,
            timeout=ACTION_TIMEOUT
        )
    else:
        png_bytes = await context.computer._page.screenshot(
            animations=animations,
            full_page=True,
            timeout=ACTION_TIMEOUT
        )

    # Process the image
    image = Image.open(io.BytesIO(png_bytes))
    width, height = image.size

    # Crop if height exceeds 1200px
    if height > 1200:
        image = image.crop((0, 0, width, 1200))

    # Save processed image
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format="JPEG", quality=quality, optimize=True)
    processed_image_bytes = img_byte_arr.getvalue()

    # Use write_file to save the image as binary
    return await write_file(f"screenshots/{filename}", processed_image_bytes.decode('latin1'), binary=True)

@function_tool
async def element_click(context: RunContextWrapper, selector: str, has_text: Optional[str] = None) -> str:
    """
    Click on an element on the webpage.
    """
    await context.computer._page.locator(selector, has_text=has_text).click(timeout=ACTION_TIMEOUT, force=True)
    return f"Clicked on {selector}"

@function_tool
async def element_hover(context: RunContextWrapper, selector: str, has_text: Optional[str] = None) -> str:
    """
    Hover over the matching element.
    """
    await context.computer._page.locator(selector, has_text=has_text).hover(timeout=ACTION_TIMEOUT, force=True)
    return f"Hovered over {selector}"

@function_tool
async def element_fill(context: RunContextWrapper, value: str, selector: str, has_text: Optional[str] = None) -> str:
    """
    Set a value to the input field.
    """
    await context.computer._page.locator(selector, has_text=has_text).fill(value=value, timeout=ACTION_TIMEOUT, force=True)
    return f"Filled {selector} with '{value}'"

@function_tool
async def element_check(context: RunContextWrapper, selector: str, has_text: Optional[str] = None) -> str:
    """
    Ensure that checkbox or radio element is checked.
    """
    await context.computer._page.locator(selector, has_text=has_text).check(timeout=ACTION_TIMEOUT, force=True)
    return f"Checked {selector}"

@function_tool
async def execute_javascript(context: RunContextWrapper, code: str) -> str:
    """
    Run javascript code in the current browser page. If the code returns a value, it will be returned by the tool.
    """
    return await context.computer._page.evaluate(expression=code)

@function_tool
async def reset_session(context: RunContextWrapper) -> str:
    """
    Creates a completely new browser session with fresh cookies and no stored data.
    """
    return await context.computer._reset_session()