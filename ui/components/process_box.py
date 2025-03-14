"""
Process box components for MAGI UI.
"""
from textual.app import ComposeResult
from textual.containers import Container
from textual.widgets import TextArea, RichLog, Markdown
from textual.events import Key, MouseEvent
from rich.markdown import Markdown as RichMarkdown
from typing import Callable
import re

from ui.components.textarea import SubmittableTextArea


class ProcessBox(Container):
    """Widget to display a process with its own input."""
    CSS = """
    .process-box {
        height: 1fr;
        border: solid #FF6600;
        margin: 1;
        padding: 1;
        display: block;
        background: #000000;
    }

    .process-output {
        height: 1fr;
        margin-bottom: 1;
        border: solid transparent;
        color: #FFFFFF;
        background: #000000;
    }
    
    #process-id {
        color: #FF6600;
        font-weight: bold;
    }

    .process-input {
        height: auto;
        min-height: 1;
        max-height: 6;
        dock: bottom;
        border: solid #FF00FF;
        background: #000000;
        color: #FFFFFF;
    }

    .process-box:focus-within {
        border: solid #00FFFF;
    }

    Input:focus {
        border: solid #00FFFF;
    }

    TextArea:focus {
        border: solid #00FFFF;
    }

    RichLog:hover {
        border: dashed #FFFF00;
    }

    .process-input:hover {
        border: dashed #FFFF00;
    }
    """

    def __init__(self, process_id: str, content: str = "", on_input: Callable = None, **kwargs):
        super().__init__(**kwargs)
        self.process_id = process_id
        self.content = content
        self.on_input = on_input
        self.add_class("process-box")
        self.auto_scroll_enabled = True
        self.last_content_length = 0

    def update_content(self, new_content: str):
        """Update the content of this process output."""
        output = self.query_one(RichLog)
        
        # Only update if content has changed
        if new_content != self.content:
            # Check if we have new content to append
            if len(new_content) > len(self.content) and new_content.startswith(self.content):
                # Append only the new part
                additional_content = new_content[len(self.content):]
                
                # Process markdown in the additional content
                if "**" in additional_content or "__" in additional_content or "*" in additional_content:
                    try:
                        # Convert markdown to Rich renderable
                        md = RichMarkdown(additional_content)
                        output.write(md)
                    except Exception:
                        # Fallback if markdown parsing fails
                        output.write(additional_content)
                else:
                    output.write(additional_content)
            else:
                # Full content replacement needed
                process_id = f"[#FF6600 bold]{self.process_id}[/]"
                output.clear()
                output.write(process_id)
                
                # Process markdown in the full content
                if "**" in new_content or "__" in new_content or "*" in new_content:
                    try:
                        # Convert markdown to Rich renderable
                        md = RichMarkdown(new_content)
                        output.write(md)
                    except Exception:
                        # Fallback if markdown parsing fails
                        output.write(new_content)
                else:
                    output.write(new_content)
            
            # Update stored content
            self.content = new_content
        
        # Set auto-scroll based on user preference
        output.auto_scroll = self.auto_scroll_enabled

    def compose(self) -> ComposeResult:
        # Use RichLog instead of Static for better scrolling
        log = RichLog(classes="process-output", id=f"output-{self.process_id}")
        log.auto_scroll = True  # Enable auto-scrolling by default
        log.write(f"[#FF6600 bold]{self.process_id}[/]")
        
        if self.content:
            # Check for markdown and render it
            if "**" in self.content or "__" in self.content or "*" in self.content:
                try:
                    # Convert markdown to Rich renderable
                    md = RichMarkdown(self.content)
                    log.write(md)
                except Exception:
                    log.write(self.content)
            else:
                log.write(self.content)
                
        yield log
        input_widget = SubmittableTextArea(classes="process-input", id=f"input-{self.process_id}")
        input_widget.can_focus = True  # Explicitly make it focusable
        # Enable formatting options
        input_widget.show_line_numbers = False
        input_widget.soft_wrap = True
        yield input_widget

    def on_submittable_text_area_submitted(self, event: SubmittableTextArea.Submitted):
        """Event handler for process-specific input submission."""
        if self.on_input:
            self.on_input(self.process_id, event.value)
        event.text_area.clear()
        # Note: Can't stop propagation with the current event system
        # Need a different approach to prevent duplicate handling

    def on_key(self, event: Key):
        """Handle key events for the text area."""
        # First check if the event is for a TextArea by checking
        # if it occurred within this container and we can find a TextArea
        text_area = self.query_one(TextArea)
        if not text_area.has_focus:
            return
        
        # The handling of Ctrl+Enter is done through key bindings and actions now
        # We only need to prevent the default behavior
        if event.key == "ctrl+enter":
            event.prevent_default()

    def on_click(self) -> None:
        """Focus this process's input when the box is clicked."""
        self.query_one(TextArea).focus()
    
    def on_mouse_scroll(self, event: MouseEvent) -> None:
        """Handle mouse scroll events."""
        # If user is scrolling up, disable auto-scrolling
        if event.y < 0:  # Scrolling up
            self.auto_scroll_enabled = False
        elif event.y > 0 and self.query_one(RichLog).is_at_end:  # Scrolling down and at end
            # Re-enable auto-scrolling when user scrolls to the bottom
            self.auto_scroll_enabled = True