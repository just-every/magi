"""
MAGI - Command processor module for the MAGI System

This module serves as the main entry point for the MAGI system's Python backend.
It handles command processing, agent initialization, and system setup.

Event Structure Documentation:
------------------------------
When processing events from result.stream_events(), the following event types are handled:

1. raw_response_event
   - Contains raw response data, including text deltas for streaming output.
   - Properties: data (ResponseTextDeltaEvent or other response types).
   - Used for real-time token streaming.

2. agent_updated_stream_event
   - Signals a transition to a different specialized agent.
   - Properties: new_agent (Agent object with name, instructions, tools).
   - Logged as "[AGENT] Switched to: {agent_name}".

3. run_item_stream_event
   - Contains various processing items (tool calls, outputs, messages).
   - Properties: item (with type and type-specific properties).
   - Common item.type values:
     * tool_call_item: When a tool is invoked. Logged as "[TOOL CALL]".
     * tool_call_output_item: Results from tool invocation. Logged as "[TOOL RESULT]".
     * message_output_item: Text output from an agent. Logged as "[MESSAGE]".

Each event type has different property structures and requires careful error
handling to extract information reliably across different agent implementations.
"""
import sys
import os
import asyncio
import argparse
import traceback
import json
from typing import Optional, List, Dict, Any, Type

TRUNCATE_CHARS = 1000

# Configure module path to ensure imports work correctly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Add an exception filter to suppress the "environment" attribute error on exit
# This helps prevent noise in the logs during shutdown
original_excepthook = sys.excepthook

def custom_excepthook(exc_type: Type[BaseException], exc_value: BaseException, exc_traceback):
    """
    Custom exception hook to filter out known harmless errors during shutdown.

    This hook specifically handles:
    1. The 'dict' object has no attribute 'environment' error from Playwright
    2. 'Event loop is closed' errors during async cleanup
    3. General cleanup/shutdown errors when Python is finalizing
    """
    # Get the exception message as a string for pattern matching
    exc_message = str(exc_value)

    # Check for specific errors to suppress
    if any(error_pattern in exc_message for error_pattern in [
        "'dict' object has no attribute 'environment'",
        "object has no attribute 'environment'",
        "Event loop is closed"
    ]):
        # These are known issues with async cleanup - suppress them completely
        print(f"[INFO] Suppressed known error during cleanup: {exc_type.__name__}: {exc_value}")
        return

    # For other errors during Python shutdown/finalization, print a simplified message
    if hasattr(sys, 'is_finalizing') and sys.is_finalizing():
        # Just print a short message instead of the full traceback
        print(f"[WARNING] Error during shutdown: {exc_type.__name__}: {exc_value}")
        return

    # For all other exceptions, use the original exception hook with full traceback
    original_excepthook(exc_type, exc_value, exc_traceback)

# Set the custom exception hook
sys.excepthook = custom_excepthook

# Import required packages and modules
from agents import Runner, ItemHelpers
from openai.types.responses import ResponseTextDeltaEvent
from magi.utils.claude import setup_claude_symlinks
from magi.utils.memory import add_input, add_output, load_memory
from magi.utils.fifo import process_commands_from_file
from magi.magi_agents import create_agent

async def run_magi_command(command: str, agent: str = "supervisor") -> str:
    """
    Execute a command using an agent and capture the results.

    This function serves as the main API for executing commands in the MAGI system.
    It initializes the agent, processes the command, captures and stores
    the output, and handles any errors that occur during processing.

    Args:
        command: The command string to process (user input)

    Returns:
        str: The combined output from all agent interactions

    Raises:
        No exceptions are raised directly; errors are captured and returned as error messages
    """

    # Record command in system memory for context
    add_input(command)

    # Collection of all output chunks for final result
    all_output: List[str] = []

    # Run the command through the selected agent with streaming output
    print(f"=== Run starting with {agent}===")

    stream = Runner.run_streamed(create_agent(agent), command)

    async for event in stream.stream_events():
        # event.delta often includes partial text or function call info

        if hasattr(event, 'data') and hasattr(event.data, 'delta'):
            # Just print the delta text directly without any formatting
            print(event.data.delta, end="", flush=True)
            continue

        if hasattr(event, 'data') and hasattr(event.data, 'type') and isinstance(event.data.type, str) and event.data.type.endswith(".done"):
            # A delta is done - let's get a new line
            print("\n", end="", flush=True)
            continue

        continue

        # For all other events, use recursive conversion and JSON formatting
        def convert_to_serializable(obj):
            if hasattr(obj, "__dict__"):
                return {k: convert_to_serializable(v) for k, v in obj.__dict__.items() if not k.startswith("_")}
            elif isinstance(obj, (list, tuple)):
                return [convert_to_serializable(item) for item in obj]
            elif isinstance(obj, dict):
                return {k: convert_to_serializable(v) for k, v in obj.items()}
            elif isinstance(obj, (str, int, float, bool, type(None))):
                return obj
            else:
                return f"{type(obj).__name__}: {str(obj)}"

        event_type = event.__class__.__name__
        event_data = convert_to_serializable(event)
        event_dict = {"type": event_type, "data": event_data}
        print(json.dumps(event_dict, indent=2), flush=True)

    # Log completion
    print("=== Run complete ===")

    # Combine all captured output chunks
    combined_output = ''.join(all_output)

    # Store result in memory for context in future commands
    add_output(combined_output)

    return combined_output


def process_command(command: str, agent: str = "supervisor") -> str:
    """
    Process a command synchronously by running the async command processor.

    This is a convenience wrapper around run_magi_command that handles the
    async-to-sync conversion using asyncio.run().

    Args:
        command: The command string from the user to process

    Returns:
        str: Result of processing the command
    """
    # Log the incoming command
    print(f"> {command}")

    # Run the async command processor in a new event loop
    return asyncio.run(run_magi_command(command, agent))

def main():
    parser = argparse.ArgumentParser(description="Run the Magi System")
    parser.add_argument("-t", "--test",
        help="Run in test mode and don't wait for additional commands",
        action='store_true')
    parser.add_argument("-d", "--debug",
        help="Output full debug log from AI tools",
        action='store_true')
    parser.add_argument("-a", "--agent",
        help="Run in test mode and don't wait for additional commands",
        type=str,
        default="supervisor")
    parser.add_argument("-p", "--prompt",
        help="Initial prompt to run at startup",
        type=str,
        required=True)
    args = parser.parse_args()

    # Verify API key is available
    if not os.environ.get('OPENAI_API_KEY'):
        print("**Error** OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    # Set up authentication for Claude
    setup_claude_symlinks()

    # Load previous conversation context from persistent storage
    load_memory()

    if args.debug:
        from agents import enable_verbose_stdout_logging
        enable_verbose_stdout_logging()

    if args.prompt:
        result = process_command(args.prompt, args.agent)

    # Exit if running in test mode
    if args.test:
        print("\nTesting complete. Exiting.")
        
        # Set a custom exception hook that ignores specific errors during shutdown
        def shutdown_excepthook(exc_type, exc_value, exc_traceback):
            # Filter out event loop errors during shutdown
            if issubclass(exc_type, RuntimeError) and "Event loop is closed" in str(exc_value):
                # Silently ignore these errors
                return
            # Pass all other exceptions to the original handler
            original_excepthook(exc_type, exc_value, exc_traceback)
            
        # Install the custom hook for the shutdown process
        sys.excepthook = shutdown_excepthook
        
        # Force Python garbage collection to help clean up resources
        import gc
        gc.collect()
        
        sys.exit(0)

    # Start monitoring for commands from named pipe (FIFO)
    process_commands_from_file(process_command, args.agent)


if __name__ == "__main__":
    try:
        main()

    except KeyboardInterrupt:
        print("\nMagi system terminated by user.")
        sys.exit(0)
