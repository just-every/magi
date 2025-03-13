"""
Display management for MAGI application using Textual.
"""
from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical, Grid
from textual.widgets import Footer, Input, Static, TextArea
from textual.reactive import reactive
from textual.binding import Binding
from textual.events import Key
from typing import Dict, List, Callable
from utils.confirm import ConfirmScreen


class SubmittableTextArea(TextArea):
    """TextArea that submits on Enter and creates a new line on Alt+Enter, Meta+Enter or Shift+Enter."""
    
    async def _on_key(self, event: Key) -> None:
        # Submit on plain Enter (with no modifiers)
        if event.key == "enter" and "alt" not in event.key and "meta" not in event.key and "ctrl" not in event.key and "shift" not in event.key:
            event.prevent_default()
            self.post_message(self.Submitted(self, self.text))
            return
        # For all other keys, let TextArea handle it normally
        await super()._on_key(event)
    
    class Submitted(TextArea.Changed):
        """Posted when the user presses Enter in the TextArea."""
        def __init__(self, text_area: TextArea, value: str) -> None:
            super().__init__(text_area)
            self.text_area = text_area
            self.value = value


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
        overflow: auto;
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

    .process-output:hover {
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
        self.query_one(".process-output", Static).update(f"{process_id}\n{self.content}")

    def compose(self) -> ComposeResult:
        yield Static(f"{self.process_id}\n{self.content}", classes="process-output", id=f"output-{self.process_id}")
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

    def on_key(self, event: Key):
        """Handle key events for the text area."""
        # First check if the event is for a TextArea by checking
        # if it occurred within this container and we can find a TextArea
        text_area = self.query_one(TextArea)
        if not text_area.has_focus:
            return
            
        # Let Ctrl+Enter submit the form
        if event.key == "ctrl+enter":
            if self.on_input:
                self.on_input(self.process_id, text_area.text)
            text_area.clear()
            event.prevent_default()

    def on_click(self) -> None:
        """Focus this process's input when the box is clicked."""
        self.query_one(TextArea).focus()


class ProcessGrid(Grid):
    """Grid layout for process boxes."""
    CSS = """
    ProcessGrid {
        grid-size: 2;
        grid-gutter: 1;
        grid-columns: 1fr 1fr;
        grid-rows: 1fr 1fr;
        height: 1fr;
        padding: 1;
        background: #000000;
    }
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.process_boxes: Dict[str, ProcessBox] = {}

    def add_process(self, process_id: str, initial_content: str = "", on_input: Callable = None) -> ProcessBox:
        """Add a new process box."""
        if process_id in self.process_boxes:
            return self.process_boxes[process_id]

        process_box = ProcessBox(process_id, initial_content, on_input)
        self.process_boxes[process_id] = process_box
        self.mount(process_box)
        self._adjust_grid_size()
        return process_box

    def update_process(self, process_id: str, content: str):
        """Update the content of a process box."""
        if process_id not in self.process_boxes:
            self.add_process(process_id, content)
        else:
            self.process_boxes[process_id].update_content(content)

    def _adjust_grid_size(self):
        """Adjust grid size based on number of processes."""
        count = len(self.process_boxes)
        if count <= 1:
            self.styles.grid_size = 1
        elif count <= 4:
            self.styles.grid_size = 2
        elif count <= 9:
            self.styles.grid_size = 3
        else:
            self.styles.grid_size = 4


class MAGIUI(App):
    """Main application UI for MAGI."""
    CSS = """
    #main-container {
        height: 100%;
        width: 100%;
        background: #000000;
    }

    #header {
        height: auto;
        padding: 1;
        text-align: center;
        background: #000000;
        color: #FF6600;
        text-style: bold;
        border-bottom: solid #FF6600;
    }

    #global-input-container {
        height: auto;
        dock: bottom;
        padding: 1;
    }

    #global-input {
        height: auto;
        min-height: 1;
        max-height: 6;
        background: #000000;
        color: #FFFFFF;
        border: solid #FF6600;
    }

    Input:focus {
        border: solid #00FFFF;
    }
    
    TextArea:focus {
        border: solid #00FFFF;
    }
    
    Footer {
        background: #000000;
        color: #FFFFFF;
    }
    
    Footer > .footer--key {
        background: #FF6600;
        color: #000000;
    }
    
    Footer > .footer--highlight {
        background: #000000;
        color: #FF6600;
    }
    """

    BINDINGS = [
        Binding("tab", "next_input", "Focus Next Input"),
        Binding("shift+tab", "prev_input", "Focus Previous Input"),
        Binding("q", "quit", "Quit"),
        Binding("escape", "quit", "Quit"),
        Binding("ctrl+c", "force_quit", "Force Quit", show=False, priority=True),
        Binding("ctrl+d", "force_quit", "Force Quit", show=False, priority=True),
        Binding("ctrl+enter", "submit_form", "Submit Input", show=True),
        Binding("shift+enter", "new_line", "New Line", show=True),
        Binding("alt+enter", "new_line", "New Line", show=True),
        Binding("meta+enter", "new_line", "New Line", show=False),
    ]

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.on_global_input_callback = None
        self.on_process_input_callback = None
        self.run_after_refresh = None
        self.last_esc_time = 0  # Track the last time Escape was pressed

    def compose(self) -> ComposeResult:
        """Create child widgets."""
        with Vertical(id="main-container"):
            yield Static("MAGI", id="header")
            yield ProcessGrid(id="process-grid")
            with Container(id="global-input-container"):
                global_input = SubmittableTextArea(id="global-input")
                global_input.can_focus = True  # Explicitly make it focusable
                # Enable formatting options
                global_input.show_line_numbers = False
                global_input.soft_wrap = True
                yield global_input
        yield Footer()

    def on_mount(self):
        """Event handler called when app is mounted."""
        self.query_one("#global-input").focus()

        # Run any startup function
        if self.run_after_refresh:
            self.call_after_refresh(self.run_after_refresh)

    def on_submittable_text_area_submitted(self, event: SubmittableTextArea.Submitted):
        """Event handler for text area submission."""
        text_area = event.text_area
        # For global input
        if text_area.id == "global-input" and self.on_global_input_callback:
            self.on_global_input_callback(event.value)
            text_area.clear()
        # For process inputs
        elif isinstance(text_area.parent, ProcessBox):
            process_box = text_area.parent
            if self.on_process_input_callback:
                self.on_process_input_callback(process_box.process_id, event.value)
            text_area.clear()
        
    def on_key(self, event: Key):
        """Handle key events for the global text area."""
        # Find the currently focused TextArea
        focused_text_area = None
        for text_area in self.query("TextArea"):
            if text_area.has_focus:
                focused_text_area = text_area
                break
                
        if focused_text_area is None:
            return
            
        # Handle special key combinations for newlines
        if event.key in ("alt+enter", "meta+enter", "shift+enter"):
            try:
                # Calculate index positions of all line breaks
                current_text = focused_text_area.text
                line_starts = [0]
                for i, char in enumerate(current_text):
                    if char == '\n':
                        line_starts.append(i + 1)
                
                # Get current row and column from selection
                row, col = focused_text_area.selection.end
                
                # Calculate absolute position in string
                if row < len(line_starts):
                    cursor_pos = line_starts[row] + col
                else:
                    cursor_pos = len(current_text)
                
                # Insert a newline at the cursor position
                new_text = current_text[:cursor_pos] + "\n" + current_text[cursor_pos:]
                focused_text_area.text = new_text
                
                # Move the cursor to the beginning of the new line
                new_row = row + 1
                new_col = 0
                focused_text_area.move_cursor((new_row, new_col))
            except Exception:
                # Simple fallback if anything goes wrong
                focused_text_area.text = focused_text_area.text + "\n"
                
            event.prevent_default()
            
        # Let Ctrl+Enter submit the form
        elif event.key == "ctrl+enter":
            if focused_text_area.id == "global-input" and self.on_global_input_callback:
                self.on_global_input_callback(focused_text_area.text)
                focused_text_area.clear()
            # For process inputs, check if it's a process input by looking at the parent
            elif isinstance(focused_text_area.parent, ProcessBox):
                process_box = focused_text_area.parent
                if self.on_process_input_callback:
                    self.on_process_input_callback(process_box.process_id, focused_text_area.text)
                focused_text_area.clear()
            event.prevent_default()

    def action_quit(self):
        """Exit on double-Escape or show confirmation dialog."""
        import time
        
        current_time = time.time()
        # Check if this is a second Escape press within 2 seconds
        if current_time - self.last_esc_time < 2.0:
            # Second press, exit immediately
            self.exit()
        else:
            # First press, show confirmation and update timestamp
            self.last_esc_time = current_time
            def handle_result(confirmed: bool) -> None:
                if confirmed:
                    self.exit()

            self.push_screen(ConfirmScreen("Press ESC again to exit"), handle_result)

    def action_force_quit(self):
        """Force quit without confirmation."""
        self.exit()

    def add_process(self, process_id: str, initial_content: str = ""):
        """Add a new process to the display."""
        process_grid = self.query_one("#process-grid", ProcessGrid)
        return process_grid.add_process(
            process_id,
            initial_content,
            on_input=self._handle_process_input
        )

    def update_process(self, process_id: str, content: str):
        """Update a process's output display."""
        process_grid = self.query_one("#process-grid", ProcessGrid)
        process_grid.update_process(process_id, content)

    def set_global_input_callback(self, callback):
        """Set callback for when global input is submitted."""
        self.on_global_input_callback = callback

    def set_process_input_callback(self, callback):
        """Set callback for when process-specific input is submitted."""
        self.on_process_input_callback = callback

    def _handle_process_input(self, process_id, value):
        """Internal handler for process-specific input."""
        if self.on_process_input_callback:
            self.on_process_input_callback(process_id, value)

    def action_next_input(self):
        """Focus the next input field."""
        inputs = self.query("TextArea")
        if not inputs:
            return

        # Find the currently focused input
        focused_input = None
        for i, input_widget in enumerate(inputs):
            if input_widget.has_focus:
                focused_input = i
                break

        # If found, focus the next one
        if focused_input is not None:
            next_input = (focused_input + 1) % len(inputs)
            inputs[next_input].focus()
        else:
            # If none is focused, focus the first one
            inputs.first().focus()

    def action_prev_input(self):
        """Focus the previous input field."""
        inputs = self.query("TextArea")
        if not inputs:
            return

        # Find the currently focused input
        focused_input = None
        for i, input_widget in enumerate(inputs):
            if input_widget.has_focus:
                focused_input = i
                break

        # If found, focus the previous one
        if focused_input is not None:
            prev_input = (focused_input - 1) % len(inputs)
            inputs[prev_input].focus()
        else:
            # If none is focused, focus the last one
            inputs.last().focus()
            
    def action_submit_form(self):
        """Submit the currently focused textarea."""
        # Find the focused textarea
        for textarea in self.query("TextArea"):
            if textarea.has_focus:
                if textarea.id == "global-input" and self.on_global_input_callback:
                    self.on_global_input_callback(textarea.text)
                    textarea.clear()
                elif isinstance(textarea.parent, ProcessBox):
                    process_box = textarea.parent
                    if self.on_process_input_callback:
                        self.on_process_input_callback(process_box.process_id, textarea.text)
                    textarea.clear()
                break
                
    def action_new_line(self):
        """This action is a stub. The actual new line functionality is handled in the on_key method.
        This is just here to support the key binding."""
        # The actual implementation is in the on_key method
        pass
