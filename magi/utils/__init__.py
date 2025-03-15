"""
magi.utils package - Utility functions for the MAGI system
"""

import os
import sys
from typing import Any, Callable, Dict, Optional, Tuple, Type, TypeVar, cast

# Environment detection
IN_DOCKER = os.path.exists('/.dockerenv')

# Type variable for generic imports
T = TypeVar('T')

def import_with_fallbacks(module_paths: list[str], class_or_function_name: str) -> Any:
    """
    Import a class or function with multiple fallback paths.

    Args:
        module_paths: List of module paths to try importing from, in order of preference
        class_or_function_name: Name of the class or function to import

    Returns:
        The imported class or function, or a mock implementation if all imports fail
    """
    last_error = None

    for module_path in module_paths:
        try:
            module = __import__(module_path, fromlist=[class_or_function_name])
            if hasattr(module, class_or_function_name):
                return getattr(module, class_or_function_name)
        except ImportError as e:
            last_error = e
            continue

    # If we reach here, all imports failed
    print(f"WARNING: Could not import {class_or_function_name} from any of {module_paths}")
    print(f"Last error: {last_error}")
    return None

def set_openai_key(key: str) -> None:
    """Set the OpenAI API key using the available function."""
    search_paths = ['agents', 'openai_agents.agents', 'openai_agents']

    # Try multiple function names that might exist
    set_default_openai_key = import_with_fallbacks(search_paths, 'set_default_openai_key')
    if set_default_openai_key is None:
        set_default_openai_key = import_with_fallbacks(search_paths, 'set_default_openai_api')

    if set_default_openai_key is None:
        # Provide a mock implementation
        print(f"Mock: Setting OpenAI key to: {key[:4]}...")
        return

    # Use the actual function
    set_default_openai_key(key)
