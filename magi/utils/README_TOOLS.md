# MAGI Cross-Model Tool Usage

This document explains how tool usage works across different model providers in the MAGI system.

## Supported Models

Tools are supported for the following model providers:

- **OpenAI**: All models natively support tools using the OpenAI function calling format
- **X.AI (Grok)**: Uses the same format as OpenAI
- **Anthropic (Claude)**: Uses a custom format that varies by model version
- **Google (Gemini)**: Uses a modified format with specific type requirements

## Tool Registration

There are several ways to register and format tools in MAGI:

1. **Decorator Method (Recommended)**

   The simplest way to create tools is using the `@register_tool` decorator:
   
   ```python
   from magi.utils.model_provider import register_tool
   
   @register_tool
   def calculator(operation: str, a: float, b: float) -> float:
       """
       A simple calculator that can add, subtract, multiply, or divide two numbers.
       
       Args:
           operation: The operation to perform (add, subtract, multiply, divide)
           a: The first operand
           b: The second operand
           
       Returns:
           float: The result of the operation
       """
       if operation == "add":
           return a + b
       # etc...
   ```
   
   The decorator automatically adds an `openai_schema()` method to the function.

2. **Direct Schema Definition**

   You can also create tools using the OpenAI schema directly:
   
   ```python
   CALCULATOR_TOOL = {
       "type": "function",
       "function": {
           "name": "calculator",
           "description": "A simple calculator",
           "parameters": {
               "type": "object",
               "properties": {
                   "operation": {
                       "type": "string",
                       "description": "The operation to perform"
                   },
                   # ...
               },
               "required": ["operation", "a", "b"]
           }
       }
   }
   ```

## Format Conversion

Tools are automatically converted to the appropriate format for each model:

- **OpenAI & Grok**: No conversion needed (native format)
- **Claude**: Uses `"type": "custom"` with parameters excluding the top-level `"type": "object"`
- **Gemini**: Uses `"function_declarations"` and changes types to uppercase (STRING, NUMBER, etc.)

The `convert_tools_for_provider()` function handles this conversion automatically.

## Usage in MAGI

When an agent needs to use tools, the system:

1. Extracts the tools from the agent
2. Converts them to the format required by the model being used
3. Passes them to the appropriate API
4. Processes the responses and converts tool calls to a standardized format

To use tools in your agent, simply define functions with the decorator or schema and add them to the agent's tools attribute.

## Debugging Tool Usage

Use the `test_tools.py` script to test tool usage across different models:

```bash
python test/test_tools.py
```

This will test tool conversion and usage for all available model providers.

## Tips for Effective Tool Use

1. Make sure tool descriptions and parameter descriptions are clear
2. For Claude, keep the tool format simple and use the custom type
3. For Gemini, ensure complex nested structures use uppercase types consistently
4. If tools aren't being used, try making the system prompt more explicit about tool usage
5. Test tools thoroughly with the `test_tools.py` script before using them in production