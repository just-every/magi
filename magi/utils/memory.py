"""
memory.py - Utilities for managing and persisting agent memory
"""

import os
import json
from typing import Dict, Any, List

# Global memory storage to persist between commands
memory: Dict[str, List[Any]] = {
    "input_items": [],  # Store all previous inputs
    "outputs": []       # Store all previous outputs
}

def save_memory() -> None:
    """Save memory to a persistent file."""
    try:
        # Try multiple locations in order of preference
        # 1. Shared volume (might be read-only)
        # 2. Home directory (should be writable)
        # 3. /tmp directory (always writable)
        memory_locations = [
            "/claude_shared",
            os.path.expanduser("~"),
            "/tmp"
        ]

        for memory_dir in memory_locations:
            memory_file = f"{memory_dir}/magi_memory.json"

            # Skip this location if it doesn't exist or isn't writable
            if not os.path.exists(memory_dir) or not os.access(memory_dir, os.W_OK):
                continue

            try:
                # Now save the memory file
                with open(memory_file, "w") as f:
                    json.dump(memory, f)

                # Set permissions on the file
                os.chmod(memory_file, 0o666)

                # Successfully saved, no need to try other locations
                return
            except Exception as inner_e:
                # Try the next location
                continue

        # If we get here, we couldn't save to any location
        print(f"Warning: Could not save memory to any available location")
    except Exception as e:
        print(f"Error saving memory: {str(e)}")
        # Continue execution even if saving fails

def load_memory() -> None:
    """Load memory from persistent storage."""
    global memory
    try:
        # Try the same locations as save_memory in the same order
        memory_locations = [
            "/claude_shared",
            os.path.expanduser("~"),
            "/tmp"
        ]

        for memory_dir in memory_locations:
            memory_file = f"{memory_dir}/magi_memory.json"

            # Skip if file doesn't exist
            if not os.path.exists(memory_file):
                continue

            try:
                with open(memory_file, "r") as f:
                    loaded_memory = json.load(f)
                    memory.update(loaded_memory)
                    return
            except Exception:
                # Try the next location
                continue

        # If we get here, we couldn't load from any location
        print("No memory file found (this is normal for first run)")
    except Exception as e:
        print(f"Error loading memory (this is normal for first run): {str(e)}")

def add_input(input_content: str) -> None:
    """Add an input to memory."""
    memory["input_items"].append({"content": input_content, "type": "text"})

def add_output(output_content: str) -> None:
    """Add an output to memory."""
    memory["outputs"].append(output_content)
    # Save memory after each update
    save_memory()

def get_memory() -> Dict[str, List[Any]]:
    """Get the current memory."""
    return memory