"""
Main application UI for MAGI System.
"""
from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import Footer, Input, Static, TextArea
from textual.binding import Binding
from textual.events import Key
from typing import Dict, List, Callable

from ui.components.textarea import SubmittableTextArea
from ui.components.process_grid import ProcessGrid
from ui.components.confirm import ConfirmDialogWithDoubleEscape


class MAGIUI(App):
    """Main application UI for MAGI."""
    ENABLE_MOUSE_CAPTURE = True
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
        # For global input only - process-specific inputs are handled by the ProcessBox component
        if text_area.id == "global-input" and self.on_global_input_callback:
            self.on_global_input_callback(event.value)
            text_area.clear()
        # Note: Deliberately not handling process inputs here since they're handled by ProcessBox
        
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
            
        # Let Ctrl+Enter submit the form - let it be handled by action_submit_form
        elif event.key == "ctrl+enter":
            event.prevent_default()
            # The actual submission is handled by action_submit_form, triggered by the binding

    def action_quit(self):
        """Show confirmation dialog to exit."""
        def handle_result(confirmed: bool) -> None:
            if confirmed:
                self.exit()

        # Show confirmation dialog
        self.push_screen(ConfirmDialogWithDoubleEscape("Press ESC to exit immediately"), handle_result)

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
                # For global input
                if textarea.id == "global-input" and self.on_global_input_callback:
                    self.on_global_input_callback(textarea.text)
                    textarea.clear()
                # For process inputs, manually trigger the ProcessBox's input handler
                elif isinstance(textarea.parent, Container) and textarea.parent.has_class("process-box"):
                    process_box = textarea.parent
                    if hasattr(process_box, 'on_input') and process_box.on_input:
                        process_box.on_input(process_box.process_id, textarea.text)
                        textarea.clear()
                break
                
    def action_new_line(self):
        """This action is a stub. The actual new line functionality is handled in the on_key method.
        This is just here to support the key binding."""
        # The actual implementation is in the on_key method
        pass