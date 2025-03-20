# MAGI System Tool Support for Multiple Providers

This document explains how the MAGI system implements tool/function calling for different model providers.

## Overview

The MAGI system now supports tool usage (function calling) across all major providers:

- **OpenAI**: Native support via their API
- **Anthropic Claude**: Custom format conversion required
- **Google Gemini**: Type conversion required (uppercase types)
- **X.AI Grok**: Compatible with OpenAI format

## How It Works

1. Tools are defined in the standard OpenAI format
2. When making API calls, tools are automatically converted to the format required by each provider
3. When processing responses, tool calls are extracted and converted back to a standardized format

## Key Components

- **model_provider.py**: Contains the implementation for cross-provider tool support
- **call_*_directly functions**: Handle direct API calls to each provider
- **convert_tools_for_provider**: Converts tools to provider-specific formats
- **get_tools_for_model**: High-level utility to get tools for a specific model

## Testing

Use the provided test scripts to verify tool functionality:

```bash
# Test all models
./test/test_all_tools.sh

# Test a specific model
python test/test_tool.py claude-3-5-haiku-latest
```

## Model-Specific Notes

### Claude (Anthropic)

- Claude 3.7 models use "type": "function"
- Other Claude models use "type": "custom"
- The top-level "type": "object" must be removed from parameters
- Required and properties fields must be included

### Gemini (Google)

- Types must be uppercase (NUMBER instead of number)
- The tool format uses function_declarations
- For parameter validation, type must be OBJECT

### Grok (X.AI)

- Compatible with OpenAI format
- No conversion needed

## Fallback Mechanism

The system includes a robust fallback mechanism:

1. First tries to use the requested model with tools
2. If that fails, falls back to the same model without tools
3. If both fail, tries alternative models from the same provider
4. If those fail, tries models from other providers

## Troubleshooting

If tools aren't working properly:

1. Check format conversion in the appropriate functions
2. Look for error messages in the logs
3. Verify the model supports tool calling
4. Use the test_tool.py script to isolate the issue