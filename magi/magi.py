"""
MAGI - Command processor module for the MAGI System
"""
import sys
import os
import asyncio
from typing import Optional

# Add the parent directory to the path so we can do direct imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import from utility modules using direct imports
from agents import Runner, ItemHelpers
from openai.types.responses import ResponseTextDeltaEvent
from magi.utils.claude import setup_claude_symlinks, run_claude_cli
from magi.utils.memory import add_input, add_output, load_memory
from magi.utils.fifo import process_commands_from_file
from magi.core_agents.supervisor import create_supervisor_agent

# Placeholder for browser initialization - to be implemented if needed
async def initialize_browser():
    """
    Placeholder for browser initialization.

    This function is passed to the supervisor agent which in turn passes it to
    the browser agent. The browser agent only initializes the browser when needed.

    For now, this returns None - browser functionality can be implemented later.
    """
    print("Browser initialization requested but not implemented")
    return None

async def run_magi_command(command: str) -> str:
    """
    Public API function for running a command directly using the supervisor agent.

    Args:
        command: The command string to process

    Returns:
        Result string
    """
    # Add this command to memory
    add_input(command)

    # Process the command using the supervisor agent
    try:
        # Create the supervisor agent with access to all specialized agents
        supervisor = await create_supervisor_agent(initialize_browser)

        # Stream handler to capture output in real-time
        all_output = []

        result = Runner.run_streamed(
            supervisor,
            input=command,
        )
        print("=== Run starting ===")
        async for event in result.stream_events():
            # We'll ignore the raw responses event deltas
            sys.stdout.flush()
            if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                print(event.data.delta, end="", flush=True)

            if event.type == "raw_response_event":
                continue
            elif event.type == "agent_updated_stream_event":
                print(f"Agent: {event.new_agent.name}")
                continue
            elif event.type == "run_item_stream_event":
                if event.item.type == "tool_call_item":
                    print("-- Tool was called")
                elif event.item.type == "tool_call_output_item":
                    print(f"-- Tool output: {event.item.output}")
                elif event.item.type == "message_output_item":
                    print(f"-- Message output:\n {ItemHelpers.text_message_output(event.item)}")
                    all_output.append(ItemHelpers.text_message_output(event.item))
                else:
                    pass  # Ignore other event types

        print("=== Run complete ===")

        # Combine all output chunks
        combined_output = ''.join(all_output)

        # Store the output in memory
        add_output(combined_output)

        return combined_output
    except Exception as e:
        error_msg = f"Error running magi command with supervisor: {str(e)}"
        print(error_msg)

def process_command(command: str) -> str:
    """
    Process a command and return the result.

    Args:
        command: The command string to process

    Returns:
        Result of processing the command
    """
    # Run the command asynchronously
    print(f"> {command}")
    return asyncio.run(run_magi_command(command))

if __name__ == "__main__":
    # Check for environment variables
    command = os.environ.get('COMMAND', '')

    # Check OpenAI API key is set
    if not os.environ.get('OPENAI_API_KEY'):
        print("**Warning** OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    # Set up symlinks for Claude credentials
    setup_claude_symlinks()

    # Load memory from persistent storage
    load_memory()

    # If run with command argument, process it directly and exit
    if len(sys.argv) > 1:
        command = sys.argv[1]
        result = process_command(command)
        sys.exit(0)

    # If we have a command from environment, process it
    if command:
        result = process_command(command)

    # Exit after processing if TEST_SCRIPT is set
    if os.environ.get('TEST_SCRIPT'):
        print("\nTesting complete.")
        sys.exit(0)

    # Start monitoring for commands from file
    process_commands_from_file(process_command)
