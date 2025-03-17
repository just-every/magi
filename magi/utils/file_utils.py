"""
file_utils.py - Helper functions for file operations
"""

import os
from typing import Optional
from agents import RunContextWrapper, function_tool
from magi.utils import output_directory

@function_tool
async def write_file(context: RunContextWrapper, filename: str, content: str, binary: Optional[bool]) -> str:
    """
    Save content to a file into a shared directory accessible to agents and users.

    Args:
        filename: Name of the file to save
        content: Content to write to the file
        binary: Whether the content is binary data encoded as a string (default False)

    Returns:
        Path to the saved file - accessible to add agents
    """
    # Get the output directory
    directory = output_directory()

    # Ensure the directory exists
    os.makedirs(directory, exist_ok=True)

    # Ensure directory for the file exists (for subdirectories like screenshots/)
    os.makedirs(os.path.dirname(os.path.join(directory, filename)), exist_ok=True)

    # Create the full path
    filepath = os.path.join(directory, filename)

    # Write the content to the file
    if binary:
        with open(filepath, "wb") as f:
            f.write(content.encode('latin1'))
    else:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

    return filepath


@function_tool
async def read_file(context: RunContextWrapper, filename: str) -> str:
    """
    Read content from a file in the shared directory accessible to agents and users.

    Args:
        filename: Name of the file to read (with or without directory path)

    Returns:
        File contents as string
    """
    # Get the output directory
    directory = output_directory()

    # Handle paths with or without the shared directory prefix
    if os.path.isabs(filename) and filename.startswith(directory):
        # Full path was provided
        filepath = filename
    else:
        # Just the filename was provided
        filepath = os.path.join(directory, os.path.basename(filename))

    # Check if file exists
    if not os.path.exists(filepath):
        # Try alternative interpretation
        alt_filepath = os.path.join(directory, filename)
        if os.path.exists(alt_filepath):
            filepath = alt_filepath
        else:
            return f"Error: File '{filename}' not found in shared directory"

    # Read the file content
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file '{filename}': {str(e)}"
