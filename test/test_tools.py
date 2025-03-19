"""
Test utility for verifying tool usage with different model providers.

This script tests tool usage with OpenAI, Claude, Gemini, and Grok models.
It imports the calculator and currency converter tools and verifies that models can use them correctly.
"""
import os
import sys
import json
import asyncio
import traceback
from typing import Dict, List, Any

# Add the parent directory to sys.path to allow importing magi modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from magi.utils.model_provider import (
    setup_retry_and_fallback_provider,
    convert_openai_tools_to_claude_format,
    convert_openai_tools_to_gemini_format,
    convert_tools_for_provider,
    call_claude_directly,
    call_gemini_directly,
    call_grok_directly,
)

# Import our test tools (using path relative to the project root)
from calculator_tool import calculator, convert_currency

# Create OpenAI formatted tools from our registered tools
CALC_TOOL = calculator.openai_schema()
CURRENCY_TOOL = convert_currency.openai_schema()

# Test prompts that require tool usage
TEST_PROMPT_SIMPLE = "Calculate 25 plus 17"
TEST_PROMPT_COMPLEX = "I need to perform some math operations. First, add 25 and 17. Then, subtract 10 from the result. Finally, multiply that by 2."

async def test_claude_tools():
    """Test tool usage with Claude models."""
    print("\n=== Testing Claude Tool Usage ===")
    
    # Get API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY environment variable not set. Skipping Claude test.")
        return
    
    # Choose a Claude model
    model = "claude-3-7-sonnet-latest"
    print(f"Testing model: {model}")
    
    # Convert both tools to Claude format
    claude_tools = convert_openai_tools_to_claude_format([CALC_TOOL, CURRENCY_TOOL], model)
    print(f"Converted tools to Claude format (showing first tool only): {json.dumps(claude_tools[:1], indent=2)}")
    
    # System message
    system_message = "You are a helpful AI assistant. When math operations are requested, use the calculator tool. When currency conversions are requested, use the currency_converter tool."
    
    # Test simple calculator prompt
    print("\nTesting calculator tool with Claude...")
    try:
        # Call Claude with the tools
        response = await call_claude_directly(
            model_name=model,
            system_message=system_message,
            user_message=TEST_PROMPT_SIMPLE,
            tools=claude_tools
        )
        
        # Check if the response contains tool calls
        if hasattr(response, 'choices') and len(response.choices) > 0:
            message = response.choices[0].message
            if hasattr(message, 'tool_calls') and message.tool_calls:
                print(f"Success! Claude used a tool.")
                print(f"Tool calls: {json.dumps(message.tool_calls, indent=2)}")
            else:
                print(f"Claude did not use the tool. Response content: {message.content}")
        else:
            print("Unexpected response format from Claude.")
    
    except Exception as e:
        print(f"Error testing Claude calculator tool usage: {str(e)}")
        traceback.print_exc()
    
    # Test currency conversion prompt
    print("\nTesting currency converter tool with Claude...")
    try:
        # Call Claude with the tools
        response = await call_claude_directly(
            model_name=model,
            system_message=system_message,
            user_message="Convert 100 USD to EUR",
            tools=claude_tools
        )
        
        # Check if the response contains tool calls
        if hasattr(response, 'choices') and len(response.choices) > 0:
            message = response.choices[0].message
            if hasattr(message, 'tool_calls') and message.tool_calls:
                print(f"Success! Claude used a tool.")
                print(f"Tool calls: {json.dumps(message.tool_calls, indent=2)}")
            else:
                print(f"Claude did not use the tool. Response content: {message.content}")
        else:
            print("Unexpected response format from Claude.")
    
    except Exception as e:
        print(f"Error testing Claude currency converter tool usage: {str(e)}")
        traceback.print_exc()

async def test_gemini_tools():
    """Test tool usage with Gemini models."""
    print("\n=== Testing Gemini Tool Usage ===")
    
    # Get API key
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("GOOGLE_API_KEY environment variable not set. Skipping Gemini test.")
        return
    
    # Choose a Gemini model
    model = "gemini-2.0-flash"
    print(f"Testing model: {model}")
    
    # Convert both tools to Gemini format
    gemini_tools = convert_openai_tools_to_gemini_format([CALC_TOOL, CURRENCY_TOOL])
    print(f"Converted tools to Gemini format (showing first tool only): {json.dumps(gemini_tools[:1], indent=2)}")
    
    # System message
    system_message = "You are a helpful AI assistant. When math operations are requested, use the calculator tool. When currency conversions are requested, use the currency_converter tool."
    
    # Test simple calculator prompt
    print("\nTesting calculator tool with Gemini...")
    try:
        # Call Gemini with the tools
        response = await call_gemini_directly(
            model_name=model,
            system_message=system_message,
            user_message=TEST_PROMPT_SIMPLE,
            tools=gemini_tools
        )
        
        # Check if the response contains tool calls
        if hasattr(response, 'choices') and len(response.choices) > 0:
            message = response.choices[0].message
            if hasattr(message, 'tool_calls') and message.tool_calls:
                print(f"Success! Gemini used a tool.")
                print(f"Tool calls: {json.dumps(message.tool_calls, indent=2)}")
            else:
                print(f"Gemini did not use the tool. Response content: {message.content}")
        else:
            print("Unexpected response format from Gemini.")
    
    except Exception as e:
        print(f"Error testing Gemini calculator tool usage: {str(e)}")
        traceback.print_exc()
    
    # Test currency conversion prompt
    print("\nTesting currency converter tool with Gemini...")
    try:
        # Call Gemini with the tools
        response = await call_gemini_directly(
            model_name=model,
            system_message=system_message,
            user_message="Convert 100 USD to EUR",
            tools=gemini_tools
        )
        
        # Check if the response contains tool calls
        if hasattr(response, 'choices') and len(response.choices) > 0:
            message = response.choices[0].message
            if hasattr(message, 'tool_calls') and message.tool_calls:
                print(f"Success! Gemini used a tool.")
                print(f"Tool calls: {json.dumps(message.tool_calls, indent=2)}")
            else:
                print(f"Gemini did not use the tool. Response content: {message.content}")
        else:
            print("Unexpected response format from Gemini.")
    
    except Exception as e:
        print(f"Error testing Gemini currency converter tool usage: {str(e)}")
        traceback.print_exc()

async def test_grok_tools():
    """Test tool usage with Grok models."""
    print("\n=== Testing Grok Tool Usage ===")
    
    # Get API key
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        print("XAI_API_KEY environment variable not set. Skipping Grok test.")
        return
    
    # Choose a Grok model
    model = "grok-2"
    print(f"Testing model: {model}")
    
    # System message
    system_message = "You are a helpful AI assistant. When math operations are requested, use the calculator tool. When currency conversions are requested, use the currency_converter tool."
    
    # Test simple calculator prompt
    print("\nTesting calculator tool with Grok...")
    try:
        # Call Grok with both tools (Grok uses the OpenAI format directly)
        response = await call_grok_directly(
            model_name=model,
            system_message=system_message,
            user_message=TEST_PROMPT_SIMPLE,
            tools=[CALC_TOOL, CURRENCY_TOOL]
        )
        
        # Check if the response contains tool calls
        if hasattr(response, 'choices') and len(response.choices) > 0:
            message = response.choices[0].message
            if hasattr(message, 'tool_calls') and message.tool_calls:
                print(f"Success! Grok used a tool.")
                print(f"Tool calls: {json.dumps(message.tool_calls, indent=2)}")
            else:
                print(f"Grok did not use the tool. Response content: {message.content}")
        else:
            print("Unexpected response format from Grok.")
    
    except Exception as e:
        print(f"Error testing Grok calculator tool usage: {str(e)}")
        traceback.print_exc()
    
    # Test currency conversion prompt
    print("\nTesting currency converter tool with Grok...")
    try:
        # Call Grok with both tools
        response = await call_grok_directly(
            model_name=model,
            system_message=system_message,
            user_message="Convert 100 USD to EUR",
            tools=[CALC_TOOL, CURRENCY_TOOL]
        )
        
        # Check if the response contains tool calls
        if hasattr(response, 'choices') and len(response.choices) > 0:
            message = response.choices[0].message
            if hasattr(message, 'tool_calls') and message.tool_calls:
                print(f"Success! Grok used a tool.")
                print(f"Tool calls: {json.dumps(message.tool_calls, indent=2)}")
            else:
                print(f"Grok did not use the tool. Response content: {message.content}")
        else:
            print("Unexpected response format from Grok.")
    
    except Exception as e:
        print(f"Error testing Grok currency converter tool usage: {str(e)}")
        traceback.print_exc()

async def test_tool_conversion():
    """Test tool conversion functions for different providers."""
    print("\n=== Testing Tool Format Conversion ===")
    
    # Test our registered tool schemas
    print(f"Original calculator tool schema: {json.dumps(CALC_TOOL, indent=2)}")
    print(f"Original currency converter tool schema: {json.dumps(CURRENCY_TOOL, indent=2)}")
    
    # Test Claude conversion
    claude_tools = convert_openai_tools_to_claude_format([CALC_TOOL, CURRENCY_TOOL], "claude-3-7-sonnet-latest")
    print(f"Claude 3.7 format (first tool): {json.dumps(claude_tools[0], indent=2)}")
    
    claude_tools = convert_openai_tools_to_claude_format([CALC_TOOL, CURRENCY_TOOL], "claude-3-5-sonnet-20240307")
    print(f"Claude 3.5 format (first tool): {json.dumps(claude_tools[0], indent=2)}")
    
    # Test Gemini conversion
    gemini_tools = convert_openai_tools_to_gemini_format([CALC_TOOL, CURRENCY_TOOL])
    print(f"Gemini format (first tool): {json.dumps(gemini_tools[0], indent=2)}")
    
    # Test convert_tools_for_provider
    models = ["gpt-4o", "claude-3-7-sonnet-latest", "gemini-2.0-flash", "grok-2"]
    for model in models:
        from magi.utils.model_provider import MODEL_TO_PROVIDER
        provider = MODEL_TO_PROVIDER.get(model, "openai")
        tools = convert_tools_for_provider([CALC_TOOL, CURRENCY_TOOL], provider, model)
        
        # Handle FunctionTool objects specially (for OpenAI/X.AI providers)
        if provider in ["openai", "xai"]:
            print(f"Tools for {model}: (FunctionTool objects are passed directly)")
        else:
            print(f"Tools for {model}: {json.dumps(tools[0], indent=2)} (showing first tool only)")

async def main():
    """Main entry point for testing."""
    print("=== MAGI Tool Testing Utility ===")
    
    # Initialize the provider setup
    setup_retry_and_fallback_provider()
    
    # Test tool conversion
    await test_tool_conversion()
    
    # Test each provider
    await test_claude_tools()
    await test_gemini_tools()
    await test_grok_tools()
    
    print("\nTesting complete.")

if __name__ == "__main__":
    asyncio.run(main())