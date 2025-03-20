"""
Simple test script to verify function tool implementation.

This script tests the new @function_tool implementation by creating a simple
calculator tool and testing it with the model provider system.
"""
import os
import sys
import json
import asyncio
from typing import Dict, Any

# Add the magi directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the function_tool decorator from the agents library
from agents import function_tool

# Import the model provider utilities
from magi.utils.model_provider import (
    setup_retry_and_fallback_provider,
    convert_tools_for_provider,
    MODEL_TO_PROVIDER
)

# Create a simple calculator tool using the function_tool decorator
@function_tool
def calculator(operation: str, a: float, b: float) -> Dict[str, Any]:
    """
    A simple calculator that can add, subtract, multiply, or divide two numbers.
    
    Args:
        operation: The operation to perform (add, subtract, multiply, divide)
        a: The first operand
        b: The second operand
        
    Returns:
        Dictionary containing the result and a description of the operation
    """
    result = None
    description = ""
    
    # Perform the requested operation
    if operation == "add":
        result = a + b
        description = f"{a} + {b} = {result}"
    elif operation == "subtract":
        result = a - b
        description = f"{a} - {b} = {result}"
    elif operation == "multiply":
        result = a * b
        description = f"{a} × {b} = {result}"
    elif operation == "divide":
        if b == 0:
            raise ValueError("Cannot divide by zero")
        result = a / b
        description = f"{a} ÷ {b} = {result}"
    else:
        raise ValueError(f"Unknown operation: {operation}")
    
    return {
        "result": result,
        "description": description
    }

# Test the tool schema generation
def test_tool_schema():
    """Test that the function_tool decorator creates the correct schema."""
    print("\n=== Testing Tool Schema Generation ===")
    
    # Get the calculator tool schema 
    tool = calculator
    
    # Check if the tool has the correct attributes
    print(f"Tool name: {tool.name}")
    print(f"Tool description: {tool.description}")
    
    # Print the schema
    if hasattr(tool, 'params_json_schema'):
        print(f"Parameters schema: {json.dumps(tool.params_json_schema, indent=2)}")
    else:
        print("Error: Tool does not have params_json_schema attribute")
    
    # Check if the openai_schema method exists and works
    if hasattr(tool, 'openai_schema'):
        print(f"OpenAI schema: {json.dumps(tool.openai_schema(), indent=2)}")
    else:
        print("Error: Tool does not have openai_schema method")

# Test tool format conversion for different providers
def test_tool_conversion():
    """Test that tools are correctly converted for different providers."""
    print("\n=== Testing Tool Format Conversion ===")
    
    # List of test models (one per provider)
    test_models = {
        "openai": "gpt-4o",
        "anthropic": "claude-3-7-sonnet-latest",
        "google": "gemini-2.0-flash",
        "xai": "grok-2"
    }
    
    # Test conversion for each provider
    for provider, model in test_models.items():
        print(f"\nTesting conversion for {provider} ({model}):")
        
        # Get the provider-specific format
        tools = convert_tools_for_provider([calculator], provider, model)
        
        # Handle FunctionTool objects specially
        if provider == "openai" or provider == "xai":
            print("OpenAI/X.AI format uses FunctionTool objects directly")
            if hasattr(tools[0], 'name'):
                print(f"  Tool name: {tools[0].name}")
            if hasattr(tools[0], 'description'):
                print(f"  Tool description: {tools[0].description}")
            if hasattr(tools[0], 'params_json_schema'):
                print(f"  Parameters schema available: {len(str(tools[0].params_json_schema))} chars")
            print("  FunctionTool object is passed directly to OpenAI Agents framework")
        else:
            # Claude or Gemini format should be JSON serializable
            print(f"Converted format: {json.dumps(tools[0], indent=2)}")

# Main function
async def main():
    """Main test function."""
    print("=== Function Tool Implementation Test ===")
    
    # Initialize the model provider system
    setup_retry_and_fallback_provider()
    
    # Test tool schema generation
    test_tool_schema()
    
    # Test tool conversion
    test_tool_conversion()
    
    print("\nAll tests completed.")

# Run the tests
if __name__ == "__main__":
    asyncio.run(main())