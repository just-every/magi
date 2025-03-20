"""
Simple calculator tool example using the function_tool decorator.

This module demonstrates how to create and register tools for MAGI using
the function_tool decorator from the OpenAI Agents framework.
These tools will work across all model providers.
"""
import sys
import os

# Add the parent directory to sys.path to allow importing magi modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents import function_tool

@function_tool
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
    elif operation == "subtract":
        return a - b
    elif operation == "multiply":
        return a * b
    elif operation == "divide":
        if b == 0:
            raise ValueError("Cannot divide by zero")
        return a / b
    else:
        raise ValueError(f"Unknown operation: {operation}")

# Example of more advanced usage with parameter overrides
@function_tool(name="currency_converter", description="Converts between different currencies using current exchange rates")
def convert_currency(amount: float, from_currency: str, to_currency: str) -> float:
    """
    This is just a demo function for example purposes. In a real implementation,
    this would call an API to get current exchange rates.
    """
    # Example exchange rates (fixed for demo purposes)
    rates = {
        "USD": 1.0,     # US Dollar (base)
        "EUR": 0.92,    # Euro
        "GBP": 0.79,    # British Pound
        "JPY": 149.5,   # Japanese Yen
        "CAD": 1.35,    # Canadian Dollar
    }
    
    # Check if currencies are supported
    if from_currency not in rates:
        raise ValueError(f"Currency not supported: {from_currency}")
    if to_currency not in rates:
        raise ValueError(f"Currency not supported: {to_currency}")
        
    # Convert to USD first, then to target currency
    amount_in_usd = amount / rates[from_currency]
    amount_in_target = amount_in_usd * rates[to_currency]
    
    return amount_in_target

# Print the OpenAI schema for the calculator tool (for debugging)
if __name__ == "__main__":
    import json
    
    print("\nCalculator tool schema:")
    print(json.dumps(calculator.openai_schema(), indent=2))
    
    print("\nCurrency converter tool schema:")
    print(json.dumps(convert_currency.openai_schema(), indent=2))