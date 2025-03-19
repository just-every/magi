"""
Common tools for MAGI agents.

This module provides a collection of tools that can be used by any agent in the MAGI system.
Tools are registered using the function_tool decorator which automatically handles
format conversion for different model providers.
"""

import sys
import os
import math
import logging
import datetime
from typing import Dict, List, Any, Optional, Union

# Configure module path to ensure imports work correctly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents import function_tool

# Core tools available to all agents

@function_tool
def calculator(operation: str, a: float, b: float) -> Dict[str, Any]:
    """
    A simple calculator that can add, subtract, multiply, or divide two numbers.
    
    Args:
        operation: The operation to perform (add, subtract, multiply, divide, power, sqrt, log)
        a: The first operand
        b: The second operand (not used for sqrt operations)
        
    Returns:
        Dictionary containing the result and a description of the operation
    """
    result = None
    description = ""
    
    # Perform the requested operation
    if operation == "add":
        result = a + b
        description = f"{a} + {b} = {result}"
    elif operation == "subtract":
        result = a - b
        description = f"{a} - {b} = {result}"
    elif operation == "multiply":
        result = a * b
        description = f"{a} × {b} = {result}"
    elif operation == "divide":
        if b == 0:
            raise ValueError("Cannot divide by zero")
        result = a / b
        description = f"{a} ÷ {b} = {result}"
    elif operation == "power":
        result = a ** b
        description = f"{a}^{b} = {result}"
    elif operation == "sqrt":
        if a < 0:
            raise ValueError("Cannot take square root of negative number")
        result = math.sqrt(a)
        description = f"√{a} = {result}"
    elif operation == "log":
        if a <= 0 or b <= 0 or b == 1:
            raise ValueError("Invalid logarithm parameters")
        result = math.log(a, b)
        description = f"log_{b}({a}) = {result}"
    else:
        raise ValueError(f"Unknown operation: {operation}")
    
    return {
        "result": result,
        "description": description
    }

@function_tool
def today(format: str = "%Y-%m-%d") -> Dict[str, Any]:
    """
    Get today's date in the specified format.
    
    Args:
        format: Date format string (default: "%Y-%m-%d")
        
    Returns:
        Dictionary containing date information
    """
    today = datetime.datetime.now()
    formatted_date = today.strftime(format)
    
    weekday = today.strftime("%A")
    month = today.strftime("%B")
    
    return {
        "date": formatted_date,
        "weekday": weekday,
        "month": month,
        "year": today.year,
        "month_num": today.month,
        "day": today.day
    }

@function_tool(name="currency_converter", description="Converts between different currencies using current exchange rates")
def convert_currency(amount: float, from_currency: str, to_currency: str) -> Dict[str, Any]:
    """
    Convert between different currencies using fixed exchange rates.
    
    Args:
        amount: The amount to convert
        from_currency: The source currency code (USD, EUR, GBP, JPY, etc.)
        to_currency: The target currency code
        
    Returns:
        Dictionary containing the converted amount and rate information
    """
    # Example exchange rates (fixed for demo purposes)
    rates = {
        "USD": 1.0,     # US Dollar (base)
        "EUR": 0.92,    # Euro
        "GBP": 0.79,    # British Pound
        "JPY": 149.5,   # Japanese Yen
        "CAD": 1.35,    # Canadian Dollar
        "AUD": 1.52,    # Australian Dollar
        "CHF": 0.88,    # Swiss Franc
        "CNY": 7.21,    # Chinese Yuan
        "INR": 83.1,    # Indian Rupee
        "MXN": 16.8,    # Mexican Peso
    }
    
    # Check if currencies are supported
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()
    
    if from_currency not in rates:
        raise ValueError(f"Currency not supported: {from_currency}")
    if to_currency not in rates:
        raise ValueError(f"Currency not supported: {to_currency}")
        
    # Convert to USD first, then to target currency
    amount_in_usd = amount / rates[from_currency]
    amount_in_target = amount_in_usd * rates[to_currency]
    
    # Calculate the exchange rate
    exchange_rate = rates[to_currency] / rates[from_currency]
    
    return {
        "converted_amount": round(amount_in_target, 2),
        "exchange_rate": round(exchange_rate, 6),
        "from_currency": from_currency,
        "to_currency": to_currency,
        "original_amount": amount
    }

# Get all available tools in this module as a list
def get_common_tools() -> List:
    """Get all common tools defined in this module as a list."""
    import inspect
    import sys
    
    # Get all functions in this module that have been decorated with function_tool
    module = sys.modules[__name__]
    tools = []
    
    for name, obj in inspect.getmembers(module):
        if callable(obj) and hasattr(obj, 'params_json_schema'):
            tools.append(obj)
            
    return tools