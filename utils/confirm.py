"""
Confirmation dialog screen for Times1000.
"""
from textual.app import ComposeResult
from textual.screen import ModalScreen
from textual.widgets import Button, Label
from textual.containers import Container, Horizontal

class ConfirmScreen(ModalScreen):
    """A modal exit screen."""

    DEFAULT_CSS = """
    ConfirmScreen {
        align: center middle;
    }

    ConfirmScreen > Container {
        width: auto;
        height: auto;
        border: thick $background 80%;
        background: $surface;
    }

    ConfirmScreen > Container > Label {
        width: 100%;
        content-align-horizontal: center;
        margin-top: 1;
    }

    ConfirmScreen > Container > Horizontal {
        width: auto;
        height: auto;
    }

    ConfirmScreen > Container > Horizontal > Button {
        margin: 2 4;
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
