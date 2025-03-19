import os
import sys
import asyncio
import logging
from magi.utils.model_provider import setup_retry_and_fallback_provider, call_gemini_directly

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("test_fallback")

async def test_direct_gemini_call():
    # Test direct call to Gemini API
    logger.info("Testing direct Gemini API call")
    
    system_message = """You are MAGI, a helpful AI assistant. When asked about what model you are, 
    respond truthfully by stating that you are a Gemini model."""
    
    user_message = "what model are you"
    
    try:
        # Try calling Gemini directly
        # This mimics how the agent system calls the API
        model_name = "gemini-2.0-flash"
        logger.info(f"Calling Gemini API directly with model {model_name}")
        
        # Use the actual function from the model_provider module
        response = await call_gemini_directly(
            model_name=model_name,
            system_message=system_message,
            user_message=user_message,
            max_tokens=4096,
            temperature=0.7
        )
        
        # Log detailed response information
        logger.info(f"Response type: {type(response)}")
        logger.info(f"Response: {response}")
        
        # Extract content from the response using various methods
        content = None
        
        # Method 1: Direct access to OpenAI-like structure
        if hasattr(response, 'choices') and len(response.choices) > 0:
            if hasattr(response.choices[0], 'message') and hasattr(response.choices[0].message, 'content'):
                content = response.choices[0].message.content
                logger.info(f"Method 1 content: {content}")
        
        # If that failed, try to extract content from response.text or other attributes
        if not content:
            if hasattr(response, 'text'):
                content = response.text
                logger.info(f"Method 2 content: {content}")
        
        # If all else fails, try string representation
        if not content:
            try:
                content = str(response)
                logger.info(f"Method 3 content: {content}")
            except:
                pass
        
        logger.info(f"Final extracted content: {content}")
        
        if content:
            return True
        else:
            logger.error("Failed to extract content from response")
            return False
    
    except Exception as e:
        logger.error(f"Error calling Gemini API: {str(e)}")
        return False

async def main():
    logger.info("Setting up retry and fallback provider")
    setup_retry_and_fallback_provider()
    
    logger.info("Testing direct Gemini API call")
    success = await test_direct_gemini_call()
    
    if success:
        logger.info("TEST PASSED: Successfully called Gemini API")
    else:
        logger.error("TEST FAILED: Failed to call Gemini API")

if __name__ == "__main__":
    asyncio.run(main())