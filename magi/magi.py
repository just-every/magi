"""
MAGI - Command processor module for the MAGI System

This module serves as the main entry point for the MAGI system's Python backend.
It handles command processing, agent initialization, and system setup.

Event Structure Documentation:
------------------------------
When processing events from result.stream_events(), the following event types are handled:

1. raw_response_event: Contains raw response data for streaming output
2. agent_updated_stream_event: Signals transition to a different specialized agent
3. run_item_stream_event: Contains processing items (tool calls, outputs, messages)
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

# Add specific function to handle tool calls that may be in different formats
def extract_tool_call_data(tool_call):
    """
    Extract data from a tool call object regardless of its format.
    
    Handles different formats including:
    - OpenAI ChatCompletionMessageToolCall objects
    - Dictionary-style objects with 'get' method
    - Objects with direct attribute access
    
    Returns:
        tuple: (tool_id, tool_type, function_name, function_args)
    """
    # Default values
    tool_id = f"call_{hash(str(tool_call))}"
    tool_type = "function"
    function_name = "unknown_function"
    function_args = "{}"
    
    try:
        # Check if it's a ChatCompletionMessageToolCall by class name
        tool_class_name = tool_call.__class__.__name__ if hasattr(tool_call, '__class__') else "unknown"
        
        if tool_class_name == "ChatCompletionMessageToolCall":
            # Handle specific OpenAI object format
            tool_id = getattr(tool_call, 'id', tool_id)
            
            if hasattr(tool_call, 'function'):
                function_obj = tool_call.function
                if hasattr(function_obj, 'name'):
                    function_name = function_obj.name
                if hasattr(function_obj, 'arguments'):
                    function_args = function_obj.arguments
        
        # Handle object with direct attribute access
        elif hasattr(tool_call, 'id') and not isinstance(tool_call, dict):
            tool_id = tool_call.id
            tool_type = getattr(tool_call, 'type', tool_type)
            
            if hasattr(tool_call, 'function'):
                function_data = tool_call.function
                if hasattr(function_data, 'name'):
                    function_name = function_data.name
                if hasattr(function_data, 'arguments'):
                    function_args = function_data.arguments
        
        # Handle dictionary-style access
        elif hasattr(tool_call, 'get'):
            tool_id = tool_call.get("id", tool_id)
            tool_type = tool_call.get("type", tool_type)
            function_data = tool_call.get("function", {})
            
            if isinstance(function_data, dict) and hasattr(function_data, 'get'):
                function_name = function_data.get("name", function_name)
                function_args = function_data.get("arguments", function_args)
            elif hasattr(function_data, 'name'):
                function_name = function_data.name
                if hasattr(function_data, 'arguments'):
                    function_args = function_data.arguments
    except Exception as e:
        print(f"Error extracting tool call data: {str(e)}", file=sys.stderr)
    
    # Try to extract name from arguments if function_name is unknown
    try:
        if function_name == "unknown_function" and function_args:
            args_dict = json.loads(function_args) if isinstance(function_args, str) else function_args
            if isinstance(args_dict, dict) and "name" in args_dict:
                function_name = args_dict["name"]
    except:
        pass
    
    return tool_id, tool_type, function_name, function_args

# Add an exception filter to suppress the "environment" attribute error on exit
# This helps prevent noise in the logs during shutdown
original_excepthook = sys.excepthook

def custom_excepthook(exc_type: Type[BaseException], exc_value: BaseException, exc_traceback):
    """Custom exception hook to filter out known harmless errors during shutdown."""
    # Get the exception message as a string for pattern matching
    exc_message = str(exc_value)

    # Filter out all "task exception was never retrieved" errors
    if "Task exception was never retrieved" in exc_message:
        return
        
    # Check for specific errors to suppress
    harmless_patterns = [
        "'dict' object has no attribute 'environment'",
        "object has no attribute 'environment'",
        "Event loop is closed",
        "validation error for ResponseUsage",
        "input_tokens_details",
        "ResponseUsage",
        "pydantic_core._pydantic_core.ValidationError",
        "forcing direct api call",
        "forcing simple_run",
        "Field required [type=missing, input_value={",
        "validation error for",
        "pydantic",
        "future: <Task",
        "future:",
        "Task-"
    ]
    
    if any(pattern in exc_message for pattern in harmless_patterns):
        # Suppress known harmless errors
        return

    # For other errors during Python shutdown, print a simplified message
    if hasattr(sys, 'is_finalizing') and sys.is_finalizing():
        print(f"[WARNING] Error during shutdown: {exc_type.__name__}: {exc_value}")
        return

    # For all other exceptions, use the original exception hook
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

# Import self-optimization components (with try/except to handle missing module)
try:
    from magi.magi_agents.self_optimization_agent import create_self_optimization_agent
    SELF_OPTIMIZATION_AVAILABLE = True
except ImportError:
    SELF_OPTIMIZATION_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning("Self-optimization agent not available, feature will be disabled")

# Flag to control whether to use self-optimization
# This can be controlled via environment variable and availability
ENABLE_SELF_OPTIMIZATION = (
    os.environ.get("MAGI_ENABLE_SELF_OPTIMIZATION", "true").lower() == "true" and
    SELF_OPTIMIZATION_AVAILABLE
)

async def run_self_optimized_command(command: str, model: str = None) -> str:
    """Execute a command using the self-optimization agent to modify the codebase."""
    # Set up logging
    logger = logging.getLogger(__name__)
    logger.info(f"Starting self-optimization for command: {command[:100]}...")
    
    # Check if self-optimization is available
    if not SELF_OPTIMIZATION_AVAILABLE:
        error_msg = "Self-optimization agent not available"
        logger.error(error_msg)
        raise ImportError(error_msg)
    
    # Record start time and initialize output collection
    start_time = time.time()
    all_output: List[str] = []
    
    # Initialize the self-optimization agent
    print(f"[]{json.dumps({'type': 'info', 'message': 'Initializing self-optimization'})}", flush=True)
    
    self_opt_agent = create_self_optimization_agent()
    if model:
        self_opt_agent.model = model
    
    # Prepare optimization prompt
    optimization_prompt = f"""
    I need you to analyze the following task and optimize the MAGI codebase to better handle it:
    
    TASK: {command}
    
    Follow these steps:
    1. Analyze the task to understand what kind of capabilities are needed
    2. Plan how to modify the codebase to better handle this specific task
    3. Make the necessary code changes
    4. Test your changes thoroughly
    5. Execute the original task using your optimized code
    
    Focus on making targeted changes to improve MAGI's capabilities for this specific task.
    """
    
    # Run the self-optimization agent
    print(f"[]{json.dumps({'type': 'running_command', 'agent': 'SelfOptimizationAgent', 'command': 'Analyzing and optimizing for task'})}", flush=True)
    
    # Process stream events from the agent
    stream = Runner.run_streamed(self_opt_agent, optimization_prompt)
    
    async for event in stream.stream_events():
        # Handle the different event types based on class
        event_class = event.__class__.__name__
        
        # Process agent updates
        if event_class == "AgentUpdatedStreamEvent" and hasattr(event, 'new_agent'):
            try:
                print(f"[]{json.dumps({
                    'type': 'new_agent',
                    'agent': {
                        'name': event.new_agent.name,
                        'model': event.new_agent.model
                    }
                })}", flush=True)
            except Exception:
                pass
            continue
            
        # Handle direct API responses
        elif event_class == "SimpleResponseEvent":
            try:
                text = getattr(event, 'content', '')
                model = getattr(event, 'model', 'unknown')
                
                if text and text.strip():
                    print(f"[]{json.dumps({
                        'type': 'agent_output',
                        'agent': {
                            'name': 'SelfOptimizationAgent',
                            'model': model
                        },
                        'output': {'text': text}
                    })}", flush=True)
                    
                    all_output.append(text)
                else:
                    error_msg = f"Empty content in SimpleResponseEvent from model {model}"
                    print(f"ERROR: {error_msg}", file=sys.stderr)
                    continue
            except Exception as e:
                print(f"Error processing SimpleResponseEvent: {str(e)}", file=sys.stderr)
                raise
            continue
            
        # Handle tool calls
        elif event_class == "ToolCallEvent":
            try:
                tool_calls = getattr(event, 'tool_calls', [])
                model = getattr(event, 'model', 'unknown')
                
                if tool_calls:
                    for tool_call in tool_calls:
                        # Use the utility function to extract data in a consistent way
                        tool_id, tool_type, function_name, function_args = extract_tool_call_data(tool_call)
                        
                        print(f"[]{json.dumps({
                            'type': 'tool_call',
                            'agent': {
                                'name': 'SelfOptimizationAgent', 
                                'model': model
                            },
                            'tool': {
                                'id': tool_id,
                                'type': tool_type,
                                'name': function_name,
                                'arguments': function_args
                            }
                        })}", flush=True)
                else:
                    logger.warning(f"Empty tool_calls in ToolCallEvent from model {model}")
            except Exception as e:
                print(f"Error processing ToolCallEvent: {str(e)}", file=sys.stderr)
            continue
            
        # Process message outputs
        elif event_class == "RunItemStreamEvent" and hasattr(event, 'item'):
            try:
                # Only process message outputs
                if hasattr(event.item, 'type') and event.item.type == "message_output_item":
                    if hasattr(event.item, 'raw_item') and hasattr(event.item.raw_item, 'content'):
                        content = event.item.raw_item.content
                        text = ""
                        
                        # Extract text based on content type
                        if isinstance(content, list):
                            for part in content:
                                if hasattr(part, 'text'):
                                    text += part.text
                        elif hasattr(content, 'text'):
                            text = content.text
                            
                        if text:
                            print(f"[]{json.dumps({
                                'type': 'agent_output',
                                'agent': {
                                    'name': event.item.agent.name,
                                    'model': event.item.agent.model
                                },
                                'output': {'text': text}
                            })}", flush=True)
                            
                            all_output.append(text)
            except Exception:
                pass
            continue
            
        # Skip raw response events
        elif event_class == "RawResponsesStreamEvent":
            continue
    
    # Calculate elapsed time and log summary
    elapsed_time = time.time() - start_time
    logger.info(f"Self-optimization completed in {elapsed_time:.2f} seconds")
    
    print(f"[]{json.dumps({'type': 'info', 'message': f'Self-optimization complete ({elapsed_time:.2f}s)'})}", flush=True)
    
    # Combine output and store in memory
    combined_output = ''.join(all_output)
    add_output(combined_output)
    
    # Log summary
    logger.info(f"Self-optimization process summary:")
    logger.info(f"- Total tokens processed: {len(combined_output.split())} words")
    logger.info(f"- Total execution time: {elapsed_time:.2f} seconds")
    
    return combined_output

async def run_magi_command(command: str, agent: str = "supervisor", model: str = None) -> str:
    """Execute a command using an agent and capture the results.
    
    Args:
        command: The command string to process (user input)
        agent: The agent type to use (default: "supervisor")
        model: Optional model override to force a specific model
    
    Returns:
        str: The combined output from all agent interactions
    """
    # Check if self-optimization is enabled and we're using the supervisor agent
    if ENABLE_SELF_OPTIMIZATION and agent == "supervisor" and SELF_OPTIMIZATION_AVAILABLE:
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
                        # Use the utility function to extract data in a consistent way
                        tool_id, tool_type, function_name, function_args = extract_tool_call_data(tool_call)
                        
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

        # For all other events, log event type only
        event_type = event.__class__.__name__
        print(f"[]{json.dumps({'type': 'event', 'event_type': event_type})}", flush=True)

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
    ENABLE_SELF_OPTIMIZATION = args.self_optimization == "true" and SELF_OPTIMIZATION_AVAILABLE
    
    # Log status of self-optimization
    if args.self_optimization == "true" and not SELF_OPTIMIZATION_AVAILABLE:
        print("**Warning** Self-optimization module not available, feature will be disabled")

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
        
        # Force Python garbage collection and exit
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
