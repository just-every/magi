"""
magi.utils package - Utility functions for the MAGI system
"""

import os

def output_directory() -> str:
    """Get the output directory where files are saved and shared."""

    # First try the preferred directory /magi_output
    if os.path.exists("/magi_output") and os.access("/magi_output", os.W_OK):
        # If we can write to it, use it
        return "/magi_output"
    
    # If not accessible, it's likely a Docker volume permission issue
    # Try creating a test file to confirm access
    try:
        test_path = os.path.join("/magi_output", ".test_write_access")
        with open(test_path, 'w') as f:
            f.write("test")
        os.remove(test_path)
        return "/magi_output"
    except (IOError, PermissionError):
        # If we can't write there, fall back to /tmp
        if os.path.exists("/tmp") and os.access("/tmp", os.W_OK):
            return "/tmp"
    
    # If nothing else works
    raise FileNotFoundError("No writable output directory found.")
