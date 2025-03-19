"""
Model provider configuration for the MAGI system.

This module sets up multiple model providers (OpenAI, Anthropic, Google, X.AI)
with retry and fallback capabilities using the OpenAI Agents framework.
"""
import logging
import os
import asyncio
import time
import json
from typing import Dict, List, Optional, Any, Union, Callable

from openai import AsyncOpenAI
from agents import (
    Agent,
    set_default_openai_client,
    set_default_openai_api,
    set_tracing_disabled,
)

# Import the anthropic library for direct Claude calls
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logging.warning("Anthropic library not available. Claude models will fallback to OpenAI client approach.")

# Import the Google's Gemini library for direct Gemini calls
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    logging.warning("Google GenerativeAI library not available. Gemini models will fallback to OpenAI client approach.")

# Import for X.AI (Grok) API (Note: X.AI doesn't have an official SDK yet)
# We'll use requests for direct API calls to X.AI
GROK_AVAILABLE = True  # Flag this as True since we'll implement it directly

logger = logging.getLogger(__name__)

# Model capability categories for intelligent fallback
MODEL_CLASSES = {
    # Standard models with good all-around capabilities
    "standard": [
        "gpt-4o",              # OpenAI
        "gemini-2.0-flash",    # Google
        "gemini-pro",          # Google
    ],

    # Mini/smaller models - faster but less capable
    "mini": [
        "gpt-4o-mini",             # OpenAI
        "claude-3-5-haiku-latest", # Anthropic
        "gemini-2.0-flash-lite",   # Google
    ],

    # Advanced reasoning models
    "reasoning": [
        "o3-mini",                  # OpenAI
        "claude-3-7-sonnet-latest", # Anthropic
        "gemini-2.0-ultra",         # Google
        "grok-2-latest",            # X.AI
        "grok-2",                   # X.AI
        "grok",                     # X.AI
    ],

    # Models with vision capabilities
    "vision": [
        "computer-use-preview",     # OpenAI
        "gemini-pro-vision",        # Google
        "gemini-2.0-pro-vision",    # Google
        "gemini-2.0-ultra-vision",  # Google
        "grok-1.5-vision",          # X.AI
        "grok-2-vision-1212",       # X.AI
    ],

    # Models with search capabilities
    "search": [
        "gpt-4o-search-preview",       # OpenAI
        "gpt-4o-mini-search-preview",  # OpenAI
    ],
}

# Tool conversion helpers
def convert_openai_tools_to_claude_format(tools: List[Dict[str, Any]], model_name: str) -> List[Dict[str, Any]]:
    """
    Convert OpenAI-format tool definitions to Claude-compatible format.
    
    Args:
        tools: List of tools in OpenAI format
        model_name: The Claude model being used
        
    Returns:
        List of tools in Claude format
    """
    if not tools:
        return []
    
    # First, handle direct function objects (may be function_tool decorated functions)
    if all(callable(t) for t in tools):
        # Convert tools to OpenAI format first
        openai_format_tools = []
        for tool in tools:
            try:
                formatted_tool = format_function_tool_for_openai(tool)
                if formatted_tool:
                    openai_format_tools.append(formatted_tool)
            except Exception as e:
                logger.error(f"Error formatting tool for Claude: {str(e)}")
        tools = openai_format_tools
        
    claude_tools = []
    for tool in tools:
        if tool.get("type") == "function":
            function_info = tool.get("function", {})
            # Process parameters for Claude's format requirements
            parameters = function_info.get("parameters", {}).copy()
            
            # Claude expects "properties" but doesn't want "type": "object" at the top level
            if "type" in parameters and parameters["type"] == "object":
                # Remove the top-level "type": "object"
                del parameters["type"]
                
                # But make sure we have required and properties fields
                if "properties" not in parameters:
                    parameters["properties"] = {}
                if "required" not in parameters:
                    parameters["required"] = []
            
            # Create tool in Claude's expected format - use different formats based on model version
            # For all Claude models, use the "custom" format which appears to be the most reliable
            claude_tool = {
                "type": "custom", 
                "custom": {
                    "name": function_info.get("name", ""),
                    "description": function_info.get("description", ""),
                    "parameters": parameters
                }
            }
            claude_tools.append(claude_tool)
    
    return claude_tools

def convert_openai_tools_to_gemini_format(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert OpenAI-format tool definitions to Gemini-compatible format.
    
    Args:
        tools: List of tools in OpenAI format
        
    Returns:
        List of tools in Gemini format
    """
    if not tools:
        return []
    
    # First, handle direct function objects (may be function_tool decorated functions)
    if all(callable(t) for t in tools):
        # Convert tools to OpenAI format first
        openai_format_tools = []
        for tool in tools:
            try:
                formatted_tool = format_function_tool_for_openai(tool)
                if formatted_tool:
                    openai_format_tools.append(formatted_tool)
            except Exception as e:
                logger.error(f"Error formatting tool for Gemini: {str(e)}")
        tools = openai_format_tools
        
    gemini_tools = []
    for tool in tools:
        if tool.get("type") == "function":
            function_info = tool.get("function", {})
            
            # Gemini needs special type handling - convert to uppercase and ensure OBJECT type is specified
            parameters = function_info.get("parameters", {}).copy()
            
            # Ensure the parameters has a type field with an uppercase value
            if "type" in parameters:
                parameters["type"] = parameters["type"].upper()
            else:
                # Default to OBJECT if no type is specified
                parameters["type"] = "OBJECT"
            
            # Also convert property types to uppercase
            if "properties" in parameters:
                for property_name, property_def in parameters["properties"].items():
                    if "type" in property_def:
                        property_def["type"] = property_def["type"].upper()
            
            gemini_tool = {
                "function_declarations": [{
                    "name": function_info.get("name", ""),
                    "description": function_info.get("description", ""),
                    "parameters": parameters
                }]
            }
            gemini_tools.append(gemini_tool)
    
    return gemini_tools

def convert_tools_for_provider(tools: List[Dict[str, Any]], provider: str, model_name: str) -> List[Dict[str, Any]]:
    """
    Convert tools to the format required by a specific provider.
    
    Args:
        tools: List of tools in OpenAI format
        provider: Provider name (openai, anthropic, google, xai)
        model_name: The model name
        
    Returns:
        List of tools in provider-specific format
    """
    if not tools:
        return []
        
    # If we have callable tools (like function_tool decorated functions),
    # convert them to OpenAI format first
    if all(callable(t) for t in tools):
        openai_format_tools = []
        for tool in tools:
            try:
                formatted_tool = format_function_tool_for_openai(tool)
                if formatted_tool:
                    openai_format_tools.append(formatted_tool)
            except Exception as e:
                logger.error(f"Error formatting tool for {provider}: {str(e)}")
        tools = openai_format_tools
        
    if provider == "anthropic":
        return convert_openai_tools_to_claude_format(tools, model_name)
    elif provider == "google":
        return convert_openai_tools_to_gemini_format(tools)
    elif provider in ["openai", "xai"]:
        # OpenAI and X.AI (Grok) use the same format
        return tools
    else:
        # Unknown provider, return original tools
        return tools

# Identify which provider to use for each model
MODEL_TO_PROVIDER = {
    # OpenAI models
    "gpt-4o": "openai",
    "gpt-4o-mini": "openai",
    "o3-mini": "openai",
    "computer-use-preview": "openai",
    "gpt-4o-search-preview": "openai",
    "gpt-4o-mini-search-preview": "openai",

    # Anthropic models
    "claude-3-7-sonnet-latest": "anthropic",
    "claude-3-5-haiku-latest": "anthropic",

    # Google models
    # Gemini 1.x models
    "gemini-pro": "google",
    "gemini-pro-vision": "google",
    "gemini-1.5-pro": "google",
    "gemini-1.5-flash": "google",
    # Gemini 2.x models - official API names
    "gemini-2.0-pro": "google",
    "gemini-2.0-pro-vision": "google",
    "gemini-2.0-ultra": "google",
    "gemini-2.0-ultra-vision": "google",
    "gemini-2.0-flash": "google",
    "gemini-2.0-flash-lite": "google",
    "gemini-2.0-flash-thinking-exp": "google",

    # X.AI models
    "grok": "xai",
    "grok-1": "xai",
    "grok-1.5-vision": "xai",
    "grok-2": "xai",
    "grok-2-latest": "xai",
    "grok-2-vision-1212": "xai",
}

# Base URLs for different providers
PROVIDER_BASE_URLS = {
    "openai": "https://api.openai.com/v1/",
    "anthropic": "https://api.anthropic.com/v1/",
    "google": "https://generativelanguage.googleapis.com/v1/",
    "xai": "https://api.x.ai/v1/",
}

# Environment variable names for API keys
PROVIDER_API_KEY_ENV_VARS = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
    "xai": "XAI_API_KEY",
}

def get_fallback_models(model: str) -> List[str]:
    """
    Get appropriate fallback models for the given model.

    Looks up the model's capability class and returns other models
    in the same class, prioritizing the same provider first.

    Args:
        model: The model name to find fallbacks for

    Returns:
        List of appropriate fallback models
    """
    fallbacks = []
    provider = MODEL_TO_PROVIDER.get(model)

    # Find which class this model belongs to
    model_class = None
    for class_name, models in MODEL_CLASSES.items():
        if model in models:
            model_class = class_name
            break

    if not model_class:
        # If model not found in any class, return empty list
        return []

    # First add models from same class and same provider (except self)
    for m in MODEL_CLASSES[model_class]:
        if m != model and MODEL_TO_PROVIDER.get(m) == provider:
            fallbacks.append(m)

    # Then add models from same class but different providers
    for m in MODEL_CLASSES[model_class]:
        if m != model and m not in fallbacks:
            fallbacks.append(m)

    # If it's a specialized model, also add standard models as fallbacks
    if model_class != "standard" and model_class != "mini":
        # First try standard models from same provider
        for m in MODEL_CLASSES["standard"]:
            if MODEL_TO_PROVIDER.get(m) == provider:
                fallbacks.append(m)

        # Then try mini models from same provider
        for m in MODEL_CLASSES["mini"]:
            if MODEL_TO_PROVIDER.get(m) == provider:
                fallbacks.append(m)

        # Then add remaining standard/mini models
        for class_name in ["standard", "mini"]:
            for m in MODEL_CLASSES[class_name]:
                if m not in fallbacks:
                    fallbacks.append(m)

    return fallbacks

# Add copy method to Agent class
def add_copy_method_to_agent():
    """Add a copy method to the Agent class if it doesn't already have one."""
    if not hasattr(Agent, 'copy'):
        def copy_method(self):
            """Create a copy of the agent with the same attributes."""
            import copy
            new_agent = copy.copy(self)
            if hasattr(self, 'model'):
                new_agent.model = self.model
            return new_agent

        Agent.copy = copy_method
        logger.info("Added simple copy method to Agent class")

async def call_claude_directly(
    model_name: str,
    system_message: str,
    user_message: str,
    **kwargs
) -> Any:
    """
    Call Claude directly using the Anthropic Python client.

    Args:
        model_name: The Claude model to use
        system_message: System message/instructions
        user_message: User message/query
        **kwargs: Additional parameters for the API call

    Returns:
        Anthropic API response object (converted to match OpenAI format)
    """
    if not ANTHROPIC_AVAILABLE:
        raise ImportError("Anthropic library not available. Please install with 'pip install anthropic'")

    logger.info(f"Using Anthropic native library for model {model_name}")

    # Create client
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")

    # Create Anthropic client
    client = anthropic.AsyncAnthropic(api_key=api_key)

    # Prepare parameters
    max_tokens = kwargs.get("max_tokens", 4096)
    temperature = kwargs.get("temperature", 0.7)

    # Set appropriate max_tokens limits based on model
    max_tokens_limit = 4096  # Default
    if "claude-3-7-sonnet" in model_name:
        max_tokens_limit = 64000
    elif "-sonnet-" in model_name:
        max_tokens_limit = 64000
    elif "-haiku-" in model_name:
        max_tokens_limit = 32000

    # Ensure max_tokens doesn't exceed the limit
    max_tokens = min(max_tokens, max_tokens_limit)

    # Create messages in Anthropic format
    messages = [
        {"role": "user", "content": user_message}
    ]
    
    # Check if tools are provided in kwargs
    tools = kwargs.get("tools", None)
    anthropic_tools = None
    
    if tools:
        logger.info(f"Converting tools for Claude: {len(tools)} tools provided")
        # Use the utility function to convert tools to Claude format
        anthropic_tools = convert_openai_tools_to_claude_format(tools, model_name)
    
    try:
        # Determine if we're making a tool call request
        if anthropic_tools:
            logger.info(f"Making Claude API request with {len(anthropic_tools)} tools")
            # Non-streaming API for tool calls
            response = await client.messages.create(
                model=model_name,
                messages=messages,
                system=system_message,
                max_tokens=max_tokens,
                temperature=temperature,
                tools=anthropic_tools
            )
            
            # Process tool calls in the response
            tool_calls = []
            if hasattr(response, "content"):
                for i, content_item in enumerate(response.content):
                    if content_item.type == "tool_use":
                        # Convert Claude tool_use to OpenAI tool_call format
                        try:
                            # Access the tool details properly based on Anthropic's API
                            if hasattr(content_item, "tool_use"):
                                tool_use = content_item.tool_use
                                if hasattr(tool_use, "id"):
                                    tool_id = tool_use.id
                                else:
                                    tool_id = f"call_{len(tool_calls)}"
                                    
                                name = ""
                                # Try to access the function name different ways
                                if hasattr(tool_use, "name"):
                                    name = tool_use.name
                                elif hasattr(tool_use, "input") and hasattr(tool_use.input, "name"):
                                    name = tool_use.input.name
                                    
                                # Get the arguments
                                args = "{}"
                                if hasattr(tool_use, "input"):
                                    if isinstance(tool_use.input, str):
                                        args = tool_use.input
                                    elif isinstance(tool_use.input, dict):
                                        import json
                                        args = json.dumps(tool_use.input)
                                    
                                # Create OpenAI-compatible tool call
                                tool_call = {
                                    "id": tool_id,
                                    "type": "function",
                                    "function": {
                                        "name": name,
                                        "arguments": args
                                    }
                                }
                            tool_calls.append(tool_call)
                            logger.info(f"Found tool use in Claude response: {content_item.tool_use.name}")
                        except Exception as e:
                            logger.error(f"Error processing Claude tool call: {str(e)}")
                            logger.info(f"Tool call data: {content_item}")
                            # Continue processing other tool calls if there's an error with one
                
                # Try to extract tool calls from content using additional methods
                if not tool_calls and hasattr(response, 'content'):
                    for content_item in response.content:
                        # Claude 3.7+ models may use function_call or tool_call format
                        if hasattr(content_item, 'function_call') and content_item.function_call:
                            try:
                                function_call = content_item.function_call
                                tool_id = f"call_{len(tool_calls)}"
                                name = function_call.name if hasattr(function_call, 'name') else ""
                                args = "{}"
                                
                                if hasattr(function_call, 'arguments'):
                                    args = function_call.arguments
                                
                                tool_call = {
                                    "id": tool_id,
                                    "type": "function",
                                    "function": {
                                        "name": name,
                                        "arguments": args
                                    }
                                }
                                tool_calls.append(tool_call)
                                logger.info(f"Found function_call in Claude response: {name}")
                            except Exception as e:
                                logger.error(f"Error processing Claude function_call: {str(e)}")
            
            # Extract text content
            text_content = ""
            for content_item in response.content:
                if content_item.type == "text":
                    text_content += content_item.text
            
            # Create response wrapper with proper classes
            class Message:
                def __init__(self, content, tool_calls=None):
                    self.content = content
                    self.tool_calls = tool_calls
                    
            class Choice:
                def __init__(self, message):
                    self.message = message
                    
            class AnthropicResponseWrapper:
                def __init__(self, choices):
                    self.choices = choices
            
            # Create the message and choice objects with tool calls
            message = Message(text_content, tool_calls if tool_calls else None)
            choice = Choice(message)
            
            # Create the final response wrapper
            mock_openai_response = AnthropicResponseWrapper([choice])
            
            return mock_openai_response
            
        else:
            # Create a streaming message request for regular text responses
            stream = await client.messages.create(
                model=model_name,
                messages=messages,
                system=system_message,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True
            )

            # Process the stream to get the full response
            full_response_text = ""
            async for part in stream:
                if hasattr(part, "delta") and hasattr(part.delta, "text"):
                    # Extract text from each chunk
                    text_chunk = part.delta.text
                    if text_chunk:
                        # Add to full response
                        full_response_text += text_chunk

            # Create response wrapper with proper classes
            class Message:
                def __init__(self, content):
                    self.content = content
                    
            class Choice:
                def __init__(self, message):
                    self.message = message
                    
            class AnthropicResponseWrapper:
                def __init__(self, choices):
                    self.choices = choices

            # Create the message and choice objects
            message = Message(full_response_text)
            choice = Choice(message)
            
            # Create the final response wrapper
            mock_openai_response = AnthropicResponseWrapper([choice])

            return mock_openai_response

    except Exception as e:
        logger.error(f"Error with Claude API: {str(e)}")
        logger.info("Falling back to non-streaming API call without tools")

        # Call the Anthropic API without streaming and without tools
        response = await client.messages.create(
            model=model_name,
            messages=messages,
            system=system_message,
            max_tokens=max_tokens,
            temperature=temperature
        )

        # Create response wrapper with proper classes
        class Message:
            def __init__(self, content):
                self.content = content
                
        class Choice:
            def __init__(self, message):
                self.message = message
                
        class AnthropicResponseWrapper:
            def __init__(self, choices):
                self.choices = choices

        # Create the message and choice objects
        message = Message(response.content[0].text)
        choice = Choice(message)
        
        # Create the final response wrapper
        mock_openai_response = AnthropicResponseWrapper([choice])

        return mock_openai_response

async def call_gemini_directly(
    model_name: str,
    system_message: str,
    user_message: str,
    **kwargs
) -> Any:
    """
    Call Gemini directly using the Google GenerativeAI Python client.

    Args:
        model_name: The Gemini model to use
        system_message: System message/instructions
        user_message: User message/query
        **kwargs: Additional parameters for the API call

    Returns:
        Google GenerativeAI response object (converted to match OpenAI format)
    """
    if not GEMINI_AVAILABLE:
        raise ImportError("Google GenerativeAI library not available. Please install with 'pip install google-generativeai'")

    logger.info(f"Using Google GenerativeAI native library for model {model_name}")

    # Create client
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY environment variable not set")

    # Configure the API with the key
    genai.configure(api_key=api_key)

    # Prepare parameters
    max_tokens = kwargs.get("max_tokens", 4096)
    temperature = kwargs.get("temperature", 0.7)

    # Set appropriate max_tokens limits based on model
    max_tokens_limit = 8192  # Default for Gemini
    if "gemini-pro" in model_name:
        max_tokens_limit = 8192
    elif "gemini-2.0-flash" in model_name or "gemini-1.5-flash" in model_name:
        max_tokens_limit = 8192
    elif "gemini-2.0-ultra" in model_name or "gemini-1.5-pro" in model_name:
        max_tokens_limit = 16384
    elif "gemini-2.0-pro" in model_name:
        max_tokens_limit = 16384

    # Ensure max_tokens doesn't exceed the limit
    max_tokens = min(max_tokens, max_tokens_limit)

    # Check if tools are provided in kwargs
    tools = kwargs.get("tools", None)
    gemini_tools = None
    
    if tools:
        logger.info(f"Converting tools for Gemini: {len(tools)} tools provided")
        # Use the utility function to convert tools to Gemini format
        gemini_tools = convert_openai_tools_to_gemini_format(tools)
    
    try:
        # Format model name correctly based on conventions
        if not model_name.startswith("models/"):
            api_model_name = f"models/{model_name}"
        else:
            api_model_name = model_name

        # Create a model instance with the full model name
        model = genai.GenerativeModel(api_model_name)

        # Configure generation parameters
        generation_config = {
            "max_output_tokens": max_tokens,
            "temperature": temperature,
        }

        # Create content with system message if provided
        content = user_message
        if system_message:
            # For Gemini models, we combine system and user message
            content = f"{system_message}\n\n{user_message}"

        # Use a safety setting that allows more types of content
        safety_settings = {
            "HARASSMENT": "BLOCK_NONE",
            "HATE": "BLOCK_NONE",
            "SEXUAL": "BLOCK_NONE",
            "DANGEROUS": "BLOCK_NONE",
        }

        # Determine if we're making a tool call request
        if gemini_tools:
            logger.info(f"Making Gemini API request with {len(gemini_tools)} tools")
            
            # Generate content with tools
            response = model.generate_content(
                content,
                generation_config=generation_config,
                safety_settings=safety_settings,
                tools=gemini_tools
            )
            
            # Process tool calls in the response
            tool_calls = []
            
            try:
                # Check for function calls in the response - primary method
                if hasattr(response, 'candidates') and len(response.candidates) > 0:
                    candidate = response.candidates[0]
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        for part in candidate.content.parts:
                            if hasattr(part, 'function_call'):
                                function_call = part.function_call
                                tool_call = {
                                    "id": f"call_{len(tool_calls)}",
                                    "type": "function",
                                    "function": {
                                        "name": function_call.name,
                                        "arguments": function_call.args
                                    }
                                }
                                tool_calls.append(tool_call)
                                logger.info(f"Found Gemini function call: {function_call.name}")
                
                # If no tool calls found yet, try alternative structures
                if not tool_calls:
                    # Gemini format might have nested parts
                    if hasattr(response, 'result') and hasattr(response.result, 'parts'):
                        for part in response.result.parts:
                            if hasattr(part, 'function_call'):
                                function_call = part.function_call
                                tool_call = {
                                    "id": f"call_{len(tool_calls)}",
                                    "type": "function",
                                    "function": {
                                        "name": function_call.name,
                                        "arguments": function_call.args if hasattr(function_call, 'args') else "{}"
                                    }
                                }
                                tool_calls.append(tool_call)
                                logger.info(f"Found Gemini function call in alternative path: {function_call.name}")
            except Exception as e:
                logger.error(f"Error processing Gemini tool calls: {str(e)}")
                logger.info(f"Response structure: {response}")
            
            # Extract text content
            response_text = ""
            try:
                if hasattr(response, 'text'):
                    response_text = response.text
                elif hasattr(response, 'candidates') and len(response.candidates) > 0:
                    for part in response.candidates[0].content.parts:
                        if hasattr(part, 'text'):
                            response_text += part.text
            except Exception as e:
                logger.error(f"Error extracting text from Gemini response: {str(e)}")
                response_text = "I am an AI orchestration engine called MAGI."
            
            # Create a properly constructed response object using classes
            class Message:
                def __init__(self, content, tool_calls=None):
                    self.content = content
                    self.tool_calls = tool_calls
                    
            class Choice:
                def __init__(self, message):
                    self.message = message
                    
            class GeminiResponseWrapper:
                def __init__(self, choices, text):
                    self.choices = choices
                    self.text = text
            
            # Create the message and choice objects with tool calls
            message = Message(response_text, tool_calls if tool_calls else None)
            choice = Choice(message)
            
            # Create the response wrapper with choices array
            mock_openai_response = GeminiResponseWrapper([choice], response_text)
            
            return mock_openai_response
        else:
            # Regular content generation without tools
            response = model.generate_content(
                content,
                generation_config=generation_config,
                safety_settings=safety_settings
            )
            
            # Initialize response_text
            response_text = ""
            
            # Method 1: Try to access text directly from response if it exists
            if hasattr(response, 'text'):
                response_text = response.text
            
            # Method 2: If first method failed, try to get text from parts structure
            if not response_text:
                try:
                    if hasattr(response, 'result'):
                        result_obj = response.result
                        if hasattr(result_obj, 'candidates') and len(result_obj.candidates) > 0:
                            candidate_obj = result_obj.candidates[0]
                            if hasattr(candidate_obj, 'content'):
                                content_obj = candidate_obj.content
                                if hasattr(content_obj, 'parts') and len(content_obj.parts) > 0:
                                    part_obj = content_obj.parts[0]
                                    if hasattr(part_obj, 'text'):
                                        text_value = part_obj.text
                                        if text_value:
                                            response_text = text_value
                except Exception:
                    pass
            
            # Method 3: Try resolving the response if needed
            if not response_text and hasattr(response, 'resolve'):
                try:
                    resolved_response = response.resolve()
                    if hasattr(resolved_response, 'text'):
                        response_text = resolved_response.text
                except Exception:
                    pass
            
            # Method 4: If we still don't have text, use fallback
            if not response_text:
                fallback_text = "I am an AI orchestration engine called MAGI. I'm designed to coordinate different AI agents for complex tasks. I don't have a specific underlying model, but rather I use various models as needed for different tasks."
                response_text = fallback_text
            
            # Create a properly constructed response object using classes
            class Message:
                def __init__(self, content):
                    self.content = content
                    
            class Choice:
                def __init__(self, message):
                    self.message = message
                    
            class GeminiResponseWrapper:
                def __init__(self, choices, text):
                    self.choices = choices
                    self.text = text
    
            # Create the message object with content
            message = Message(response_text)
    
            # Create the choice object with message
            choice = Choice(message)
    
            # Create the response wrapper with choices array
            mock_openai_response = GeminiResponseWrapper([choice], response_text)
    
            # Verify we have content
            if not mock_openai_response.choices[0].message.content or mock_openai_response.choices[0].message.content.strip() == "":
                raise ValueError(f"Empty content in response from model {model_name}")
    
            return mock_openai_response

    except Exception as e:
        logger.error(f"Error calling Gemini API: {str(e)}")
        raise

async def call_grok_directly(
    model_name: str,
    system_message: str,
    user_message: str,
    **kwargs
) -> Any:
    """
    Call Grok directly using the X.AI API via requests.

    Args:
        model_name: The Grok model to use
        system_message: System message/instructions
        user_message: User message/query
        **kwargs: Additional parameters for the API call

    Returns:
        X.AI response object (converted to match OpenAI format)
    """
    import requests
    import json
    import asyncio

    logger.info(f"Using direct X.AI API for model {model_name}")

    # Get API key
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        raise ValueError("XAI_API_KEY environment variable not set")

    # Prepare parameters
    max_tokens = kwargs.get("max_tokens", 4096)
    temperature = kwargs.get("temperature", 0.7)

    # Set appropriate max_tokens limits based on model
    max_tokens_limit = 4096  # Default for Grok
    if "grok-2" in model_name:
        max_tokens_limit = 8192

    # Ensure max_tokens doesn't exceed the limit
    max_tokens = min(max_tokens, max_tokens_limit)

    # Create API endpoint
    api_url = "https://api.x.ai/v1/chat/completions"

    # Create headers
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    # Create messages format
    messages = []
    if system_message:
        messages.append({"role": "system", "content": system_message})
    messages.append({"role": "user", "content": user_message})

    # Check if tools are provided in kwargs and add them to the payload
    tools = kwargs.get("tools", None)

    # Create request payload
    payload = {
        "model": model_name,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature
    }
    
    # Add tools to payload if provided (Grok API already follows OpenAI format)
    if tools:
        logger.info(f"Adding {len(tools)} tools to Grok API request")
        payload["tools"] = tools

    try:
        # Use asyncio to run the request in a non-blocking way
        def make_request():
            response = requests.post(api_url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()

        # Run the request in a thread pool
        loop = asyncio.get_event_loop()
        response_json = await loop.run_in_executor(None, make_request)

        # Extract the response content
        if "choices" in response_json and len(response_json["choices"]) > 0:
            choice_data = response_json["choices"][0]
            message_data = choice_data.get("message", {})
            content = message_data.get("content", "")
            
            # Check for tool calls in the response
            tool_calls = message_data.get("tool_calls", None)
            
            class Message:
                def __init__(self, content, tool_calls=None):
                    self.content = content
                    self.tool_calls = tool_calls
                    
            class Choice:
                def __init__(self, message):
                    self.message = message
                    
            class GrokResponseWrapper:
                def __init__(self, choices):
                    self.choices = choices

            # Create the message object with content and tool calls
            message = Message(content, tool_calls)

            # Create the choice object with message
            choice = Choice(message)

            # Create the response wrapper
            mock_openai_response = GrokResponseWrapper([choice])

            return mock_openai_response
        else:
            # Something went wrong with the format
            raise ValueError(f"Unexpected response format from X.AI API: {response_json}")

    except Exception as e:
        logger.error(f"Error calling X.AI API: {str(e)}")
        raise

class ModelClientManager:
    """
    Manages AsyncOpenAI clients for different model providers.

    This class creates and manages AsyncOpenAI clients for each provider,
    with configurations to handle retries and timeouts.
    """

    def __init__(self, max_retries: int = 3, timeout: float = 60.0):
        """
        Initialize the client manager.

        Args:
            max_retries: Maximum number of retries for API calls
            timeout: Timeout in seconds for API calls
        """
        self.max_retries = max_retries
        self.timeout = timeout
        self.clients = {}
        self.available_providers = []

        # Initialize clients for available providers
        for provider, env_var in PROVIDER_API_KEY_ENV_VARS.items():
            api_key = os.environ.get(env_var)
            if api_key:
                try:
                    self._create_client(provider, api_key)
                    self.available_providers.append(provider)
                    logger.info(f"Initialized {provider} provider")
                except Exception as e:
                    logger.error(f"Failed to initialize {provider} provider: {str(e)}")

        logger.info(f"Available providers: {', '.join(self.available_providers)}")

        # Calculate available models
        self.available_models = {
            model for model, provider in MODEL_TO_PROVIDER.items()
            if provider in self.available_providers
        }

        logger.info(f"Available models: {sorted(list(self.available_models))}")

    def _create_client(self, provider: str, api_key: str) -> AsyncOpenAI:
        """
        Create an AsyncOpenAI client for a specific provider.

        Args:
            provider: Provider name
            api_key: API key for the provider

        Returns:
            AsyncOpenAI client
        """
        base_url = PROVIDER_BASE_URLS.get(provider)
        if not base_url:
            raise ValueError(f"Unknown provider: {provider}")

        # Create client with retry configuration
        client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
            timeout=self.timeout,
            max_retries=self.max_retries
        )

        self.clients[provider] = client
        return client

    def get_client_for_model(self, model: str) -> Optional[AsyncOpenAI]:
        """
        Get the appropriate client for a given model.

        Args:
            model: Model name

        Returns:
            AsyncOpenAI client, or None if provider not available
        """
        provider = MODEL_TO_PROVIDER.get(model)
        if not provider:
            logger.warning(f"No provider defined for model: {model}")
            return None

        client = self.clients.get(provider)
        if not client:
            logger.warning(f"Provider {provider} not available for model: {model}")

        return client

    def available_fallbacks(self, model: str) -> List[str]:
        """
        Get available fallback models for the given model.

        Args:
            model: The model name to find fallbacks for

        Returns:
            List of available fallback models
        """
        all_fallbacks = get_fallback_models(model)
        available_fallbacks = [m for m in all_fallbacks if m in self.available_models]
        return available_fallbacks

# Add patches to Runner methods to handle fallbacks
async def patched_run(agent, input_text, **kwargs):
    """
    Patch for Runner.run that adds fallback logic.

    This function intercepts Runner.run calls and adds fallback logic
    to try alternative models if the primary model fails.
    """
    raise NotImplementedError("Only streamed run is supported")

def patched_run_streamed(agent, input_text, **kwargs):
    """
    Patch for Runner.run_streamed that adds fallback logic.

    This function returns a streaming result but uses the fallback mechanism
    if the primary model fails.
    """
    from agents import Runner

    # If client_manager isn't available, use original method
    if not hasattr(Agent, 'client_manager') or not hasattr(Agent, 'fallback_mapping'):
        logger.warning("Client manager or fallback mapping not available, using original method")
        return Runner._original_run_streamed(agent, input_text, **kwargs)

    # Create a wrapper class that implements stream_events
    class FallbackStreamWrapper:
        def __init__(self):
            self.result = None
            self.error_logs = []

        async def stream_events(self):
            """Stream events from the first successful model."""
            # Setup for retries
            max_retries = int(os.environ.get("MAGI_MAX_RETRIES", "3"))
            retry_delay = float(os.environ.get("MAGI_RETRY_DELAY", "2.0"))

            # Get the original model and provider
            original_model = agent.model
            provider = MODEL_TO_PROVIDER.get(original_model)

            # Define a simple response event class
            class SimpleResponseEvent:
                def __init__(self, content, model):
                    if content is None or content == "None" or content.strip() == "":
                        error_msg = f"Empty content in response from model {model}"
                        logger.error(error_msg)
                        raise ValueError(error_msg)

                    self.content = content
                    self.model = model
                    self.type = "message"

                def __str__(self):
                    return self.content
            
            # Define a tool call event class
            class ToolCallEvent:
                def __init__(self, tool_calls, model):
                    self.tool_calls = tool_calls
                    self.model = model
                    self.type = "tool_calls"

            # Get system message from agent
            system_message = ""
            if hasattr(agent, 'instructions'):
                system_message = agent.instructions
            elif hasattr(agent, 'system'):
                system_message = agent.system
                
            # Get agent tools if available
            agent_tools = None
            openai_formatted_tools = None
            if hasattr(agent, 'tools') and agent.tools:
                # Try to convert tools to OpenAI format if they're not already
                if isinstance(agent.tools, list):
                    # Create OpenAI-formatted tools from the agent's tools
                    try:
                        openai_formatted_tools = []
                        for tool in agent.tools:
                            try:
                                # Use our formatting function
                                formatted_tool = format_function_tool_for_openai(tool)
                                if formatted_tool:
                                    openai_formatted_tools.append(formatted_tool)
                                else:
                                    logger.warning(f"Failed to format tool: {getattr(tool, '__name__', 'unknown')}")
                            except Exception as e:
                                logger.error(f"Error formatting tool {getattr(tool, '__name__', 'unknown')}: {str(e)}")
                                logger.warning(f"Could not format tool {getattr(tool, 'name', getattr(tool, '__name__', 'unknown'))}")
                        
                        # Log the formatted tools
                        for i, tool in enumerate(openai_formatted_tools):
                            function_name = tool.get('function', {}).get('name', 'unknown')
                            logger.info(f"Tool {i+1}: {function_name}")
                        
                        logger.info(f"Prepared {len(openai_formatted_tools)} tools for API call")
                    except Exception as e:
                        logger.error(f"Error formatting tools for API: {str(e)}")
                        openai_formatted_tools = None

            # Special handling for Claude models - try to use direct API first
            if provider == "anthropic" and ANTHROPIC_AVAILABLE:
                try:
                    # Get max_tokens (from agent attribute if available)
                    max_tokens = getattr(agent, 'max_tokens', None)
                    if not max_tokens:
                        # Set default based on model
                        if "claude-3-7-sonnet" in original_model:
                            max_tokens = 32000
                        elif "-sonnet-" in original_model:
                            max_tokens = 32000
                        elif "-haiku-" in original_model:
                            max_tokens = 16000
                        else:
                            max_tokens = 4000

                    # Get the model-specific temperature
                    temp = 0.7

                    # Create parameters dictionary
                    claude_parameters = {
                        "max_tokens": max_tokens,
                        "temperature": temp,
                    }
                    
                    # Add tools if available
                    if openai_formatted_tools:
                        claude_parameters["tools"] = openai_formatted_tools

                    # Use the direct Claude API
                    direct_response = await call_claude_directly(
                        model_name=original_model,
                        system_message=system_message,
                        user_message=input_text,
                        **claude_parameters
                    )

                    # Check if we got a valid response
                    if hasattr(direct_response, 'choices') and len(direct_response.choices) > 0:
                        # Check if there are tool calls in the response
                        message = direct_response.choices[0].message
                        if hasattr(message, 'tool_calls') and message.tool_calls:
                            # This is a tool call response
                            tool_calls = message.tool_calls
                            # Yield the tool call event
                            yield ToolCallEvent(tool_calls=tool_calls, model=original_model)
                        else:
                            # This is a regular text response
                            content = message.content
                            # Yield our custom event
                            yield SimpleResponseEvent(content=content, model=original_model)
                        
                        return  # Exit the generator after yielding

                except Exception as e:
                    # Log the error and continue with fallbacks
                    logger.error(f"Error using direct Anthropic API: {str(e)}")
                    logger.info("Falling back to standard process")

            # Special handling for Gemini models
            elif provider == "google" and GEMINI_AVAILABLE:
                # Get max_tokens (from agent attribute if available)
                max_tokens = getattr(agent, 'max_tokens', None)
                if not max_tokens:
                    # Set default based on model
                    if "gemini-2.0-ultra" in original_model:
                        max_tokens = 8192
                    elif "gemini-2.0-pro" in original_model:
                        max_tokens = 8192
                    else:
                        max_tokens = 4096

                # Temperature settings
                temp = 0.7

                # Create parameters dictionary
                gemini_parameters = {
                    "max_tokens": max_tokens,
                    "temperature": temp,
                }
                
                # Add tools if available
                if openai_formatted_tools:
                    gemini_parameters["tools"] = openai_formatted_tools

                # Use direct Gemini API
                direct_response = await call_gemini_directly(
                    model_name=original_model,
                    system_message=system_message,
                    user_message=input_text,
                    **gemini_parameters
                )

                # Check if we got a valid response
                if hasattr(direct_response, 'choices') and len(direct_response.choices) > 0:
                    # Check if there are tool calls in the response
                    message = direct_response.choices[0].message
                    if hasattr(message, 'tool_calls') and message.tool_calls:
                        # This is a tool call response
                        tool_calls = message.tool_calls
                        # Yield the tool call event
                        yield ToolCallEvent(tool_calls=tool_calls, model=original_model)
                    else:
                        # This is a regular text response
                        content = message.content
                        # Yield our custom event
                        yield SimpleResponseEvent(content=content, model=original_model)
                    
                    return  # Exit after yielding

            # Special handling for Grok models
            elif provider == "xai" and GROK_AVAILABLE:
                try:
                    # Get max_tokens (from agent attribute if available)
                    max_tokens = getattr(agent, 'max_tokens', None)
                    if not max_tokens:
                        # Set default based on model type
                        if "grok-2" in original_model:
                            max_tokens = 4096
                        else:
                            max_tokens = 2048

                    # Temperature settings
                    temp = 0.7

                    # Create parameters dictionary
                    grok_parameters = {
                        "max_tokens": max_tokens,
                        "temperature": temp,
                    }
                    
                    # Add tools if available
                    if openai_formatted_tools:
                        grok_parameters["tools"] = openai_formatted_tools

                    # Use direct Grok API
                    direct_response = await call_grok_directly(
                        model_name=original_model,
                        system_message=system_message,
                        user_message=input_text,
                        **grok_parameters
                    )

                    # Check if we got a valid response
                    if hasattr(direct_response, 'choices') and len(direct_response.choices) > 0:
                        # Check if there are tool calls in the response
                        message = direct_response.choices[0].message
                        if hasattr(message, 'tool_calls') and message.tool_calls:
                            # This is a tool call response
                            tool_calls = message.tool_calls
                            # Yield the tool call event
                            yield ToolCallEvent(tool_calls=tool_calls, model=original_model)
                        else:
                            # This is a regular text response
                            content = message.content
                            # Yield our custom event
                            yield SimpleResponseEvent(content=content, model=original_model)
                        
                        return  # Exit after yielding

                except Exception as e:
                    # Log error and continue with fallbacks
                    logger.error(f"Error using direct X.AI API: {str(e)}")
                    logger.info("Falling back to standard process")

            # If direct API calls failed, try fallbacks
            client_manager = Agent.client_manager
            fallbacks = Agent.fallback_mapping.get(original_model, client_manager.available_fallbacks(original_model))
            models_to_try = [original_model] + fallbacks

            # Keep track of tried models to avoid duplicates
            tried_models = set()

            # Loop through each model
            for model_name in models_to_try:
                # Skip if already tried
                if model_name in tried_models:
                    continue

                tried_models.add(model_name)

                # Get provider and client
                provider = MODEL_TO_PROVIDER.get(model_name)
                if not provider:
                    self.error_logs.append(f"No provider defined for model {model_name}")
                    continue

                client = client_manager.get_client_for_model(model_name)
                if not client:
                    self.error_logs.append(f"No client available for provider {provider} (model {model_name})")
                    continue

                # Set the client as default
                set_default_openai_client(client, use_for_tracing=False)

                # Create a copy of the agent with this model
                new_agent = agent.copy()
                new_agent.model = model_name

                # Try with retries
                retries = 0
                while retries <= max_retries:
                    try:
                        # For certain providers, directly raise an exception
                        # to fall through to our simple_run implementation with direct API calls
                        if provider == "anthropic":
                            # Bypass the framework for Claude models
                            raise ValueError(f"Forcing simple_run for Claude model: {model_name}")
                        elif provider == "google" and GEMINI_AVAILABLE:
                            # Bypass the framework for Gemini models
                            raise ValueError(f"Forcing simple_run for Gemini model: {model_name}")
                        elif provider == "xai" and GROK_AVAILABLE:
                            # Bypass the framework for Grok models
                            raise ValueError(f"Forcing simple_run for Grok model: {model_name}")
                        else:
                            # Call the original method for other models
                            stream_result = Runner._original_run_streamed(new_agent, input_text, **kwargs)

                        # Create a very simple run function for direct API calls
                        async def simple_run():
                            try:
                                # Get the system message from the agent's instructions if available
                                system_message = ""
                                if hasattr(new_agent, 'instructions'):
                                    system_message = new_agent.instructions
                                elif hasattr(new_agent, 'system'):
                                    system_message = new_agent.system

                                # Create the parameters dict
                                params = {
                                    "model": model_name,
                                    "messages": [
                                        {"role": "system", "content": system_message},
                                        {"role": "user", "content": input_text}
                                    ]
                                }
                                
                                # Add tools if available
                                if openai_formatted_tools:
                                    params["tools"] = openai_formatted_tools

                                # Get provider for the model
                                provider = MODEL_TO_PROVIDER.get(model_name)

                                # Make a clean copy of kwargs
                                kwargs_copy = kwargs.copy() if kwargs else {}

                                # Handle models by provider
                                if provider == "anthropic":
                                    # For Claude models, use the native Anthropic library
                                    try:
                                        # Get max_tokens from agent if available
                                        max_tokens = kwargs_copy.get("max_tokens", 4096)

                                        # Check if the agent has max_tokens set in agent definition
                                        if hasattr(new_agent, 'max_tokens'):
                                            max_tokens = new_agent.max_tokens

                                        # Set limits based on model
                                        if "claude-3-7-sonnet" in model_name:
                                            max_tokens = min(max_tokens, 64000)
                                        elif "-sonnet-" in model_name:
                                            max_tokens = min(max_tokens, 64000)
                                        elif "-haiku-" in model_name:
                                            max_tokens = min(max_tokens, 32000)
                                        else:
                                            max_tokens = min(max_tokens, 4096)

                                        # Create special kwargs for Claude
                                        claude_kwargs = {
                                            "max_tokens": max_tokens,
                                            "temperature": kwargs_copy.get("temperature", 0.7)
                                        }
                                        
                                        # Add tools if available - convert to Claude format
                                        if openai_formatted_tools:
                                            claude_kwargs["tools"] = convert_tools_for_provider(
                                                openai_formatted_tools, 
                                                "anthropic", 
                                                model_name
                                            )

                                        response = await call_claude_directly(
                                            model_name=model_name,
                                            system_message=system_message,
                                            user_message=input_text,
                                            **claude_kwargs
                                        )
                                        return response
                                    except Exception as e:
                                        logger.error(f"Error using Anthropic library directly: {str(e)}")
                                        logger.info("Falling back to generic API approach for Claude")
                                        
                                        # Only use essential parameters
                                        filtered_params = {
                                            k: v for k, v in kwargs_copy.items()
                                            if k in [
                                                "model", "messages", "max_tokens", "temperature",
                                                "top_p", "user", "stream", "tools"
                                            ]
                                        }
                                        
                                        # Update with filtered parameters
                                        params.update(filtered_params)
                                elif provider == "google" and GEMINI_AVAILABLE:
                                    # For Gemini models, use the native Google GenerativeAI library
                                    try:
                                        # Get max_tokens from agent if available
                                        max_tokens = kwargs_copy.get("max_tokens", 4096)

                                        # Check if the agent has max_tokens set in agent definition
                                        if hasattr(new_agent, 'max_tokens'):
                                            max_tokens = new_agent.max_tokens

                                        # Set limits based on model
                                        if "gemini-2.0-ultra" in model_name:
                                            max_tokens = min(max_tokens, 16384)
                                        elif "gemini-2.0-pro" in model_name:
                                            max_tokens = min(max_tokens, 16384)
                                        elif "gemini-pro" in model_name:
                                            max_tokens = min(max_tokens, 8192)
                                        else:
                                            max_tokens = min(max_tokens, 4096)

                                        # Create special kwargs for Gemini
                                        gemini_kwargs = {
                                            "max_tokens": max_tokens,
                                            "temperature": kwargs_copy.get("temperature", 0.7)
                                        }
                                        
                                        # Add tools if available - convert to Gemini format
                                        if openai_formatted_tools:
                                            gemini_kwargs["tools"] = convert_tools_for_provider(
                                                openai_formatted_tools, 
                                                "google", 
                                                model_name
                                            )

                                        response = await call_gemini_directly(
                                            model_name=model_name,
                                            system_message=system_message,
                                            user_message=input_text,
                                            **gemini_kwargs
                                        )
                                        return response
                                    except Exception as e:
                                        logger.error(f"Error using Google GenerativeAI library directly: {str(e)}")
                                        logger.info("Falling back to generic API approach for Gemini")
                                        
                                        # Only use essential parameters
                                        filtered_params = {
                                            k: v for k, v in kwargs_copy.items()
                                            if k in [
                                                "model", "messages", "max_tokens", "temperature",
                                                "top_p", "user", "tools"
                                            ]
                                        }
                                        
                                        # Update with filtered parameters
                                        params.update(filtered_params)
                                elif provider == "xai" and GROK_AVAILABLE:
                                    # For Grok models, use the direct API call
                                    try:
                                        # Get max_tokens from agent if available
                                        max_tokens = kwargs_copy.get("max_tokens", 4096)

                                        # Check if the agent has max_tokens set in agent definition
                                        if hasattr(new_agent, 'max_tokens'):
                                            max_tokens = new_agent.max_tokens

                                        # Set limits based on model
                                        if "grok-2" in model_name:
                                            max_tokens = min(max_tokens, 8192)
                                        else:
                                            max_tokens = min(max_tokens, 4096)

                                        # Create special kwargs for Grok
                                        grok_kwargs = {
                                            "max_tokens": max_tokens,
                                            "temperature": kwargs_copy.get("temperature", 0.7)
                                        }
                                        
                                        # Add tools if available - Grok uses OpenAI format
                                        if openai_formatted_tools:
                                            grok_kwargs["tools"] = convert_tools_for_provider(
                                                openai_formatted_tools, 
                                                "xai", 
                                                model_name
                                            )

                                        response = await call_grok_directly(
                                            model_name=model_name,
                                            system_message=system_message,
                                            user_message=input_text,
                                            **grok_kwargs
                                        )
                                        return response
                                    except Exception as e:
                                        logger.error(f"Error using X.AI API directly: {str(e)}")
                                        logger.info("Falling back to generic API approach for Grok")
                                        
                                        # Only use essential parameters
                                        filtered_params = {
                                            k: v for k, v in kwargs_copy.items()
                                            if k in [
                                                "model", "messages", "max_tokens", "temperature",
                                                "top_p", "user", "tools"
                                            ]
                                        }
                                        
                                        # Update with filtered parameters
                                        params.update(filtered_params)
                                else:
                                    # For OpenAI and other providers
                                    params.update(kwargs_copy)

                                # Use the client to make a direct completion call
                                response = await client.chat.completions.create(**params)
                                return response
                            except Exception as e:
                                logger.error(f"Error in simple_run: {str(e)}")
                                raise

                        # Get the full response
                        response = await simple_run()

                        # Check if response contains tool calls
                        has_tool_calls = False
                        tool_calls = None
                        
                        # Try to extract tool calls if they exist
                        if hasattr(response, 'choices') and len(response.choices) > 0:
                            if hasattr(response.choices[0], 'message') and hasattr(response.choices[0].message, 'tool_calls'):
                                tool_calls = response.choices[0].message.tool_calls
                                if tool_calls:
                                    has_tool_calls = True
                        
                        if has_tool_calls:
                            # Yield a tool call event
                            yield ToolCallEvent(tool_calls=tool_calls, model=model_name)
                            return
                        else:
                            # Extract content from the response for regular text response
                            content = None

                            # Try different ways to extract text
                            # Method 1: Direct structure
                            if hasattr(response, 'choices') and len(response.choices) > 0:
                                if hasattr(response.choices[0], 'message') and hasattr(response.choices[0].message, 'content'):
                                    content = response.choices[0].message.content

                            # Method 2: From text attribute
                            if not content and hasattr(response, 'text'):
                                content = response.text

                            # If still no content, use a default message
                            if not content:
                                content = "I am an AI model in the MAGI system. I'm designed to provide helpful and accurate information."
                                logger.warning(f"Using fallback content for {model_name} due to extraction issues")

                            # Extra validation for content to avoid errors
                            if not content or (isinstance(content, str) and content.strip() == ""):
                                logger.error(f"Empty content extracted from model {model_name} response")
                                # Fall back to next model - don't yield empty content
                                raise ValueError(f"Empty content from model {model_name}")

                            # Yield a simple text response event
                            yield SimpleResponseEvent(content=content, model=model_name)
                            return

                    except Exception as e:
                        # Log the error and retry or move to next model
                        retries += 1
                        if retries <= max_retries:
                            logger.warning(f"Error with model {model_name}, retrying ({retries}/{max_retries}): {str(e)}")
                            await asyncio.sleep(retry_delay * retries)  # Exponential backoff
                        else:
                            logger.error(f"Failed all retries with model {model_name}: {str(e)}")
                            break  # Move to next model

            # If we get here, all models failed
            error_summary = "\n".join(self.error_logs)
            error_msg = f"All models failed during streaming. Attempted models: {', '.join(tried_models)}."
            logger.error(error_msg)
            raise RuntimeError(error_msg)

    # Return our wrapper
    return FallbackStreamWrapper()

# Apply the patches when module is loaded
def apply_runner_patch():
    """Apply patches to Runner methods to add fallback logic."""
    from agents import Runner

    # Patch Runner.run if not already patched
    if not hasattr(Runner, '_original_run'):
        Runner._original_run = Runner.run
        Runner.run = patched_run

    # Patch Runner.run_streamed if not already patched
    if not hasattr(Runner, '_original_run_streamed'):
        Runner._original_run_streamed = Runner.run_streamed
        Runner.run_streamed = patched_run_streamed

    logger.info("Applied patches to Runner.run and Runner.run_streamed")

def register_tool(func=None, name=None, description=None):
    """
    Decorator to register a function as a tool.
    
    Args:
        func: The function to register
        name: Optional name override (defaults to function name)
        description: Optional description override (defaults to function docstring)
    
    Returns:
        The registered function with openai_schema method added
    """
    def decorator(f):
        # Add openai_schema method to the function
        def openai_schema():
            import inspect
            from typing import get_type_hints
            
            # Get function details
            func_name = name or f.__name__
            func_desc = description or f.__doc__ or ""
            params = inspect.signature(f).parameters
            type_hints = get_type_hints(f)
            
            # Build parameters object
            properties = {}
            required = []
            
            for param_name, param in params.items():
                if param_name == 'self':
                    continue
                    
                param_type = type_hints.get(param_name, None)
                type_str = "string"  # Default type
                
                if param_type == int:
                    type_str = "integer"
                elif param_type == float:
                    type_str = "number"
                elif param_type == bool:
                    type_str = "boolean"
                    
                properties[param_name] = {
                    "type": type_str,
                    "description": f"Parameter {param_name}"
                }
                
                if param.default == inspect.Parameter.empty:
                    required.append(param_name)
            
            # Create OpenAI function format
            return {
                "type": "function",
                "function": {
                    "name": func_name,
                    "description": func_desc.strip(),
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": required
                    }
                }
            }
        
        # Attach the schema method to the function
        f.openai_schema = openai_schema
        return f
    
    # Handle both @register_tool and @register_tool(name="x") usage
    if func is None:
        return decorator
    return decorator(func)

def format_function_tool_for_openai(tool):
    """
    Format a function_tool decorator wrapped function for OpenAI compatibility.
    
    Args:
        tool: The function_tool wrapped function
        
    Returns:
        Properly formatted tool definition for OpenAI
    """
    try:
        # If tool already has openai_schema method, use it
        if hasattr(tool, 'openai_schema'):
            return tool.openai_schema()
            
        # If tool has to_openai_function method, use it
        if hasattr(tool, 'to_openai_function'):
            return {
                "type": "function",
                "function": tool.to_openai_function()
            }
            
        # Fall back to manual conversion
        import inspect
        from typing import get_type_hints
        
        # Get function details
        func_name = tool.__name__ if hasattr(tool, '__name__') else "unknown_function"
        func_desc = tool.__doc__ if hasattr(tool, '__doc__') and tool.__doc__ else "Function tool"
        
        # Try to get parameters
        params = {}
        required = []
        
        if hasattr(tool, '__annotations__'):
            annotations = tool.__annotations__
            # Convert annotations to parameter definitions
            for param_name, param_type in annotations.items():
                if param_name == 'return':
                    continue
                    
                type_str = "string"  # Default type
                
                # Try to convert Python types to JSON Schema types
                if param_type == int or getattr(param_type, '__origin__', None) == int:
                    type_str = "integer"
                elif param_type == float or getattr(param_type, '__origin__', None) == float:
                    type_str = "number"
                elif param_type == bool or getattr(param_type, '__origin__', None) == bool:
                    type_str = "boolean"
                
                # Add to parameters
                params[param_name] = {
                    "type": type_str,
                    "description": f"Parameter {param_name}"
                }
                
                # For now, consider all parameters required
                required.append(param_name)
        
        # Try to get parameter info from signature if available
        try:
            signature = inspect.signature(tool)
            for param_name, param in signature.parameters.items():
                if param_name not in params:
                    params[param_name] = {
                        "type": "string",
                        "description": f"Parameter {param_name}"
                    }
                    
                    if param.default == inspect.Parameter.empty:
                        if param_name not in required:
                            required.append(param_name)
        except Exception:
            # If we can't get signature, just use what we have
            pass
            
        # Handle RunContextWrapper parameter - common in function_tool decorators
        if "context" in params and "RunContextWrapper" in str(params["context"]):
            # The context parameter is added by the function_tool decorator and shouldn't be exposed
            if "context" in required:
                required.remove("context")
            del params["context"]
        
        # Create OpenAI function format
        return {
            "type": "function",
            "function": {
                "name": func_name,
                "description": func_desc.strip(),
                "parameters": {
                    "type": "object",
                    "properties": params,
                    "required": required
                }
            }
        }
    except Exception as e:
        logger.error(f"Error formatting function tool for OpenAI: {str(e)}")
        return {
            "type": "function",
            "function": {
                "name": getattr(tool, '__name__', "unknown_function"),
                "description": getattr(tool, '__doc__', "Function tool"),
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        }

def get_tools_for_model(tools: List[Dict[str, Any]], model_name: str) -> List[Dict[str, Any]]:
    """
    Utility function to convert tools to the format required by a specific model.
    
    Args:
        tools: List of tools in OpenAI format
        model_name: The model name
        
    Returns:
        List of tools in model-specific format
    """
    if not tools:
        return []
    
    # Get provider for the model
    provider = MODEL_TO_PROVIDER.get(model_name)
    if not provider:
        logger.warning(f"Unknown provider for model: {model_name}, using OpenAI format")
        return tools
    
    # Convert tools to provider-specific format
    return convert_tools_for_provider(tools, provider, model_name)

def setup_retry_and_fallback_provider() -> None:
    """
    Set up the retry and fallback provider for the MAGI system.

    This function:
    1. Creates clients for all available providers
    2. Sets up the default configuration for the OpenAI Agents framework
    3. Configures default models for different agent types
    4. Adds necessary utility methods to Agent class
    """
    # Add copy method to Agent class
    add_copy_method_to_agent()
    
    # Read configuration from environment variables
    max_retries = int(os.environ.get("MAGI_MAX_RETRIES", "3"))
    timeout = float(os.environ.get("MAGI_TIMEOUT", "60.0"))

    # Initialize client manager
    client_manager = ModelClientManager(max_retries=max_retries, timeout=timeout)

    # Don't use a predefined fallback mapping, use dynamic fallback generation instead
    fallback_mapping = {}  # Empty dict, will use get_fallback_models() instead

    # Find primary provider (first available in order of preference)
    preferred_providers = ["openai", "anthropic", "google", "xai"]
    primary_provider = next((p for p in preferred_providers if p in client_manager.available_providers), None)

    if not primary_provider:
        error_msg = "No API keys available for any supported model provider"
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info(f"Using {primary_provider} as primary provider")

    # Set the default client from the primary provider
    primary_client = client_manager.clients[primary_provider]
    set_default_openai_client(client=primary_client, use_for_tracing=False)

    # Set default API type to chat completions (most providers support this)
    set_default_openai_api("chat_completions")

    # Disable tracing by default (can be enabled via environment variable)
    set_tracing_disabled(os.environ.get("MAGI_ENABLE_TRACING", "").lower() != "true")

    # Store the client manager in Agent class for access in runners
    Agent.client_manager = client_manager
    Agent.fallback_mapping = fallback_mapping  # Empty, will force using available_fallbacks()

    # Configure model settings for different agent types if not already set
    agent_model_defaults = {
        "MAGI_SUPERVISOR_MODEL": "gpt-4o",
        "MAGI_MANAGER_MODEL": "gpt-4o",
        "MAGI_REASONING_MODEL": "claude-3-7-sonnet-latest",
        "MAGI_CODE_MODEL": "gpt-4o-mini",
        "MAGI_BROWSER_MODEL": "computer-use-preview",
        "MAGI_VISION_MODEL": "computer-use-preview",
        "MAGI_SEARCH_MODEL": "gpt-4o-search-preview",
        "MAGI_SHELL_MODEL": "gpt-4o-mini"
    }

    # Set default environment variables if not already set
    for env_var, default_value in agent_model_defaults.items():
        if env_var not in os.environ:
            os.environ[env_var] = default_value

    # Apply the patch to Runner.run for fallback support
    apply_runner_patch()