import os
import sys
import google.generativeai as genai
from typing import Dict, Any

def test_with_agent_config():
    """Test Gemini API using similar configuration to the MAGI agent system."""
    # Get API key from environment
    api_key = os.environ.get("GOOGLE_API_KEY")
    
    if not api_key:
        print("ERROR: GOOGLE_API_KEY environment variable not set")
        return False
    
    print(f"Found API key (length: {len(api_key)})")
    print(f"Key: {api_key[:5]}...{api_key[-5:]}")
    
    # Configure the API with the key
    genai.configure(api_key=api_key)
    
    try:
        # Test listing available models
        print("Listing available models...")
        models = genai.list_models()
        available_models = [model.name for model in models]
        print(f"Available Gemini models: {available_models}")
        
        # Use system message and user message format similar to the agent
        system_message = """You are MAGI, a helpful AI assistant. When asked about what model you are, 
        respond truthfully by stating that you are a Gemini model."""
        
        user_message = "what model are you"
        
        # Create combined content (similar to agent code)
        content = f"{system_message}\n\n{user_message}"
        print(f"\nContent length: {len(content)}")
        print(f"Content: {content}")
        
        # Configure generation parameters (similar to agent code)
        generation_config = {
            "max_output_tokens": 4096,
            "temperature": 0.7,
        }
        
        # Configure safety settings (similar to agent code)
        safety_settings = {
            "HARASSMENT": "BLOCK_NONE",
            "HATE": "BLOCK_NONE",
            "SEXUAL": "BLOCK_NONE",
            "DANGEROUS": "BLOCK_NONE",
        }
        
        # Try with models that worked in our simple test
        gemini_models_to_test = [
            "models/gemini-2.0-flash",
            "models/gemini-1.5-flash",
            "models/gemini-1.5-pro"
        ]
        
        for model_name in gemini_models_to_test:
            if model_name in available_models:
                print(f"\nTesting {model_name} with agent-like configuration...")
                try:
                    model = genai.GenerativeModel(model_name)
                    
                    # Log parameters
                    print(f"Parameters:")
                    print(f"  Generation config: {generation_config}")
                    print(f"  Safety settings: {safety_settings}")
                    print(f"  Content length: {len(content)}")
                    
                    # Generate content
                    response = model.generate_content(
                        content,
                        generation_config=generation_config,
                        safety_settings=safety_settings
                    )
                    
                    # Log response structure
                    print(f"Response type: {type(response)}")
                    
                    # Check response attributes
                    print(f"Response has text attribute: {hasattr(response, 'text')}")
                    if hasattr(response, 'text'):
                        print(f"Response text: {response.text}")
                    
                    print(f"Response has candidates: {hasattr(response, 'candidates')}")
                    if hasattr(response, 'candidates') and response.candidates:
                        print(f"Number of candidates: {len(response.candidates)}")
                        
                        # Extract content from candidates
                        content_text = ""
                        if hasattr(response.candidates[0], 'content'):
                            if hasattr(response.candidates[0].content, 'parts'):
                                parts = response.candidates[0].content.parts
                                print(f"Number of parts: {len(parts)}")
                                for part in parts:
                                    if hasattr(part, 'text'):
                                        content_text += part.text
                                    else:
                                        part_str = str(part)
                                        content_text += part_str
                        
                        print(f"Extracted content: {content_text}")
                    
                    # Extract content using various methods
                    methods = [
                        "response.text if hasattr(response, 'text') else None",
                        "response.candidates[0].content.parts[0].text if hasattr(response, 'candidates') and response.candidates and hasattr(response.candidates[0], 'content') and hasattr(response.candidates[0].content, 'parts') and response.candidates[0].content.parts else None",
                        "str(response)"
                    ]
                    
                    for method in methods:
                        try:
                            result = eval(method)
                            print(f"Method {method}: {result}")
                        except Exception as method_error:
                            print(f"Method {method} error: {str(method_error)}")
                    
                    print(f"SUCCESS: {model_name} is working!")
                except Exception as model_error:
                    print(f"ERROR with {model_name}: {str(model_error)}")
            else:
                print(f"\n{model_name} not in available models list")
        
        return True
        
    except Exception as e:
        print(f"ERROR: Failed to use Google API: {str(e)}")
        return False

if __name__ == "__main__":
    print("Python version:", sys.version)
    print("Testing Gemini with agent-like configuration...")
    test_with_agent_config()