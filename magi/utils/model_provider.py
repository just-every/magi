"""
Model provider configuration for the MAGI system.

This module sets up multiple model providers (OpenAI, Anthropic, Google, X.AI)
with retry and fallback capabilities using the OpenAI Agents framework.
"""
import logging
import os
import asyncio
import time
from typing import Dict, List, Optional, Any, Union
import logging

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

# Add copy method to Agent class
def add_copy_method_to_agent():
    """Add a copy method to the Agent class if it doesn't already have one."""
    if not hasattr(Agent, 'copy'):
        def copy_method(self):
            """Create a copy of the agent with the same attributes."""
            # Use a more flexible approach that doesn't assume constructor parameters
            import copy
            
            # First create a shallow copy
            new_agent = copy.copy(self)
            
            # Then ensure model attribute is properly set
            # This is the most important attribute that needs to be copied
            if hasattr(self, 'model'):
                new_agent.model = self.model
                
            return new_agent
        
        Agent.copy = copy_method
        logger.info("Added simple copy method to Agent class")

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
    "gemini-pro": "google",
    "gemini-pro-vision": "google",
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
    logger.info(f"Using max_tokens={max_tokens} for Claude model {model_name}")
    
    # Create messages in Anthropic format
    messages = [
        {"role": "user", "content": user_message}
    ]
    
    try:
        # Use a stream flag if the call may take a long time
        logger.info(f"Using streamed call for Claude API (recommended for long operations)")
        
        # Call the Anthropic API with streaming
        full_response_text = ""
        
        # Create a streaming message request
        stream = await client.messages.create(
            model=model_name,
            messages=messages,
            system=system_message,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True
        )
        
        # Process the stream to get the full response
        async for part in stream:
            if hasattr(part, "delta") and hasattr(part.delta, "text"):
                # Extract text from each chunk
                text_chunk = part.delta.text
                if text_chunk:
                    # Add to full response
                    full_response_text += text_chunk
        
        # Create a mock OpenAI response
        mock_openai_response = type('AnthropicResponseWrapper', (), {
            'choices': [
                type('Choice', (), {
                    'message': type('Message', (), {
                        'content': full_response_text
                    })
                })
            ]
        })
        
        logger.info(f"Successfully received streamed response from Claude using Anthropic library")
        return mock_openai_response
    
    except Exception as e:
        # Log the error and try non-streaming as fallback
        logger.error(f"Streaming error with Claude API: {str(e)}")
        logger.info("Falling back to non-streaming API call")
        
        # Call the Anthropic API without streaming
        response = await client.messages.create(
            model=model_name,
            messages=messages,
            system=system_message,
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        # Convert to a format compatible with our simple response event
        # Create a mock OpenAI response
        mock_openai_response = type('AnthropicResponseWrapper', (), {
            'choices': [
                type('Choice', (), {
                    'message': type('Message', (), {
                        'content': response.content[0].text
                    })
                })
            ]
        })
        
        logger.info(f"Successfully received response from Claude using Anthropic library")
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
    logger.info(f"Using max_tokens={max_tokens} for Gemini model {model_name}")
    
    try:
        # List available models to help with debugging
        available_models = []
        short_names = []  # Models without the 'models/' prefix
        try:
            models = genai.list_models()
            available_models = [model.name for model in models]
            # Also create a list of short names without the 'models/' prefix
            short_names = [name.replace('models/', '') for name in available_models]
            logger.info(f"Available Gemini models (full names): {available_models}")
            logger.info(f"Available Gemini models (short names): {short_names}")
        except Exception as e:
            logger.warning(f"Failed to list available models: {str(e)}")
        
        # Map from our model names to the actual model names supported by the Google API
        # The Google Gemini API uses model names like "models/gemini-1.5-pro" with a prefix
        default_model = "models/gemini-1.5-pro"  # A good default model if available
        if default_model not in available_models:
            default_model = "models/gemini-pro"  # Fall back to older version
            if default_model not in available_models and available_models:
                # Just pick the first available model that has 'gemini' in its name
                gemini_models = [m for m in available_models if "gemini" in m]
                if gemini_models:
                    default_model = gemini_models[0]
                else:
                    default_model = available_models[0]  # Just use the first available model
                    
        api_model_name = default_model  # Start with the default
        
        # First check if the model name with 'models/' prefix is in the available models
        if f"models/{model_name}" in available_models:
            api_model_name = f"models/{model_name}"
        # Then check if the exact name is in the available models (already has prefix)
        elif model_name in available_models:
            api_model_name = model_name
        # Otherwise, try to find the best match
        else:
            # First, map our internal models to official Google model names
            if model_name == "gemini-pro":
                prefixed_name = "models/gemini-pro"
                if prefixed_name in available_models:
                    api_model_name = prefixed_name
            elif model_name == "gemini-pro-vision":
                prefixed_name = "models/gemini-pro-vision"
                if prefixed_name in available_models:
                    api_model_name = prefixed_name
            elif "gemini-2.0" in model_name:
                # Map to 1.5 models which seem to be the current equivalents
                if "flash" in model_name:
                    # Look for an appropriate flash model
                    flash_models = [m for m in available_models if "gemini-1.5-flash" in m or "gemini-2.0-flash" in m]
                    if flash_models:
                        # Prefer newer models (sort by version)
                        flash_models.sort(reverse=True)  # Higher version numbers first
                        api_model_name = flash_models[0]
                elif "pro" in model_name or "ultra" in model_name:
                    # Look for an appropriate pro model
                    pro_models = [m for m in available_models if "gemini-1.5-pro" in m or "gemini-2.0-pro" in m]
                    if pro_models:
                        # Prefer newer models (sort by version)
                        pro_models.sort(reverse=True)  # Higher version numbers first
                        api_model_name = pro_models[0]
        
        logger.info(f"Mapped {model_name} to API model name: {api_model_name}")
        
        # Create a model instance with the full model name
        model = genai.GenerativeModel(api_model_name)
        
        # Create chat session
        chat = model.start_chat(history=[])
        
        # Configure generation parameters
        generation_config = {
            "max_output_tokens": max_tokens,
            "temperature": temperature,
        }
        
        # Create content with system message if provided
        content = user_message
        if system_message:
            content = f"{system_message}\n\n{user_message}"
        
        # Send the message to the model
        logger.info(f"Sending request to Gemini API with content length: {len(content)}")
        
        try:
            # Use non-streaming first since streaming has issues in some environments
            logger.info(f"Using direct Gemini API call")
            
            # Try using generate_content directly instead of chat
            model = genai.GenerativeModel(api_model_name)
            
            # Use a safety setting that allows more types of content
            safety_settings = {
                "HARASSMENT": "BLOCK_NONE",
                "HATE": "BLOCK_NONE",
                "SEXUAL": "BLOCK_NONE",
                "DANGEROUS": "BLOCK_NONE",
            }
            
            # Generate content directly
            response = model.generate_content(
                content,
                generation_config=generation_config,
                safety_settings=safety_settings
            )
            
            # Make sure the response is resolved
            if hasattr(response, 'resolve'):
                try:
                    response = response.resolve()
                except Exception as resolve_error:
                    logger.warning(f"Error resolving response: {str(resolve_error)}")
            
            # Get the text - handle different response formats
            response_text = ""
            if hasattr(response, 'text'):
                response_text = response.text
            elif hasattr(response, 'candidates') and response.candidates and hasattr(response.candidates[0], 'content'):
                if hasattr(response.candidates[0].content, 'parts'):
                    for part in response.candidates[0].content.parts:
                        if hasattr(part, 'text'):
                            response_text += part.text
                        else:
                            response_text += str(part)
            else:
                # Last resort - use string representation
                response_text = str(response)
                
            # Log the response format for debugging
            logger.info(f"Gemini response has attributes: {dir(response)}")
            logger.info(f"Extracted response text: {response_text}")
            
            # Create a mock OpenAI response format
            mock_openai_response = type('GeminiResponseWrapper', (), {
                'choices': [
                    type('Choice', (), {
                        'message': type('Message', (), {
                            'content': response_text if response_text else "I'm an AI assistant and I'm here to help."
                        })
                    })
                ]
            })
            
            logger.info(f"Successfully received response from Gemini")
            return mock_openai_response
            
        except Exception as e:
            # Log the error
            logger.error(f"Error with Gemini API: {str(e)}")
            
            # Create a fallback response
            mock_openai_response = type('GeminiResponseWrapper', (), {
                'choices': [
                    type('Choice', (), {
                        'message': type('Message', (), {
                            'content': "I'm an AI assistant and I'm here to help. (Note: There was an issue connecting to the Gemini API, so I'm providing a default response.)"
                        })
                    })
                ]
            })
            
            logger.warning(f"Using fallback response due to Gemini API error")
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
    logger.info(f"Using max_tokens={max_tokens} for Grok model {model_name}")
    
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
    
    # Create request payload
    payload = {
        "model": model_name,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature
    }
    
    try:
        # Use the asyncio to run the request in a non-blocking way
        def make_request():
            response = requests.post(api_url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
        
        # Run the request in a thread pool
        logger.info(f"Sending request to X.AI API")
        loop = asyncio.get_event_loop()
        response_json = await loop.run_in_executor(None, make_request)
        
        # Extract the response content
        # X.AI API follows the OpenAI format closely
        if "choices" in response_json and len(response_json["choices"]) > 0:
            # Already in OpenAI format, just return
            logger.info(f"Successfully received response from X.AI API")
            
            # Create a simple wrapper class that mimics the OpenAI response format
            mock_openai_response = type('GrokResponseWrapper', (), {
                'choices': [
                    type('Choice', (), {
                        'message': type('Message', (), {
                            'content': response_json["choices"][0]["message"]["content"]
                        })
                    })
                ]
            })
            
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

        # Log additional information about the configuration
        logger.debug(f"Creating client for {provider} with base URL: {base_url}")
        logger.debug(f"Using timeout: {self.timeout}s, max_retries: {self.max_retries}")

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
        logger.debug(f"Fallbacks for {model}: {available_fallbacks}")
        return available_fallbacks

async def try_with_fallbacks(
    manager: ModelClientManager,
    model: str,
    operation,
    fallback_mapping: Optional[Dict[str, List[str]]] = None,
    max_retries: int = 3,
    retry_delay: float = 1.0
):
    """
    Execute an operation with retry and fallback logic.

    Args:
        manager: ModelClientManager instance
        model: Initial model to try
        operation: Async function to execute with the client
        fallback_mapping: Optional custom fallback mapping
        max_retries: Maximum retries per model
        retry_delay: Base delay between retries

    Returns:
        Operation result

    Raises:
        Exception: If all retries and fallbacks fail
    """
    # Get fallbacks from mapping or use intelligent fallback system
    fallbacks = fallback_mapping.get(model, []) if fallback_mapping else manager.available_fallbacks(model)

    # Start with the requested model, then try fallbacks
    models_to_try = [model] + fallbacks

    last_exception = None
    tried_models = set()

    for current_model in models_to_try:
        # Skip if we've already tried this model
        if current_model in tried_models:
            continue

        tried_models.add(current_model)

        # Get the client for this model
        client = manager.get_client_for_model(current_model)
        if not client:
            logger.warning(f"No client available for model {current_model}, skipping")
            continue

        retries = 0
        while retries <= max_retries:
            try:
                logger.info(f"Trying model: {current_model}, attempt: {retries + 1}")
                return await operation(client, current_model)
            except Exception as e:
                last_exception = e
                retries += 1

                if retries <= max_retries:
                    logger.warning(f"Error with model {current_model}, retrying ({retries}/{max_retries}): {str(e)}")
                    await asyncio.sleep(retry_delay * retries)  # Exponential backoff
                else:
                    logger.error(f"Failed all retries with model {current_model}: {str(e)}")
                    break  # Move to next model

    # If we're here, all models and retries failed
    logger.error(f"Failed all models and retries. Last error: {str(last_exception)}")
    raise last_exception

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
    import traceback

    # Use the original method if no client manager is available

    # If client_manager isn't available, use original method
    if not hasattr(Agent, 'client_manager') or not hasattr(Agent, 'fallback_mapping'):
        logger.warning("Client manager or fallback mapping not available, using original method")
        return Runner._original_run_streamed(agent, input_text, **kwargs)

    # Create a very simple wrapper class that just implements stream_events
    class FallbackStreamWrapper:
        def __init__(self):
            # This will hold our successful result
            self.result = None

            # For debugging
            self.error_logs = []

        async def stream_events(self):
            """Stream events from the first successful model."""
            # Setup for retries
            max_retries = int(os.environ.get("MAGI_MAX_RETRIES", "3"))
            retry_delay = float(os.environ.get("MAGI_RETRY_DELAY", "2.0"))

            # Get the original model and provider
            original_model = agent.model
            provider = MODEL_TO_PROVIDER.get(original_model)
            
            # Define a simple response event class we can reuse
            class SimpleResponseEvent:
                def __init__(self, content, model):
                    self.content = content
                    self.model = model
                    self.type = "message"
                    
                def __str__(self):
                    return self.content
            
            # Get system message from agent
            system_message = ""
            if hasattr(agent, 'instructions'):
                system_message = agent.instructions
            elif hasattr(agent, 'system'):
                system_message = agent.system
            
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
                    
                    # Use the streamed version when possible (recommended for longer operations)
                    logger.info(f"Using direct Anthropic API with streaming for {original_model} with max_tokens={max_tokens}")
                    
                    # Get the model-specific temperature
                    # Different models have different temperature defaults
                    # Use a reasonable default - 0.7 is a good middle ground
                    temp = 0.7
                    
                    # Create a specific claude_parameters dictionary
                    claude_parameters = {
                        "max_tokens": max_tokens,
                        "temperature": temp,
                    }
                            
                    # Use the direct Claude API with streaming to avoid timeout issues
                    direct_response = await call_claude_directly(
                        model_name=original_model,
                        system_message=system_message,
                        user_message=input_text,
                        **claude_parameters
                    )
                    
                    # Check if we got a valid response
                    if hasattr(direct_response, 'choices') and len(direct_response.choices) > 0:
                        # Extract the content
                        content = direct_response.choices[0].message.content
                        
                        # Yield our custom event
                        logger.info(f"Successfully received direct response from Claude model {original_model}")
                        yield SimpleResponseEvent(content=content, model=original_model)
                        return  # Exit the generator after yielding
                        
                except Exception as e:
                    # Log the error and continue with fallbacks
                    logger.error(f"Error using direct Anthropic API: {str(e)}")
                    logger.info("Falling back to standard process")
            
            # Special handling for Gemini models
            elif provider == "google" and GEMINI_AVAILABLE:
                try:
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
                    
                    # Use the streamed version when possible
                    logger.info(f"Using direct Gemini API with streaming for {original_model} with max_tokens={max_tokens}")
                    
                    # Temperature settings
                    temp = 0.7
                    
                    # Create parameters dictionary
                    gemini_parameters = {
                        "max_tokens": max_tokens,
                        "temperature": temp,
                    }
                    
                    # Use direct Gemini API
                    direct_response = await call_gemini_directly(
                        model_name=original_model,
                        system_message=system_message,
                        user_message=input_text,
                        **gemini_parameters
                    )
                    
                    # Check if we got a valid response
                    if hasattr(direct_response, 'choices') and len(direct_response.choices) > 0:
                        # Extract content
                        content = direct_response.choices[0].message.content
                        
                        # Yield our custom event
                        logger.info(f"Successfully received direct response from Gemini model {original_model}")
                        yield SimpleResponseEvent(content=content, model=original_model)
                        return  # Exit after yielding
                        
                except Exception as e:
                    # Log error and continue with fallbacks
                    logger.error(f"Error using direct Gemini API: {str(e)}")
                    logger.info("Falling back to standard process")
            
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
                    
                    logger.info(f"Using direct X.AI API for {original_model} with max_tokens={max_tokens}")
                    
                    # Temperature settings
                    temp = 0.7
                    
                    # Create parameters dictionary
                    grok_parameters = {
                        "max_tokens": max_tokens,
                        "temperature": temp,
                    }
                    
                    # Use direct Grok API
                    direct_response = await call_grok_directly(
                        model_name=original_model,
                        system_message=system_message,
                        user_message=input_text,
                        **grok_parameters
                    )
                    
                    # Check if we got a valid response
                    if hasattr(direct_response, 'choices') and len(direct_response.choices) > 0:
                        # Extract content
                        content = direct_response.choices[0].message.content
                        
                        # Yield our custom event
                        logger.info(f"Successfully received direct response from Grok model {original_model}")
                        yield SimpleResponseEvent(content=content, model=original_model)
                        return  # Exit after yielding
                        
                except Exception as e:
                    # Log error and continue with fallbacks
                    logger.error(f"Error using direct X.AI API: {str(e)}")
                    logger.info("Falling back to standard process")
            
            # If we're here, either it's not a Claude model or direct API failed
            # Get model and fallbacks
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

                # Log that we're trying this model
                logger.info(f"Trying model {model_name} with provider {provider}")

                # Set the client as default
                set_default_openai_client(client, use_for_tracing=False)

                # Create a copy of the agent with this model
                new_agent = agent.copy()
                new_agent.model = model_name

                # Try with retries
                retries = 0
                while retries <= max_retries:
                    try:
                        # Log attempt with more details
                        logger.info(f"Streaming with model {model_name}, attempt {retries + 1}/{max_retries + 1}")
                        
                        # Log agent configuration
                        logger.info(f"Agent configuration details:")
                        if hasattr(new_agent, 'model'):
                            logger.info(f"  - model: {new_agent.model}")
                        if hasattr(new_agent, 'model_settings'):
                            logger.info(f"  - model_settings: {new_agent.model_settings}")
                        if hasattr(new_agent, 'parallel_tool_calls'):
                            logger.info(f"  - parallel_tool_calls: {new_agent.parallel_tool_calls}")
                        if hasattr(new_agent, 'max_tokens'):
                            logger.info(f"  - max_tokens: {new_agent.max_tokens}")
                            
                        # Log any available kwargs
                        if kwargs:
                            logger.info(f"Kwargs: {kwargs}")
                        
                        # NOTE: The openai-agents framework doesn't pass these parameters directly to API call
                        # so we can't modify them here. Instead, we need to modify the agent configuration
                        # or go directly to API as we do in the simple_run implementation.
                        
                        # Log that we're using the original implementation
                        logger.info(f"Calling original run_streamed for {model_name}")
                        
                        # For certain providers, directly raise an exception
                        # to fall through to our simple_run implementation with direct API calls
                        if provider == "anthropic":
                            logger.info(f"Claude model {model_name} detected. Forcing direct API call via simple_run.")
                            # Bypass the framework for Claude models
                            raise ValueError(f"Forcing simple_run for Claude model: {model_name}")
                        elif provider == "google" and GEMINI_AVAILABLE:
                            logger.info(f"Gemini model {model_name} detected. Forcing direct API call via simple_run.")
                            # Bypass the framework for Gemini models
                            raise ValueError(f"Forcing simple_run for Gemini model: {model_name}")
                        elif provider == "xai" and GROK_AVAILABLE:
                            logger.info(f"Grok model {model_name} detected. Forcing direct API call via simple_run.")
                            # Bypass the framework for Grok models
                            raise ValueError(f"Forcing simple_run for Grok model: {model_name}")
                        else:
                            # Call the original method for other models
                            stream_result = Runner._original_run_streamed(new_agent, input_text, **kwargs)

                        # Create our own streaming implementation that doesn't rely on the original
                        # This avoids validation errors with token details
                        
                        # First, let's run the request non-streaming to get the full response
                        from agents import RunResult
                        import json
                        
                        try:
                            # Log what we're doing
                            logger.info(f"Using direct run with {model_name} instead of streaming to avoid validation errors")
                            
                            # Create a very simple run function
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
                                    
                                    # Add model-specific parameters
                                    provider = MODEL_TO_PROVIDER.get(model_name)
                                    
                                    # Make a clean copy of kwargs
                                    kwargs_copy = kwargs.copy() if kwargs else {}
                                    
                                    # Handle models by provider
                                    if provider == "anthropic":
                                        # For Claude models, use the native Anthropic library
                                        try:
                                            # Get a direct response using the anthropic library
                                            logger.info(f"Using direct Anthropic library call for {model_name}")
                                            
                                            # Get max_tokens from agent if available
                                            max_tokens = kwargs_copy.get("max_tokens", 4096)
                                            
                                            # Check if the agent has max_tokens set in agent definition
                                            if hasattr(new_agent, 'max_tokens'):
                                                logger.info(f"Using max_tokens from agent attribute: {new_agent.max_tokens}")
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
                                                
                                            logger.info(f"Using max_tokens={max_tokens} for Claude API call")
                                            
                                            # Create special kwargs for Claude
                                            claude_kwargs = {
                                                "max_tokens": max_tokens,
                                                "temperature": kwargs_copy.get("temperature", 0.7)
                                            }
                                            
                                            response = await call_claude_directly(
                                                model_name=model_name,
                                                system_message=system_message,
                                                user_message=input_text,
                                                **claude_kwargs
                                            )
                                            return response
                                        except Exception as e:
                                            # Log the error and continue with the generic approach
                                            logger.error(f"Error using Anthropic library directly: {str(e)}")
                                            logger.info("Falling back to generic API approach for Claude")
                                            
                                            # Clean parameters that don't work with Claude
                                            logger.info(f"Handling special parameters for Claude model: {model_name}")
                                            
                                            # Claude doesn't support parallel_tool_calls
                                            if "parallel_tool_calls" in kwargs_copy:
                                                logger.info(f"Removing parallel_tool_calls for Claude")
                                                del kwargs_copy["parallel_tool_calls"]
                                            
                                            # Set appropriate max_tokens limits based on model
                                            max_tokens_limit = 4096  # Default
                                            
                                            if "claude-3-7-sonnet" in model_name:
                                                max_tokens_limit = 64000
                                                logger.info(f"Using max_tokens limit of {max_tokens_limit} for {model_name}")
                                            elif "-sonnet-" in model_name:
                                                max_tokens_limit = 64000
                                                logger.info(f"Using max_tokens limit of {max_tokens_limit} for {model_name}")
                                            elif "-haiku-" in model_name:
                                                max_tokens_limit = 32000
                                                logger.info(f"Using max_tokens limit of {max_tokens_limit} for {model_name}")
                                            
                                            # Set max_tokens parameter with appropriate limit
                                            if "max_tokens" in kwargs_copy:
                                                original = kwargs_copy["max_tokens"]
                                                kwargs_copy["max_tokens"] = min(original, max_tokens_limit)
                                                if original != kwargs_copy["max_tokens"]:
                                                    logger.info(f"Adjusted max_tokens from {original} to {kwargs_copy['max_tokens']}")
                                            else:
                                                # Use a safe default value lower than the limit
                                                safe_default = min(4096, max_tokens_limit // 2)
                                                kwargs_copy["max_tokens"] = safe_default
                                                logger.info(f"Using default max_tokens={safe_default}")
                                            
                                            # Handle temperature parameter (defaults to 0.7 in Claude API)
                                            if "temperature" not in kwargs_copy:
                                                kwargs_copy["temperature"] = 0.7
                                                
                                            # Add user parameter if we don't have one
                                            # Claude requires exactly one of user or tool_id
                                            if "user" not in kwargs_copy:
                                                kwargs_copy["user"] = "magi-system"
                                            
                                            # Some parameters in the OpenAI Agents framework aren't supported
                                            # directly by Claude. Map or filter them as needed.
                                            filtered_params = {
                                                k: v for k, v in kwargs_copy.items() 
                                                if k in [
                                                    "model", "messages", "max_tokens", "temperature", 
                                                    "top_p", "user", "stream"
                                                ]
                                            }
                                            
                                            # Update with safely filtered parameters
                                            params.update(filtered_params)
                                            logger.info(f"Using filtered parameters for Claude: {list(filtered_params.keys())}")
                                    elif provider == "google" and GEMINI_AVAILABLE:
                                        # For Gemini models, use the native Google GenerativeAI library
                                        try:
                                            # Get a direct response using the Google GenerativeAI library
                                            logger.info(f"Using direct Google GenerativeAI library call for {model_name}")
                                            
                                            # Get max_tokens from agent if available
                                            max_tokens = kwargs_copy.get("max_tokens", 4096)
                                            
                                            # Check if the agent has max_tokens set in agent definition
                                            if hasattr(new_agent, 'max_tokens'):
                                                logger.info(f"Using max_tokens from agent attribute: {new_agent.max_tokens}")
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
                                            
                                            logger.info(f"Using max_tokens={max_tokens} for Gemini API call")
                                            
                                            # Create special kwargs for Gemini
                                            gemini_kwargs = {
                                                "max_tokens": max_tokens,
                                                "temperature": kwargs_copy.get("temperature", 0.7)
                                            }
                                            
                                            response = await call_gemini_directly(
                                                model_name=model_name,
                                                system_message=system_message,
                                                user_message=input_text,
                                                **gemini_kwargs
                                            )
                                            return response
                                        except Exception as e:
                                            # Log error and continue with generic approach
                                            logger.error(f"Error using Google GenerativeAI library directly: {str(e)}")
                                            logger.info("Falling back to generic API approach for Gemini")
                                            
                                            # Handle Gemini-specific parameter adjustments
                                            logger.info(f"Handling special parameters for Gemini model: {model_name}")
                                            
                                            # Adjust max_tokens based on model
                                            max_tokens_limit = 4096  # Default
                                            if "gemini-2.0-ultra" in model_name:
                                                max_tokens_limit = 16384
                                            elif "gemini-2.0-pro" in model_name:
                                                max_tokens_limit = 16384
                                            elif "gemini-pro" in model_name:
                                                max_tokens_limit = 8192
                                            
                                            # Apply max_tokens limit
                                            if "max_tokens" in kwargs_copy:
                                                original = kwargs_copy["max_tokens"]
                                                kwargs_copy["max_tokens"] = min(original, max_tokens_limit)
                                                if original != kwargs_copy["max_tokens"]:
                                                    logger.info(f"Adjusted max_tokens from {original} to {kwargs_copy['max_tokens']}")
                                            else:
                                                # Use a safe default
                                                safe_default = min(4096, max_tokens_limit // 2)
                                                kwargs_copy["max_tokens"] = safe_default
                                                logger.info(f"Using default max_tokens={safe_default}")
                                            
                                            # Filter parameters for Gemini
                                            filtered_params = {
                                                k: v for k, v in kwargs_copy.items()
                                                if k in [
                                                    "model", "messages", "max_tokens", "temperature",
                                                    "top_p", "user"
                                                ]
                                            }
                                            
                                            # Update with filtered parameters
                                            params.update(filtered_params)
                                            logger.info(f"Using filtered parameters for Gemini: {list(filtered_params.keys())}")
                                            
                                    elif provider == "xai" and GROK_AVAILABLE:
                                        # For Grok models, use the direct API call
                                        try:
                                            # Get a direct response using the X.AI API
                                            logger.info(f"Using direct X.AI API call for {model_name}")
                                            
                                            # Get max_tokens from agent if available
                                            max_tokens = kwargs_copy.get("max_tokens", 4096)
                                            
                                            # Check if the agent has max_tokens set in agent definition
                                            if hasattr(new_agent, 'max_tokens'):
                                                logger.info(f"Using max_tokens from agent attribute: {new_agent.max_tokens}")
                                                max_tokens = new_agent.max_tokens
                                            
                                            # Set limits based on model
                                            if "grok-2" in model_name:
                                                max_tokens = min(max_tokens, 8192)
                                            else:
                                                max_tokens = min(max_tokens, 4096)
                                            
                                            logger.info(f"Using max_tokens={max_tokens} for Grok API call")
                                            
                                            # Create special kwargs for Grok
                                            grok_kwargs = {
                                                "max_tokens": max_tokens,
                                                "temperature": kwargs_copy.get("temperature", 0.7)
                                            }
                                            
                                            response = await call_grok_directly(
                                                model_name=model_name,
                                                system_message=system_message,
                                                user_message=input_text,
                                                **grok_kwargs
                                            )
                                            return response
                                        except Exception as e:
                                            # Log error and continue with generic approach
                                            logger.error(f"Error using X.AI API directly: {str(e)}")
                                            logger.info("Falling back to generic API approach for Grok")
                                            
                                            # Handle Grok-specific parameter adjustments
                                            logger.info(f"Handling special parameters for Grok model: {model_name}")
                                            
                                            # Adjust max_tokens based on model
                                            max_tokens_limit = 4096  # Default
                                            if "grok-2" in model_name:
                                                max_tokens_limit = 8192
                                            
                                            # Apply max_tokens limit
                                            if "max_tokens" in kwargs_copy:
                                                original = kwargs_copy["max_tokens"]
                                                kwargs_copy["max_tokens"] = min(original, max_tokens_limit)
                                                if original != kwargs_copy["max_tokens"]:
                                                    logger.info(f"Adjusted max_tokens from {original} to {kwargs_copy['max_tokens']}")
                                            else:
                                                # Use a safe default
                                                safe_default = min(4096, max_tokens_limit // 2)
                                                kwargs_copy["max_tokens"] = safe_default
                                                logger.info(f"Using default max_tokens={safe_default}")
                                            
                                            # Filter parameters for Grok
                                            filtered_params = {
                                                k: v for k, v in kwargs_copy.items()
                                                if k in [
                                                    "model", "messages", "max_tokens", "temperature",
                                                    "top_p", "user"
                                                ]
                                            }
                                            
                                            # Update with filtered parameters
                                            params.update(filtered_params)
                                            logger.info(f"Using filtered parameters for Grok: {list(filtered_params.keys())}")
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
                            
                            # Log success
                            logger.info(f"Got successful response from {model_name}")
                            
                            # Now yield this as a single event instead of streaming
                            class SimpleResponseEvent:
                                def __init__(self, content, model):
                                    self.content = content
                                    self.model = model
                                    self.type = "message"
                                    
                                def __str__(self):
                                    return self.content
                            
                            # Extract content from the message
                            content = response.choices[0].message.content or ""
                            
                            # Yield a simple event
                            yield SimpleResponseEvent(content=content, model=model_name)
                            
                        except Exception as e:
                            # Log the error
                            logger.error(f"Error with our simple run implementation: {str(e)}")
                            # Re-raise to try the next model
                            raise

                        # If we get here without exception, streaming was successful
                        logger.info(f"Successfully completed streaming with model {model_name}")
                        return

                    except Exception as e:
                        # Get the full exception info for debugging
                        error_detail = traceback.format_exc()

                        # Add to our logs
                        self.error_logs.append(f"Error with model {model_name} (attempt {retries + 1}): {str(e)}")
                        logger.error(f"Streaming error with {model_name}: {str(e)}")
                        logger.debug(f"Exception details: {error_detail}")

                        # Increment retry counter
                        retries += 1

                        if retries <= max_retries:
                            # Delay with backoff before retry
                            wait_time = retry_delay * retries
                            logger.info(f"Retrying in {wait_time} seconds...")
                            await asyncio.sleep(wait_time)
                        else:
                            # Out of retries for this model
                            logger.error(f"Failed all {max_retries + 1} attempts with model {model_name}")
                            break

            # If we get here, all models failed
            error_summary = "\n".join(self.error_logs)
            error_msg = f"All models failed during streaming. Attempted models: {', '.join(tried_models)}.\nError logs:\n{error_summary}"
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

    # Check and log available API keys
    for provider, env_var in PROVIDER_API_KEY_ENV_VARS.items():
        api_key = os.environ.get(env_var)
        if api_key:
            logger.info(f"Found API key for {provider} ({env_var})")
        else:
            logger.warning(f"No API key found for {provider} ({env_var})")

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

    logger.info(f"Set up model providers with primary provider: {primary_provider}")
    logger.info(f"Agent model assignments:")
    for env_var, model in agent_model_defaults.items():
        actual_model = os.environ.get(env_var, model)
        agent_type = env_var.replace("MAGI_", "").replace("_MODEL", "").lower()
        logger.info(f"  {agent_type.capitalize()}: {actual_model}")

    # Add a special check for models that will actually be used
    logger.info("Checking model availability for assigned models:")
    for env_var, default_value in agent_model_defaults.items():
        actual_model = os.environ.get(env_var, default_value)
        provider = MODEL_TO_PROVIDER.get(actual_model)

        if not provider:
            logger.warning(f"  No provider defined for {actual_model} (used by {env_var})")
            continue

        if provider not in client_manager.available_providers:
            logger.warning(f"  {actual_model} requires {provider} provider which is not available")

            # Check if fallbacks are available
            fallbacks = client_manager.available_fallbacks(actual_model)
            if fallbacks:
                logger.info(f"  Fallbacks available: {', '.join(fallbacks)}")
            else:
                logger.warning(f"  No fallbacks available for {actual_model}!")
        else:
            logger.info(f"  {actual_model} is available (provider: {provider})")

    # Log final summary
    logger.info(f"Retry configuration: max_retries={max_retries}, timeout={timeout}s")

    # Apply the patch to Runner.run for fallback support
    apply_runner_patch()
