"""
MAGI - Main application with Textual UI
"""
import argparse
import asyncio
import signal
import sys
import threading
import time
import uuid
import os
import importlib.util
import subprocess
import warnings

# Suppress the urllib3 OpenSSL warning
warnings.filterwarnings("ignore", category=UserWarning, module="urllib3")
from utils.display import MAGIUI

# Check if Docker module is available
docker_available = importlib.util.find_spec("docker") is not None
openai_available = importlib.util.find_spec("openai") is not None

# Import DockerManager only if docker module is available
if docker_available:
    from utils.docker_manager import DockerManager
    # Import build_docker function
    from build_docker import build_docker_image
else:
    print("Warning: Docker module not found. Docker functionality will be simulated.")
    
if not openai_available:
    print("Warning: OpenAI module not found. OpenAI functionality will be simulated.")

def check_docker_image_exists():
    """Check if the magi-system Docker image exists."""
    if not docker_available:
        return False
        
    try:
        result = subprocess.run(
            ["docker", "image", "inspect", "magi-system:latest"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False
        )
        return result.returncode == 0
    except Exception:
        return False


class Process:
    """Represents a running process with input/output."""

    def __init__(self, process_id, command, ui):
        self.process_id = process_id
        self.command = command
        self.ui = ui
        self.running = True
        self.input_queue = asyncio.Queue()
        self.docker_manager = None
        self.container_id = None
        self.test_mode = "-t" in sys.argv

    async def run(self):
        """Run the process and handle input/output."""
        try:
            # Update the UI
            self.ui.update_process(self.process_id, f"Starting container for: {self.command}")
            
            if self.test_mode:
                # Simulate Docker in test mode
                await self._run_test_mode()
            else:
                # Run with actual Docker
                await self._run_docker_mode()

        except Exception as e:
            self.ui.update_process(
                self.process_id,
                f"Executing: {self.command}\nError: {str(e)}"
            )
            
    async def _run_test_mode(self):
        """Run in test mode (simulation)."""
        # Simulate Docker container startup
        self.ui.update_process(self.process_id, f"[Test Mode] Creating Docker container for: {self.command}")
        await asyncio.sleep(0.5)
        
        # Simulate process execution
        progress = 0
        max_progress = 5  # Faster for test mode
        self.ui.update_process(self.process_id, f"[Test Mode] Container running\nExecuting: {self.command}")
        
        while self.running and progress < max_progress:
            # Check for input
            try:
                # Non-blocking check for input
                user_input = self.input_queue.get_nowait()
                self.ui.update_process(
                    self.process_id,
                    f"[Test Mode] Executing: {self.command}\nProgress: {progress}/{max_progress}\nReceived input: {user_input}"
                )
            except asyncio.QueueEmpty:
                pass

            # Simulate work
            await asyncio.sleep(0.1)
            progress += 1

            self.ui.update_process(
                self.process_id,
                f"[Test Mode] Executing: {self.command}\nProgress: {progress}/{max_progress}"
            )

        if self.running:
            self.ui.update_process(
                self.process_id,
                f"[Test Mode] Executing: {self.command}\nCompleted successfully!"
            )
        else:
            self.ui.update_process(
                self.process_id,
                f"[Test Mode] Executing: {self.command}\nStopped by user"
            )
            
    async def _run_docker_mode(self):
        """Run with actual Docker container."""
        # If Docker is not available, fall back to test mode
        if not docker_available:
            self.ui.update_process(
                self.process_id,
                f"Docker not available. Running in simulated mode for: {self.command}"
            )
            await self._run_test_mode()
            return
        
        try:
            # Check if Docker image exists
            if not check_docker_image_exists():
                self.ui.update_process(
                    self.process_id,
                    f"Docker image not found. Building image for: {self.command}"
                )
                # Build the Docker image
                build_success = build_docker_image()
                if not build_success:
                    self.ui.update_process(
                        self.process_id,
                        f"Failed to build Docker image. Running in simulated mode for: {self.command}"
                    )
                    await self._run_test_mode()
                    return
                
                self.ui.update_process(
                    self.process_id,
                    f"Docker image built successfully. Creating container for: {self.command}"
                )
            
            # Initialize Docker manager
            self.docker_manager = DockerManager()
            
            # Prepare environment variables
            env_vars = {
                "COMMAND": self.command,
                "OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY", "")
            }
            
            # Update UI
            self.ui.update_process(self.process_id, f"Creating Docker container for: {self.command}")
            
            # Create and start the container
            self.container_id = await self.docker_manager.create_container(
                self.process_id, 
                env_vars
            )
            
            self.ui.update_process(
                self.process_id,
                f"Docker container started (ID: {self.container_id[:12]})\nExecuting: {self.command}"
            )
            
            # Monitor the container
            while self.running:
                # Get logs from the container
                logs = await self.docker_manager.get_logs(self.process_id)
                
                # Process input
                try:
                    user_input = self.input_queue.get_nowait()
                    await self.docker_manager.send_input(self.process_id, user_input)
                    self.ui.update_process(
                        self.process_id,
                        f"Executing: {self.command}\nContainer ID: {self.container_id[:12]}\n\nSent input: {user_input}\n\nLogs:\n{logs}"
                    )
                except asyncio.QueueEmpty:
                    self.ui.update_process(
                        self.process_id,
                        f"Executing: {self.command}\nContainer ID: {self.container_id[:12]}\n\nLogs:\n{logs}"
                    )
                
                await asyncio.sleep(1)
                
        except Exception as e:
            self.ui.update_process(
                self.process_id,
                f"Docker Error: {str(e)}\nCommand: {self.command}"
            )
            if self.docker_manager and self.container_id:
                await self.docker_manager.stop_container(self.process_id)

    def send_input(self, input_text):
        """Send input to the process."""
        if self.running:
            self.input_queue.put_nowait(input_text)

    async def stop(self):
        """Stop the process."""
        self.running = False
        
        # Stop Docker container if it exists and Docker is available
        if docker_available and self.docker_manager and not self.test_mode:
            await self.docker_manager.stop_container(self.process_id)


class ProcessManager:
    """Manages the processes spawned from user input."""

    def __init__(self, ui):
        self.ui = ui
        self.processes = {}

    async def cleanup(self):
        """Cleanup all processes."""
        for process_id in list(self.processes.keys()):
            await self.stop_process(process_id)

    def __del__(self):
        """Cleanup when the manager is deleted."""
        # We can't use async in __del__, so create a task for cleanup
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self.cleanup())
        except:
            pass

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

    async def stop_process(self, process_id):
        """Stop a specific process."""
        if process_id in self.processes:
            await self.processes[process_id].stop()
            return True
        return False


def handle_global_input(command, process_manager):
    """Handle global input from the UI."""
    if command.strip().lower() == "exit":
        # Schedule app exit
        asyncio.create_task(process_manager.cleanup())
        app.exit()
        return

    # Spawn a new process for the command
    process_manager.spawn_process(command)

def handle_process_input(process_id, command, process_manager):
    """Handle process-specific input from the UI."""
    process_manager.send_to_process(process_id, command)


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="MAGI Application")
    parser.add_argument("-t", "--test", action="store_true", help="Run in test mode")
    parser.add_argument("-p", "--prompt", type=str, help="Test with a specific prompt")
    parser.add_argument("command", nargs="?", type=str, help="Command to run in test mode")
    return parser.parse_args()


if __name__ == "__main__":

    args = parse_args()

    # Build Docker image if needed and Docker is available
    if docker_available and not check_docker_image_exists():
        print("Docker image 'magi-system' not found. Building it now...")
        build_success = build_docker_image()
        if not build_success:
            print("Failed to build Docker image. Some functionality may be limited.")

    # Create the UI
    app = MAGIUI()

    # Create the process manager
    process_manager = ProcessManager(app)

    # Set the input callbacks
    app.set_global_input_callback(lambda cmd: handle_global_input(cmd, process_manager))
    app.set_process_input_callback(lambda pid, cmd: handle_process_input(pid, cmd, process_manager))

    # Setup startup actions
    async def on_app_start():
        test_mode = args.test
        
        if test_mode:
            # Use the command argument if provided, otherwise use default test commands
            if args.command:
                process_manager.spawn_process(args.command)
            else:
                process_manager.spawn_process("test command 1")
                process_manager.spawn_process("test command 2")
            
            # Auto-exit after a delay in test mode
            async def exit_after_delay():
                await asyncio.sleep(5)  # Wait for processes to complete
                app.exit()
                
            asyncio.create_task(exit_after_delay())

        elif args.prompt:
            process_manager.spawn_process(args.prompt)

    app.run_after_refresh = on_app_start

    app.run()
