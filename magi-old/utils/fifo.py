"""
fifo.py - Command processing through named pipes (FIFOs)
"""

import os
import time
import sys
import base64
from typing import Callable, Any

def process_commands_from_file(command_processor: Callable[[str], Any], agent: str = "supervisor", filepath: str = "/tmp/command.fifo") -> None:
    """
    Process commands from a named pipe (FIFO) file.

    Args:
        command_processor: Function to process each command line
        filepath: Path to the FIFO file to monitor
    """
    # Clean up any existing FIFO and create a new one
    if os.path.exists(filepath):
        try:
            os.unlink(filepath)
        except Exception as e:
            print(f"Warning: Could not remove existing FIFO: {str(e)}")

    try:
        os.mkfifo(filepath)
    except Exception as e:
        print(f"Failed to create FIFO: {str(e)}")
        # Fall back to a regular file
        with open(filepath, 'w') as f:
            f.write("")

    while True:
        try:
            # Open the FIFO file for reading (this will block until a writer opens it)
            with open(filepath, 'r') as fifo:
                # Read from the FIFO
                while True:
                    line = fifo.readline().strip()
                    if line:
                        try:
                            # Check if the line starts with a base64 marker
                            if line.startswith("BASE64:"):
                                # Extract the base64 part (skip the "BASE64:" prefix)
                                base64_content = line[7:]
                                # Decode the base64 content
                                decoded_line = base64.b64decode(base64_content).decode('utf-8')
                                command = decoded_line
                            else:
                                command = line

                            # Process each command as it comes in
                            result = command_processor(command, agent)
                        except Exception as e:
                            print(f"Error processing command: {str(e)}")
                        
                        # Flush to ensure the output is visible in Docker logs
                        sys.stdout.flush()
        except Exception as e:
            print(f"Error reading from FIFO: {str(e)}")
            time.sleep(1)  # Wait before retrying
