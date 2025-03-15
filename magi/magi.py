"""
MAGI - Command processor module for the MAGI System

This module serves as the main entry point for the MAGI system's Python backend.
It handles command processing, agent initialization, and system setup.
"""
import sys
import os
import asyncio
from typing import Optional, List

# Configure module path to ensure imports work correctly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import required packages and modules
from agents import Runner, ItemHelpers
from openai.types.responses import ResponseTextDeltaEvent
from magi.utils.claude import setup_claude_symlinks, run_claude_cli
from magi.utils.memory import add_input, add_output, load_memory
from magi.utils.fifo import process_commands_from_file
from magi.core_agents.supervisor import create_supervisor_agent

async def initialize_browser():
    """
    Initialize a browser for web interactions when requested.
    
    This function is passed to the supervisor agent which then passes it to
    the browser agent. The browser agent calls this function only when a browser
    is needed for a specific task, ensuring resources are used efficiently.
    
    In a full implementation, this would:
    1. Initialize a Playwright browser instance
    2. Configure browser parameters (viewport, user-agent, etc.)
    3. Return a browser controller object
    
    Returns:
        None: Currently returns None as browser functionality is simulated.
              When implementing real browser support, this should return a
              browser controller object compatible with the browser_computer module.
    """
    print("Browser initialization requested but real browser support is not implemented")
    # In a real implementation, this would return a browser controller object
    # For example: return await playwright.chromium.launch(headless=True)
    return None

async def run_magi_command(command: str) -> str:
    """
    Execute a command using the supervisor agent and capture the results.
    
    This function serves as the main API for executing commands in the MAGI system.
    It initializes the supervisor agent, processes the command, captures and stores
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
    
    try:
        # Initialize the supervisor agent with all specialized subagents
        supervisor = await create_supervisor_agent(initialize_browser)
        
        # Run the command through the supervisor agent with streaming output
        result = Runner.run_streamed(
            supervisor,
            input=command,
        )
        
        # Log the start of execution
        print("=== Run starting ===")
        
        # Process each streaming event as it arrives
        async for event in result.stream_events():
            # Ensure stdout is flushed for real-time Docker logs
            sys.stdout.flush()
            
            # Handle different event types
            if event.type == "raw_response_event":
                # Show deltas (token streaming) for real-time output
                if isinstance(event.data, ResponseTextDeltaEvent):
                    print(event.data.delta, end="", flush=True)
                # Skip other raw response events
                continue
                
            elif event.type == "agent_updated_stream_event":
                # Log agent transitions for debugging
                print(f"Agent: {event.new_agent.name}")
                continue
                
            elif event.type == "run_item_stream_event":
                # Handle different item types from the run stream
                if event.item.type == "tool_call_item":
                    print("-- Tool was called")
                elif event.item.type == "tool_call_output_item":
                    print(f"-- Tool output: {event.item.output}")
                elif event.item.type == "message_output_item":
                    # Get text content from message outputs
                    message_text = ItemHelpers.text_message_output(event.item)
                    print(f"-- Message output:\n {message_text}")
                    all_output.append(message_text)
                # Other event types are ignored
        
        # Log completion
        print("=== Run complete ===")
        
        # Combine all captured output chunks
        combined_output = ''.join(all_output)
        
        # Store result in memory for context in future commands
        add_output(combined_output)
        
        return combined_output
        
    except Exception as e:
        # Handle any unexpected exceptions
        error_msg = f"Error running MAGI command with supervisor: {str(e)}"
        print(error_msg)
        
        # Add error to memory and return for display to user
        error_output = f"ERROR: {error_msg}"
        add_output(error_output)
        return error_output

def process_command(command: str) -> str:
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
    return asyncio.run(run_magi_command(command))

if __name__ == "__main__":
    try:
        # Check for command from environment variable (used by Docker)
        command = os.environ.get('COMMAND', '')

        # Verify API key is available
        if not os.environ.get('OPENAI_API_KEY'):
            print("**Error** OPENAI_API_KEY environment variable not set")
            print("Please set this environment variable to use the OpenAI API")
            sys.exit(1)

        # Set up authentication for Claude
        setup_claude_symlinks()

        # Load previous conversation context from persistent storage
        load_memory()

        # Priority 1: Command line argument
        if len(sys.argv) > 1:
            command = sys.argv[1]
            print(f"Processing command from argument: {command}")
            result = process_command(command)
            sys.exit(0)

        # Priority 2: Environment variable (used by Docker)
        if command:
            print(f"Processing command from environment: {command}")
            result = process_command(command)

        # Exit if running in test mode
        if os.environ.get('TEST_SCRIPT'):
            print("\nTesting complete. Exiting.")
            sys.exit(0)

        # If no one-time command was specified, start interactive mode
        print("Starting command monitoring mode...")
        print("Send commands to the FIFO file at /tmp/command.fifo")
        
        # Start monitoring for commands from named pipe (FIFO)
        process_commands_from_file(process_command)
        
    except KeyboardInterrupt:
        print("\nMagi system terminated by user.")
        sys.exit(0)
    except Exception as e:
        print(f"Unhandled exception in main process: {str(e)}")
        sys.exit(1)
