#!/usr/bin/env python3
"""
Test script to verify tool usage with non-OpenAI models
"""
import asyncio
import os
import sys
import logging
from pathlib import Path

# Add the parent directory to path so we can import magi modules
sys.path.append(str(Path(__file__).parent.parent))

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

from magi.utils.model_provider import (
    setup_retry_and_fallback_provider, 
    call_claude_directly,
    call_gemini_directly,
    call_grok_directly
)

# Sample function schema for tools
# Define a standard tool in OpenAI format
CALCULATOR_TOOL = {
    "type": "function",
    "function": {
        "name": "calculate",
        "description": "Perform a simple calculation",
        "parameters": {
            "type": "object",
            "properties": {
                "a": {
                    "type": "number",
                    "description": "First number"
                },
                "b": {
                    "type": "number",
                    "description": "Second number"
                },
                "operation": {
                    "type": "string",
                    "enum": ["add", "subtract", "multiply", "divide"],
                    "description": "The operation to perform"
                }
            },
            "required": ["a", "b", "operation"]
        }
    }
}

# Define Claude-specific tool format (since it's been challenging to get right)
CLAUDE_CALCULATOR_TOOL = {
    "type": "custom",
    "custom": {
        "name": "calculate",
        "description": "Perform a simple calculation",
        "parameters": {
            "properties": {
                "a": {
                    "type": "number",
                    "description": "First number"
                },
                "b": {
                    "type": "number",
                    "description": "Second number"
                },
                "operation": {
                    "type": "string",
                    "enum": ["add", "subtract", "multiply", "divide"],
                    "description": "The operation to perform"
                }
            },
            "required": ["a", "b", "operation"]
        }
    }
}

async def test_model_with_tools(model_name: str, query: str):
    """
    Test a specific model with a tool-using prompt.
    
    Args:
        model_name: The model to test
        query: The query to send to the model
    """
    print(f"\n=== Testing {model_name} ===")
    
    # Initialize model provider system
    setup_retry_and_fallback_provider()
    
    # Determine provider for model
    provider = None
    if "claude" in model_name:
        provider = "anthropic"
    elif "gemini" in model_name:
        provider = "google"
    elif "grok" in model_name:
        provider = "xai"
    else:
        provider = "openai"
    
    # Create system message
    system_message = "You are a helpful calculator. When asked to calculate something, always use the calculate tool."
    
    # Test with direct API call
    try:
        # Now we can use the standard OpenAI format for all models
        # Our model_provider.py will handle the conversion automatically
        response = None
        
        if provider == "anthropic":
            # Use the Claude-specific tool format since it's been challenging to get right
            response = await call_claude_directly(
                model_name=model_name,
                system_message=system_message,
                user_message=query,
                tools=[CLAUDE_CALCULATOR_TOOL],
                max_tokens=1000,
                temperature=0.7
            )
        elif provider == "google":
            response = await call_gemini_directly(
                model_name=model_name,
                system_message=system_message,
                user_message=query,
                tools=[CALCULATOR_TOOL],
                max_tokens=1000,
                temperature=0.7
            )
        elif provider == "xai":
            response = await call_grok_directly(
                model_name=model_name,
                system_message=system_message,
                user_message=query,
                tools=[CALCULATOR_TOOL],
                max_tokens=1000,
                temperature=0.7
            )
        else:
            print(f"OpenAI models not tested directly in this script")
            return
            
        # Process response
        if hasattr(response, 'choices') and len(response.choices) > 0:
            message = response.choices[0].message
            
            # Check for tool calls
            if hasattr(message, 'tool_calls') and message.tool_calls:
                print(f"Tool call detected! The model used the calculator tool.")
                for tool_call in message.tool_calls:
                    if hasattr(tool_call, 'function'):
                        print(f"Function: {tool_call.function.name}")
                        print(f"Arguments: {tool_call.function.arguments}")
            else:
                print(f"No tool call detected. Model simply responded with text.")
                
            # Print the text content
            print(f"Text: {message.content}")
        else:
            print(f"Unexpected response format")
            
    except Exception as e:
        print(f"Error: {str(e)}")

async def main():
    # Query asking to use the tool
    query = "Can you calculate 25 * 42 for me?"
    
    # Test with different models
    await test_model_with_tools("claude-3-5-haiku-latest", query)
    await test_model_with_tools("gemini-2.0-flash", query)
    
    # Grok model (if API key available)
    if os.environ.get("XAI_API_KEY"):
        await test_model_with_tools("grok-2", query)

if __name__ == "__main__":
    asyncio.run(main())