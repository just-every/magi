"""
Confirmation dialog screen for MAGI.
"""
from textual.app import ComposeResult
from textual.screen import ModalScreen
from textual.widgets import Button, Label
from textual.containers import Container, Horizontal
from textual.events import Key

class ConfirmScreen(ModalScreen):
    """A modal exit screen."""

    DEFAULT_CSS = """
    ConfirmScreen {
        align: center middle;
        background: #000000 75%;
    }

    ConfirmScreen > Container {
        width: auto;
        height: auto;
        border: thick #FF6600;
        background: #000000;
        color: #FFFFFF;
    }

    ConfirmScreen > Container > Label {
        width: 100%;
        content-align-horizontal: center;
        margin-top: 1;
        color: #FFFFFF;
    }

    ConfirmScreen > Container > Horizontal {
        width: auto;
        height: auto;
    }

    ConfirmScreen > Container > Horizontal > Button {
        margin: 2 4;
        background: #000000;
        color: #FFFFFF;
    }
    
    ConfirmScreen > Container > Horizontal > #yes {
        background: #FF6600;
        color: #000000;
    }
    
    ConfirmScreen > Container > Horizontal > #no {
        background: #000000;
        color: #FF6600;
        border: solid #FF6600;
    }
    """

    def __init__(self, question: str = "Are you sure?"):
        super().__init__()
        self.question = question

    def compose(self) -> ComposeResult:
        with Container():
            yield Label(self.question)
            with Horizontal():
                yield Button("Yes", id="yes", variant="error")
                yield Button("No", id="no", variant="success")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "yes":
            self.dismiss(True)
        else:
            self.dismiss(False)


class ConfirmDialogWithDoubleEscape(ConfirmScreen):
    """A modal screen that exits on double escape press."""
    
    # Define key bindings
    BINDINGS = [
        ("escape", "handle_escape", "Exit"),
    ]
    
    def __init__(self, question: str = "Are you sure?"):
        super().__init__(question)
        # Flag is already set to True because the first ESC already happened
        # to open this dialog, so next ESC should exit immediately
        self.has_escape_been_pressed = True
        
    def action_handle_escape(self) -> None:
        """Handle the escape key."""
        # Always exit immediately on ESC since this dialog was opened with ESC
        self.app.exit()
            
    def on_key(self, event: Key) -> None:
        """Capture all key events to ensure we get the escape key."""
        if event.key == "escape":
            # Always exit immediately on ESC since this dialog was opened with ESC
            self.app.exit()
            # Prevent default handling
            event.prevent_default()
            # Don't pass to other handlers
            event.stop()
