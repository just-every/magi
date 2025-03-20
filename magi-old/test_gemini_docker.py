import os
import sys
import google.generativeai as genai

def test_google_api_key():
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
        
        # Try models we're interested in
        gemini_models_to_test = [
            "models/gemini-2.0-flash",
            "models/gemini-1.5-flash",
            "models/gemini-1.5-pro"
        ]
        
        for model_name in gemini_models_to_test:
            if model_name in available_models:
                print(f"\nTesting a simple completion with {model_name}...")
                try:
                    model = genai.GenerativeModel(model_name)
                    safety_settings = {
                        "HARASSMENT": "BLOCK_NONE",
                        "HATE": "BLOCK_NONE",
                        "SEXUAL": "BLOCK_NONE",
                        "DANGEROUS": "BLOCK_NONE",
                    }
                    response = model.generate_content(
                        "Respond with a single word: Hello",
                        safety_settings=safety_settings
                    )
                    print(f"Response: {response.text}")
                    print(f"SUCCESS: {model_name} is working!")
                except Exception as model_error:
                    print(f"ERROR with {model_name}: {str(model_error)}")
            else:
                print(f"\n{model_name} not in available models list")
        
        print("\nAPI KEY IS VALID, BUT SOME MODELS MAY NOT BE AVAILABLE")
        return True
        
    except Exception as e:
        print(f"ERROR: Failed to use Google API: {str(e)}")
        return False

if __name__ == "__main__":
    print("Python version:", sys.version)
    print("Environment variables:")
    for key in sorted(os.environ.keys()):
        if "KEY" in key:
            value = os.environ[key]
            print(f"  {key}: {value[:3]}...{value[-3:]}" if value else f"  {key}: (empty)")
        elif key.startswith("MAGI_"):
            print(f"  {key}: {os.environ[key]}")
    test_google_api_key()