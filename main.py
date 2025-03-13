"""
Times1000 - Main application with Textual UI
"""
import argparse
import asyncio
import signal
import sys
import threading
import time
import uuid
from utils.display import Times1000UI


class Process:
    """Represents a running process with input/output."""

    def __init__(self, process_id, command, ui):
        self.process_id = process_id
        self.command = command
        self.ui = ui
        self.running = True
        self.input_queue = asyncio.Queue()

    async def run(self):
        """Run the process and handle input/output."""
        try:
            # Simulate process execution
            self.ui.update_process(self.process_id, f"Executing: {self.command}")

            # Process loop - runs until stopped or completed
            progress = 0
            max_progress = 5 if "-t" in sys.argv else 10
            while self.running and progress < max_progress:
                # Check for input
                try:
                    # Non-blocking check for input
                    user_input = self.input_queue.get_nowait()
                    self.ui.update_process(
                        self.process_id,
                        f"Executing: {self.command}\nProgress: {progress}/10\nReceived input: {user_input}"
                    )
                except asyncio.QueueEmpty:
                    pass

                # Simulate work (quicker for test mode)
                await asyncio.sleep(0.1)
                progress += 1

                self.ui.update_process(
                    self.process_id,
                    f"Executing: {self.command}\nProgress: {progress}/{max_progress}"
                )

            if self.running:
                self.ui.update_process(
                    self.process_id,
                    f"Executing: {self.command}\nCompleted successfully!"
                )
            else:
                self.ui.update_process(
                    self.process_id,
                    f"Executing: {self.command}\nStopped by user"
                )

        except Exception as e:
            self.ui.update_process(
                self.process_id,
                f"Executing: {self.command}\nError: {str(e)}"
            )

    def send_input(self, input_text):
        """Send input to the process."""
        if self.running:
            self.input_queue.put_nowait(input_text)

    def stop(self):
        """Stop the process."""
        self.running = False


class ProcessManager:
    """Manages the processes spawned from user input."""

    def __init__(self, ui):
        self.ui = ui
        self.processes = {}

    def __del__(self):
        """Cleanup when the manager is deleted."""
        for process_id in list(self.processes.keys()):
            self.stop_process(process_id)

    def spawn_process(self, command):
        """Spawn a new process from the command input."""
        process_id = f"Process-{str(uuid.uuid4())[:8]}"
        self.ui.add_process(process_id, f"Starting process for: {command}")

        # Create and start the process
        process = Process(process_id, command, self.ui)
        self.processes[process_id] = process

        # Start the process in the event loop
        asyncio.create_task(process.run())
        return process_id

    def send_to_process(self, process_id, input_text):
        """Send input to a specific process."""
        if process_id in self.processes:
            self.processes[process_id].send_input(input_text)

    def stop_process(self, process_id):
        """Stop a specific process."""
        if process_id in self.processes:
            self.processes[process_id].stop()
            return True
        return False


def handle_global_input(command, process_manager):
    """Handle global input from the UI."""
    if command.strip().lower() == "exit":
        # Schedule app exit
        app.exit()
        return

    # Spawn a new process for the command
    process_manager.spawn_process(command)

def handle_process_input(process_id, command, process_manager):
    """Handle process-specific input from the UI."""
    process_manager.send_to_process(process_id, command)


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Times1000 Application")
    parser.add_argument("-t", "--test", action="store_true", help="Run in test mode")
    parser.add_argument("-p", "--prompt", type=str, help="Test with a specific prompt")
    return parser.parse_args()


if __name__ == "__main__":

    args = parse_args()

    # Create the UI
    app = Times1000UI()

    # Create the process manager
    process_manager = ProcessManager(app)

    # Set the input callbacks
    app.set_global_input_callback(lambda cmd: handle_global_input(cmd, process_manager))
    app.set_process_input_callback(lambda pid, cmd: handle_process_input(pid, cmd, process_manager))

    # Setup startup actions
    async def on_app_start():
        test_mode = args.test
        
        if test_mode:
            process_manager.spawn_process("test command 1")
            process_manager.spawn_process("test command 2")
            
            # Auto-exit after a delay in test mode
            async def exit_after_delay():
                await asyncio.sleep(3)  # Wait for processes to complete
                app.exit()
                
            asyncio.create_task(exit_after_delay())

        if args.prompt:
            process_manager.spawn_process(args.prompt)

    app.run_after_refresh = on_app_start

    app.run()
