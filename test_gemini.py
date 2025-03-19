import os
import google.generativeai as genai

def test_google_api_key():
    # Get API key from environment
    api_key = os.environ.get("GOOGLE_API_KEY")
    
    if not api_key:
        print("ERROR: GOOGLE_API_KEY environment variable not set")
        return False
    
    print(f"Found API key (length: {len(api_key)})")
    
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
                    response = model.generate_content("Respond with a single word: Hello")
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
    test_google_api_key()