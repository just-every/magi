#!/usr/bin/env python3
"""
Test script for Google's Gemini API to identify available models.
"""
import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get API key
api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    print("No GOOGLE_API_KEY environment variable found. Please set it and try again.")
    exit(1)

# Configure the API
genai.configure(api_key=api_key)

def print_available_models():
    """Print all available models from the Google API."""
    print("Querying available models...")
    try:
        models = genai.list_models()
        model_names = [model.name for model in models]
        print(f"Available models: {model_names}")
        
        # Print detailed model information
        print("\nDetailed model information:")
        for model in models:
            model_dict = {
                "name": model.name,
                "display_name": model.display_name,
                "description": model.description,
                "input_token_limit": getattr(model, "input_token_limit", "N/A"),
                "output_token_limit": getattr(model, "output_token_limit", "N/A"),
                "supported_generation_methods": getattr(model, "supported_generation_methods", "N/A"),
            }
            print(json.dumps(model_dict, indent=2))
            print("-" * 40)
    except Exception as e:
        print(f"Error listing models: {str(e)}")
        
def test_model(model_name):
    """Test a specific model with a simple prompt."""
    print(f"\nTesting model: {model_name}")
    try:
        model = genai.GenerativeModel(model_name)
        
        # Create a simple prompt
        prompt = "Hello, how are you today?"
        
        print(f"Sending prompt: '{prompt}'")
        response = model.generate_content(prompt)
        
        print("\nResponse:")
        print(response.text)
        
        # Test chat functionality
        print("\nTesting chat functionality:")
        chat = model.start_chat(history=[])
        chat_response = chat.send_message("Tell me a short joke")
        
        print("\nChat response:")
        print(chat_response.text)
        
    except Exception as e:
        print(f"Error testing model {model_name}: {str(e)}")

if __name__ == "__main__":
    # Print available models
    print_available_models()
    
    # Test some specific models based on the available models
    try:
        # Get available models first
        models = genai.list_models()
        model_names = [model.name for model in models]
        
        # Test the first text model we find
        text_models = [model.name for model in models if "generateContent" in getattr(model, "supported_generation_methods", [])]
        if text_models:
            test_model(text_models[0])
    except Exception as e:
        print(f"Error during model testing: {str(e)}")