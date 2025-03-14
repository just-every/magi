"""
Process box components for MAGI UI.
"""
from textual.app import ComposeResult
from textual.containers import Container
from textual.widgets import TextArea, RichLog
from textual.events import Key
from typing import Callable

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

    def update_content(self, new_content: str):
        """Update the content of this process output."""
        self.content = new_content
        process_id = f"[#FF6600 bold]{self.process_id}[/]" 
        output = self.query_one(RichLog)
        
        # Clear and write new content
        output.clear()
        output.write(process_id)
        output.write(self.content)
        
        # Ensure auto-scrolling is enabled
        output.auto_scroll = True

    def compose(self) -> ComposeResult:
        # Use RichLog instead of Static for better scrolling
        log = RichLog(classes="process-output", id=f"output-{self.process_id}")
        log.auto_scroll = True  # Enable auto-scrolling by default
        log.write(f"[#FF6600 bold]{self.process_id}[/]")
        if self.content:
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