#!/usr/bin/env python3
"""
Test script for verifying tool calls across different model providers.
This allows testing that each model can properly use function calling capabilities.
"""

import os
import asyncio
import sys
import logging
import json
from typing import Dict, List, Any, Optional
import traceback

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from magi.utils.model_provider import (
    call_claude_directly,
    call_gemini_directly,
    call_grok_directly
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Define a simple calculator tool in OpenAI format
CALCULATOR_TOOL = {
    "type": "function",
    "function": {
        "name": "calculator",
        "description": "Perform basic arithmetic calculations",
        "parameters": {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["add", "subtract", "multiply", "divide"],
                    "description": "The arithmetic operation to perform"
                },
                "a": {
                    "type": "number",
                    "description": "The first operand"
                },
                "b": {
                    "type": "number",
                    "description": "The second operand"
                }
            },
            "required": ["operation", "a", "b"]
        }
    }
}

# Define Claude-specific version of the calculator tool
CLAUDE_CALCULATOR_TOOL = {
    "type": "custom",
    "custom": {
        "name": "calculator",
        "description": "Perform basic arithmetic calculations",
        "parameters": {
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["add", "subtract", "multiply", "divide"],
                    "description": "The arithmetic operation to perform"
                },
                "a": {
                    "type": "number",
                    "description": "The first operand"
                },
                "b": {
                    "type": "number",
                    "description": "The second operand"
                }
            },
            "required": ["operation", "a", "b"]
        }
    }
}

async def test_claude(model_name: str, use_claude_specific_format: bool = False):
    """Test Claude's tool calling capabilities."""
    logger.info(f"Testing Claude model: {model_name}")
    
    system_message = "You are a helpful assistant that can perform calculations using tools."
    user_message = "Calculate 24 + 18"
    
    tools = [CLAUDE_CALCULATOR_TOOL] if use_claude_specific_format else [CALCULATOR_TOOL]
    
    try:
        response = await call_claude_directly(
            model_name=model_name,
            system_message=system_message,
            user_message=user_message,
            tools=tools
        )
        
        # Check if tool_calls exists
        if hasattr(response.choices[0].message, 'tool_calls') and response.choices[0].message.tool_calls:
            tool_calls = response.choices[0].message.tool_calls
            logger.info(f"Claude tool calls found: {json.dumps(tool_calls, indent=2)}")
            
            # Extract function call details
            for tool_call in tool_calls:
                if tool_call.get('type') == 'function':
                    function_name = tool_call['function']['name']
                    arguments = tool_call['function']['arguments']
                    logger.info(f"Function called: {function_name}")
                    logger.info(f"Arguments: {arguments}")
                    
                    # Execute the function (simplified implementation)
                    if function_name == 'calculator':
                        args = json.loads(arguments)
                        operation = args['operation']
                        a, b = args['a'], args['b']
                        
                        result = None
                        if operation == 'add':
                            result = a + b
                        elif operation == 'subtract':
                            result = a - b
                        elif operation == 'multiply':
                            result = a * b
                        elif operation == 'divide':
                            result = a / b
                            
                        logger.info(f"Calculation result: {result}")
        else:
            logger.info(f"Claude did not use the tool. Text response: {response.choices[0].message.content}")
    
    except Exception as e:
        logger.error(f"Error testing Claude model {model_name}: {str(e)}")

async def test_gemini(model_name: str):
    """Test Gemini's tool calling capabilities."""
    logger.info(f"Testing Gemini model: {model_name}")
    
    system_message = "You are a helpful assistant that can perform calculations using tools."
    user_message = "Calculate 24 + 18"
    
    try:
        response = await call_gemini_directly(
            model_name=model_name,
            system_message=system_message,
            user_message=user_message,
            tools=[CALCULATOR_TOOL]
        )
        
        # Check if tool_calls exists
        if hasattr(response.choices[0].message, 'tool_calls') and response.choices[0].message.tool_calls:
            tool_calls = response.choices[0].message.tool_calls
            
            # Create safely serializable data from the tool calls
            safe_tool_calls = []
            
            for tool_call in tool_calls:
                try:
                    # Safe extraction
                    tool_id = None
                    if hasattr(tool_call, 'id'):
                        tool_id = tool_call.id
                    elif isinstance(tool_call, dict) and 'id' in tool_call:
                        tool_id = tool_call['id']
                    else:
                        tool_id = f"call_{len(safe_tool_calls)}"
                    
                    # Get function info
                    function_info = {}
                    function_name = ""
                    function_args = "{}"
                    
                    if hasattr(tool_call, 'function'):
                        function_obj = tool_call.function
                        if hasattr(function_obj, 'name'):
                            function_name = function_obj.name
                        if hasattr(function_obj, 'arguments') or hasattr(function_obj, 'args'):
                            function_args = getattr(function_obj, 'arguments', 
                                            getattr(function_obj, 'args', "{}"))
                    elif isinstance(tool_call, dict) and 'function' in tool_call:
                        function_obj = tool_call['function']
                        function_name = function_obj.get('name', '')
                        function_args = function_obj.get('arguments', 
                                    function_obj.get('args', '{}'))
                    
                    # Add to our safe list
                    safe_tool_calls.append({
                        "id": tool_id,
                        "type": "function",
                        "function": {
                            "name": function_name,
                            "arguments": function_args
                        }
                    })
                    
                    logger.info(f"Found Gemini function: {function_name}")
                    
                    # Process the function arguments
                    if function_name == 'calculator':
                        try:
                            # Parse arguments
                            args = None
                            if isinstance(function_args, str):
                                args = json.loads(function_args)
                            elif isinstance(function_args, dict):
                                args = function_args
                                
                            # Execute function
                            if args:
                                operation = args['operation']
                                a, b = args['a'], args['b']
                                
                                result = None
                                if operation == 'add':
                                    result = a + b
                                elif operation == 'subtract':
                                    result = a - b
                                elif operation == 'multiply':
                                    result = a * b
                                elif operation == 'divide':
                                    result = a / b
                                    
                                logger.info(f"Calculation result: {result}")
                        except Exception as func_err:
                            logger.error(f"Error processing calculator function: {str(func_err)}")
                    
                except Exception as tool_err:
                    logger.error(f"Error processing tool call: {str(tool_err)}")
            
            # Log tool call data without JSON serialization
            if safe_tool_calls:
                logger.info("Gemini tool calls detected:")
                for i, call in enumerate(safe_tool_calls):
                    logger.info(f"Tool call {i+1}:")
                    logger.info(f"  ID: {call.get('id', 'unknown')}")
                    logger.info(f"  Type: {call.get('type', 'unknown')}")
                    logger.info(f"  Function name: {call.get('function', {}).get('name', 'unknown')}")
                    logger.info(f"  Arguments: {call.get('function', {}).get('arguments', 'unknown')}")
        else:
            # Gemini didn't use tools - get the text response if available
            text_content = ""
            try:
                if hasattr(response.choices[0].message, 'content'):
                    text_content = response.choices[0].message.content
                elif hasattr(response, 'text'):
                    text_content = response.text
            except Exception:
                text_content = "Could not extract text content"
                
            logger.info(f"Gemini did not use the tool. Text response: {text_content}")
    
    except Exception as e:
        logger.error(f"Error testing Gemini model {model_name}: {str(e)}")
        logger.error(traceback.format_exc())

async def test_grok(model_name: str):
    """Test Grok's tool calling capabilities."""
    logger.info(f"Testing Grok model: {model_name}")
    
    system_message = "You are a helpful assistant that can perform calculations using tools."
    user_message = "Calculate 24 + 18"
    
    try:
        response = await call_grok_directly(
            model_name=model_name,
            system_message=system_message,
            user_message=user_message,
            tools=[CALCULATOR_TOOL]
        )
        
        # Check if tool_calls exists
        if hasattr(response.choices[0].message, 'tool_calls') and response.choices[0].message.tool_calls:
            tool_calls = response.choices[0].message.tool_calls
            logger.info(f"Grok tool calls found: {json.dumps(tool_calls, indent=2)}")
            
            # Extract function call details
            for tool_call in tool_calls:
                if tool_call.get('type') == 'function':
                    function_name = tool_call['function']['name']
                    arguments = tool_call['function']['arguments']
                    logger.info(f"Function called: {function_name}")
                    logger.info(f"Arguments: {arguments}")
                    
                    # Execute the function (simplified implementation)
                    if function_name == 'calculator':
                        args = json.loads(arguments)
                        operation = args['operation']
                        a, b = args['a'], args['b']
                        
                        result = None
                        if operation == 'add':
                            result = a + b
                        elif operation == 'subtract':
                            result = a - b
                        elif operation == 'multiply':
                            result = a * b
                        elif operation == 'divide':
                            result = a / b
                            
                        logger.info(f"Calculation result: {result}")
        else:
            logger.info(f"Grok did not use the tool. Text response: {response.choices[0].message.content}")
    
    except Exception as e:
        logger.error(f"Error testing Grok model {model_name}: {str(e)}")

async def test_model_with_tools(model_name: str):
    """Test a model with tools based on its provider."""
    provider = None
    
    # Determine provider based on model name
    if "claude" in model_name:
        provider = "anthropic"
    elif "gemini" in model_name:
        provider = "google"
    elif "grok" in model_name:
        provider = "xai"
    else:
        logger.error(f"Unknown provider for model: {model_name}")
        return
    
    if provider == "anthropic":
        # Test with standard format first
        logger.info(f"Testing {model_name} with standard OpenAI tool format")
        await test_claude(model_name, use_claude_specific_format=False)
        
        # Then test with Claude-specific format
        logger.info(f"Testing {model_name} with Claude-specific tool format")
        await test_claude(model_name, use_claude_specific_format=True)
    elif provider == "google":
        await test_gemini(model_name)
    elif provider == "xai":
        await test_grok(model_name)

async def main():
    """Main entry point to test tool calling on different models."""
    
    # Get the model name from arguments or use a default
    if len(sys.argv) > 1:
        model_name = sys.argv[1]
    else:
        # Default test models
        test_models = [
            "claude-3-5-haiku-latest",  # Anthropic
            "gemini-2.0-flash",         # Google
            "grok-2"                    # X.AI
        ]
        
        for model in test_models:
            logger.info(f"==== Testing model: {model} ====")
            await test_model_with_tools(model)
            logger.info(f"==== Finished testing: {model} ====\n")
        
        return
    
    # Test single specified model
    await test_model_with_tools(model_name)

if __name__ == "__main__":
    asyncio.run(main())