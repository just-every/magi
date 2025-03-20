"""
memory.py - Utilities for managing and persisting agent memory
"""

import os
import json
from typing import Dict, Any, List

from magi.utils import output_directory

# Global memory storage to persist between commands
memory: Dict[str, List[Any]] = {
    "input_items": [],  # Store all previous inputs
    "outputs": []       # Store all previous outputs
}

def save_memory() -> None:
    """Save memory to a persistent file."""
    try:
        # Try multiple locations in order of preference
        memory_dir = output_directory()
        memory_file = f"{memory_dir}/magi_memory.json"

        # Now save the memory file
        with open(memory_file, "w") as f:
            json.dump(memory, f)

        # Set permissions on the file
        os.chmod(memory_file, 0o666)

        return
    except Exception as e:
        print(f"Error saving memory: {str(e)}")
        # Continue execution even if saving fails

def load_memory() -> None:
    """Load memory from persistent storage."""
    global memory
    try:
        # Try the same locations as save_memory in the same order
        memory_dir = output_directory()
        memory_file = f"{memory_dir}/magi_memory.json"

        with open(memory_file, "r") as f:
            loaded_memory = json.load(f)
            memory.update(loaded_memory)

    except Exception as e:
        # Error loading memory (this is normal for first run)
        return

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
