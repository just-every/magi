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
import time
import logging
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
    4. Validation errors for ResponseUsage missing input_tokens_details
    """
    # Get the exception message as a string for pattern matching
    exc_message = str(exc_value)

    # Check for specific errors to suppress
    if any(error_pattern in exc_message for error_pattern in [
        "'dict' object has no attribute 'environment'",
        "object has no attribute 'environment'",
        "Event loop is closed",
        "validation error for ResponseUsage",
        "input_tokens_details",
        "ResponseUsage",
        "pydantic_core._pydantic_core.ValidationError",
        "forcing direct api call",
        "forcing simple_run"
    ]):
        # These are known issues with async cleanup - suppress them completely
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
from magi.utils.model_provider import setup_retry_and_fallback_provider
from magi.magi_agents import create_agent

# Import self-optimization components
from magi.magi_agents.self_optimization_agent import create_self_optimization_agent

# Flag to control whether to use self-optimization
# This can be controlled via environment variable
ENABLE_SELF_OPTIMIZATION = os.environ.get("MAGI_ENABLE_SELF_OPTIMIZATION", "true").lower() == "true"

async def run_self_optimized_command(command: str, model: str = None) -> str:
    """
    Execute a command using the self-optimization agent first to modify the codebase.
    
    This function runs the self-optimization agent to analyze the task and optimize
    the codebase, then executes the command using the optimized code.
    
    Args:
        command: The command string to process (user input)
        model: Optional model override to force a specific model
        
    Returns:
        str: The combined output from the self-optimization and task execution
        
    Raises:
        Exception: If any step of the self-optimization process fails
    """
    # Set up logging
    logger = logging.getLogger(__name__)
    logger.info(f"Starting self-optimization for command: {command[:100]}...")
    
    # Record the start time for performance metrics
    start_time = time.time()
    # Collection of all output chunks for final result
    all_output: List[str] = []
    
    # Initialize the self-optimization agent
    print(f"[]{json.dumps({'type': 'info', 'message': 'Initializing self-optimization'})}", flush=True)
    
    # Create the self-optimization agent
    self_opt_agent = create_self_optimization_agent()
    if model:
        self_opt_agent.model = model
    
    # Prepare a prompt for the self-optimization agent
    optimization_prompt = f"""
    I need you to analyze the following task and optimize the MAGI codebase to better handle it:
    
    TASK: {command}
    
    Follow these steps:
    1. Analyze the task to understand what kind of capabilities are needed
    2. Plan how to modify the codebase to better handle this specific task
    3. Make the necessary code changes
    4. Test your changes thoroughly
    5. Execute the original task using your optimized code
    
    Be thorough in your analysis and implementation. Focus on making targeted changes
    to improve MAGI's capabilities for this specific task.
    """
    
    # Run the self-optimization agent
    print(f"[]{json.dumps({'type': 'running_command', 'agent': 'SelfOptimizationAgent', 'command': 'Analyzing and optimizing for task'})}", flush=True)
    
    # Use the streaming API for the self-optimization agent
    stream = Runner.run_streamed(self_opt_agent, optimization_prompt)
    
    async for event in stream.stream_events():
        # Process events from the self-optimization agent
        # Similar event handling as in the main run_magi_command function
        
        # Handle the different event types based on class
        event_class = event.__class__.__name__
        
        # Process agent updates
        if event_class == "AgentUpdatedStreamEvent" and hasattr(event, 'new_agent'):
            try:
                # Announce agent change
                event_dict = {
                    "type": "new_agent",
                    "agent": {
                        "name": event.new_agent.name,
                        "model": event.new_agent.model
                    }
                }
                print(f"[]{json.dumps(event_dict)}", flush=True)
            except Exception:
                # Silent error handling to ensure smooth operation
                pass
            continue
            
        # Handle our custom SimpleResponseEvent (from direct API fallback)
        elif event_class == "SimpleResponseEvent":
            try:
                # Extract the content and model
                text = getattr(event, 'content', '')
                model = getattr(event, 'model', 'unknown')
                
                # Make sure text is not empty or just whitespace
                if text and text.strip():
                    # Format similarly to agent_output
                    event_dict = {
                        "type": "agent_output",
                        "agent": {
                            "name": "SelfOptimizationAgent",
                            "model": model
                        },
                        "output": {"text": text}
                    }
                    print(f"[]{json.dumps(event_dict)}", flush=True)
                    
                    # Add output for the combined result
                    all_output.append(text)
                else:
                    # Log error but don't suppress it
                    error_msg = f"Empty content in SimpleResponseEvent from model {model}"
                    print(f"ERROR: {error_msg}", file=sys.stderr)
                    # Raise an exception to trigger fallback to another model
                    continue
            except Exception as e:
                # Log error
                print(f"Error processing SimpleResponseEvent: {str(e)}", file=sys.stderr)
                raise
            continue
            
        # Handle ToolCallEvent from our direct API implementations
        elif event_class == "ToolCallEvent":
            try:
                # Extract tool calls and model info
                tool_calls = getattr(event, 'tool_calls', [])
                model = getattr(event, 'model', 'unknown')
                
                if tool_calls:
                    # Format as tool_call_item which will be processed by the agent framework
                    for tool_call in tool_calls:
                        # Extract tool call details
                        tool_id = tool_call.get("id", f"call_{hash(str(tool_call))}")
                        tool_type = tool_call.get("type", "function")
                        function_data = tool_call.get("function", {})
                        function_name = function_data.get("name", "unknown_function")
                        function_args = function_data.get("arguments", "{}")
                        
                        # Create equivalent of tool_call_item event
                        tool_event_dict = {
                            "type": "tool_call",
                            "agent": {
                                "name": "SelfOptimizationAgent",
                                "model": model
                            },
                            "tool": {
                                "id": tool_id,
                                "type": tool_type,
                                "name": function_name,
                                "arguments": function_args
                            }
                        }
                        print(f"[]{json.dumps(tool_event_dict)}", flush=True)
                else:
                    logger.warning(f"Empty tool_calls in ToolCallEvent from model {model}")
            except Exception as e:
                # Log error
                print(f"Error processing ToolCallEvent: {str(e)}", file=sys.stderr)
            continue
            
        # Process message outputs
        elif event_class == "RunItemStreamEvent" and hasattr(event, 'item'):
            try:
                # Only process message outputs for now
                if hasattr(event.item, 'type') and event.item.type == "message_output_item":
                    # Extract content from raw item
                    if hasattr(event.item, 'raw_item') and hasattr(event.item.raw_item, 'content'):
                        # Extract text from content
                        content = event.item.raw_item.content
                        text = ""
                        
                        # Handle content based on type
                        if isinstance(content, list):
                            # Combine all text parts
                            for part in content:
                                if hasattr(part, 'text'):
                                    text += part.text
                        elif hasattr(content, 'text'):
                            # Direct text property
                            text = content.text
                            
                        # Only output if we have text
                        if text:
                            event_dict = {
                                "type": "agent_output",
                                "agent": {
                                    "name": event.item.agent.name,
                                    "model": event.item.agent.model
                                },
                                "output": {"text": text}
                            }
                            print(f"[]{json.dumps(event_dict)}", flush=True)
                            
                            # Add output for the combined result
                            all_output.append(text)
            except Exception:
                # Silent error handling to ensure smooth operation
                pass
            continue
            
        # Skip raw response events - they're handled through RunItemStreamEvent
        elif event_class == "RawResponsesStreamEvent":
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
    
    # Calculate and log the elapsed time
    elapsed_time = time.time() - start_time
    logger.info(f"Self-optimization completed in {elapsed_time:.2f} seconds")
    
    print(f"[]{json.dumps({'type': 'info', 'message': f'Self-optimization complete ({elapsed_time:.2f}s)'})}", flush=True)
    
    # Return the combined output
    combined_output = ''.join(all_output)
    
    # Store result in memory for context in future commands
    add_output(combined_output)
    
    # Log a summary of the self-optimization process
    logger.info(f"Self-optimization process summary:")
    logger.info(f"- Total tokens processed: {len(combined_output.split())} words")
    logger.info(f"- Total execution time: {elapsed_time:.2f} seconds")
    
    return combined_output

async def run_magi_command(command: str, agent: str = "supervisor", model: str = None) -> str:
    """
    Execute a command using an agent and capture the results.

    This function serves as the main API for executing commands in the MAGI system.
    It initializes the agent, processes the command, captures and stores
    the output, and handles any errors that occur during processing.

    Args:
        command: The command string to process (user input)
        agent: The agent type to use (default: "supervisor")
        model: Optional model override to force a specific model

    Returns:
        str: The combined output from all agent interactions

    Raises:
        No exceptions are raised directly; errors are captured and returned as error messages
    """
    # Check if self-optimization is enabled and we're using the supervisor agent
    if ENABLE_SELF_OPTIMIZATION and agent == "supervisor":
        try:
            # Run the command with self-optimization
            print(f"[]{json.dumps({'type': 'info', 'message': 'Using self-optimization'})}", flush=True)
            return await run_self_optimized_command(command, model)
        except Exception as e:
            # If self-optimization fails, fall back to regular execution
            print(f"[]{json.dumps({'type': 'error', 'message': f'Self-optimization failed: {str(e)}'})}", flush=True)
            print(f"[]{json.dumps({'type': 'info', 'message': 'Falling back to regular execution'})}", flush=True)
            # Continue with regular execution below
    
    # Record command in system memory for context
    add_input(command)

    # Collection of all output chunks for final result
    all_output: List[str] = []

    # Run the command through the selected agent with streaming output
    print(f"[]{json.dumps({"type": "running_command", "agent": agent, "command": command})}", flush=True)

    # Create the agent with specified type and model
    if model:
        print(f"[]{json.dumps({'type': 'info', 'message': f'Forcing model: {model}'})}", flush=True)

    # Create the agent with model parameter (will apply model-specific settings automatically)
    agent_instance = create_agent(agent, model)

    # Run the command with streaming (fallback logic is handled by patched Runner.run)
    stream = Runner.run_streamed(agent_instance, command)

    async for event in stream.stream_events():
        # event.delta often includes partial text or function call info

        # Handle the different event types based on class
        event_class = event.__class__.__name__

        # Process agent updates
        if event_class == "AgentUpdatedStreamEvent" and hasattr(event, 'new_agent'):
            try:
                # Announce agent change
                event_dict = {
                    "type": "new_agent",
                    "agent": {
                        "name": event.new_agent.name,
                        "model": event.new_agent.model
                    }
                }
                print(f"[]{json.dumps(event_dict)}", flush=True)
            except Exception:
                # Silent error handling to ensure smooth operation
                pass
            continue

        # Handle our custom SimpleResponseEvent (from direct API fallback)
        elif event_class == "SimpleResponseEvent":
            try:
                # Extract the content and model
                text = getattr(event, 'content', '')
                model = getattr(event, 'model', 'unknown')

                # Make sure text is not empty or just whitespace
                if text and text.strip():
                    # Format similarly to agent_output
                    event_dict = {
                        "type": "agent_output",
                        "agent": {
                            "name": "Agent",  # Generic name since we don't have the actual agent name
                            "model": model
                        },
                        "output": {"text": text}
                    }
                    print(f"[]{json.dumps(event_dict)}", flush=True)

                    # Add output for the combined result
                    all_output.append(text)
                else:
                    # Log error but don't suppress it
                    error_msg = f"Empty content in SimpleResponseEvent from model {model}"
                    print(f"ERROR: {error_msg}", file=sys.stderr)
                    # Raise an exception to trigger fallback to another model
                    continue
            except Exception as e:
                # Log error
                print(f"Error processing SimpleResponseEvent: {str(e)}", file=sys.stderr)
                raise
            continue
            
        # Handle ToolCallEvent from our direct API implementations
        elif event_class == "ToolCallEvent":
            try:
                # Extract tool calls and model info
                tool_calls = getattr(event, 'tool_calls', [])
                model = getattr(event, 'model', 'unknown')
                
                if tool_calls:
                    # Format as tool_call_item which will be processed by the agent framework
                    for tool_call in tool_calls:
                        # Extract tool call details
                        tool_id = tool_call.get("id", f"call_{hash(str(tool_call))}")
                        tool_type = tool_call.get("type", "function")
                        function_data = tool_call.get("function", {})
                        function_name = function_data.get("name", "unknown_function")
                        function_args = function_data.get("arguments", "{}")
                        
                        # Create equivalent of tool_call_item event
                        tool_event_dict = {
                            "type": "tool_call",
                            "agent": {
                                "name": "Agent",  # Generic name
                                "model": model
                            },
                            "tool": {
                                "id": tool_id,
                                "type": tool_type,
                                "name": function_name,
                                "arguments": function_args
                            }
                        }
                        print(f"[]{json.dumps(tool_event_dict)}", flush=True)
                else:
                    logger.warning(f"Empty tool_calls in ToolCallEvent from model {model}")
            except Exception as e:
                # Log error
                print(f"Error processing ToolCallEvent: {str(e)}", file=sys.stderr)
            continue

        # Process message outputs
        elif event_class == "RunItemStreamEvent" and hasattr(event, 'item'):
            try:
                # Only process message outputs for now
                if hasattr(event.item, 'type') and event.item.type == "message_output_item":
                    # Extract content from raw item
                    if hasattr(event.item, 'raw_item') and hasattr(event.item.raw_item, 'content'):
                        # Extract text from content
                        content = event.item.raw_item.content
                        text = ""

                        # Handle content based on type
                        if isinstance(content, list):
                            # Combine all text parts
                            for part in content:
                                if hasattr(part, 'text'):
                                    text += part.text
                        elif hasattr(content, 'text'):
                            # Direct text property
                            text = content.text

                        # Only output if we have text
                        if text:
                            event_dict = {
                                "type": "agent_output",
                                "agent": {
                                    "name": event.item.agent.name,
                                    "model": event.item.agent.model
                                },
                                "output": {"text": text}
                            }
                            print(f"[]{json.dumps(event_dict)}", flush=True)

                            # Add output for the combined result
                            all_output.append(text)
            except Exception:
                # Silent error handling to ensure smooth operation
                pass
            continue

        # Skip raw response events - they're handled through RunItemStreamEvent
        elif event_class == "RawResponsesStreamEvent":
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

    print(f"[]{json.dumps({"type": "waiting_command"})}", flush=True)

    # Combine all captured output chunks
    combined_output = ''.join(all_output)

    # Store result in memory for context in future commands
    add_output(combined_output)

    return combined_output


def process_command(command: str, agent: str = "supervisor", model: str = None) -> str:
    """
    Process a command synchronously by running the async command processor.

    This is a convenience wrapper around run_magi_command that handles the
    async-to-sync conversion using asyncio.run().

    Args:
        command: The command string from the user to process
        agent: The agent type to use (default: "supervisor")
        model: Optional model override to force a specific model

    Returns:
        str: Result of processing the command
    """
    # Log the incoming command
    print(f"> {command}")

    # Run the async command processor in a new event loop
    return asyncio.run(run_magi_command(command, agent, model))

def main():
    parser = argparse.ArgumentParser(description="Run the Magi System")
    parser.add_argument("-t", "--test",
        help="Run in test mode and don't wait for additional commands",
        action='store_true')
    parser.add_argument("-d", "--debug",
        help="Output full debug log from AI tools",
        action='store_true')
    parser.add_argument("-a", "--agent",
        help="Specify which agent to use initially",
        type=str,
        default="supervisor")
    parser.add_argument("-p", "--prompt",
        help="Initial prompt to run at startup",
        type=str,
        required=False)
    parser.add_argument("-b", "--base64",
        help="Base64-encoded initial prompt to run at startup",
        type=str,
        required=False)
    parser.add_argument("-m", "--model",
        help="Force a specific model to be used (e.g., gpt-4o, claude-3-7-sonnet-latest)",
        type=str,
        required=False)
    parser.add_argument("--list-models",
        help="List all available models and exit",
        action='store_true')
    parser.add_argument("--self-optimization",
        help="Enable or disable self-optimization (default: True)",
        choices=["true", "false"],
        type=str.lower,
        default=os.environ.get("MAGI_ENABLE_SELF_OPTIMIZATION", "true").lower())
    args = parser.parse_args()
    
    # Update self-optimization flag from command line arguments
    global ENABLE_SELF_OPTIMIZATION
    ENABLE_SELF_OPTIMIZATION = args.self_optimization == "true"

    # Verify API key is available
    if not os.environ.get('OPENAI_API_KEY'):
        print("**Error** OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    # Set up authentication for Claude
    setup_claude_symlinks()

    # Load previous conversation context from persistent storage
    load_memory()

    # Set up our custom provider with retry and fallback logic
    setup_retry_and_fallback_provider()

    # Handle listing models if requested
    if args.list_models:
        from magi.utils.model_provider import MODEL_CLASSES, MODEL_TO_PROVIDER

        print("\nAvailable models by category:")
        for category, models in MODEL_CLASSES.items():
            print(f"\n{category.upper()}:")
            for model in models:
                provider = MODEL_TO_PROVIDER.get(model, "unknown")
                print(f"  - {model} (Provider: {provider})")

        # Exit after listing models
        sys.exit(0)

    if args.debug:
        from agents import enable_verbose_stdout_logging
        enable_verbose_stdout_logging()

    # Process prompt (either plain text or base64-encoded)
    if args.base64:
        import base64
        try:
            decoded_prompt = base64.b64decode(args.base64).decode('utf-8')
            result = process_command(decoded_prompt, args.agent, args.model)
        except Exception as e:
            print(f"**Error** Failed to decode base64 prompt: {str(e)}")
            sys.exit(1)
    elif args.prompt:
        result = process_command(args.prompt, args.agent, args.model)
    else:
        print("**Error** Either --prompt or --base64 must be provided")
        sys.exit(1)

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
