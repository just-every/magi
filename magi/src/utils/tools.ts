/**
 * Common tools for MAGI agents.
 * 
 * This module provides a collection of tools that can be used by any agent in the MAGI system.
 * Tools are defined with a standardized format compatible with OpenAI's function calling.
 */

import { ToolDefinition } from '../types.js';

/**
 * Calculator tool definition
 */
export const calculatorTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'calculator',
    description: 'A simple calculator that can add, subtract, multiply, or divide two numbers.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          description: 'The operation to perform (add, subtract, multiply, divide, power, sqrt, log)',
          enum: ['add', 'subtract', 'multiply', 'divide', 'power', 'sqrt', 'log']
        },
        a: {
          type: 'number',
          description: 'The first operand'
        },
        b: {
          type: 'number',
          description: 'The second operand (not used for sqrt operations)'
        }
      },
      required: ['operation', 'a', 'b']
    }
  }
};

/**
 * Today date tool definition
 */
export const todayTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'today',
    description: "Get today's date in the specified format.",
    parameters: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: 'Date format string (default: "%Y-%m-%d")'
        }
      },
      required: []
    }
  }
};

/**
 * Currency converter tool definition
 */
export const currencyConverterTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'currency_converter',
    description: 'Converts between different currencies using current exchange rates',
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'The amount to convert'
        },
        from_currency: {
          type: 'string',
          description: 'The source currency code (USD, EUR, GBP, JPY, etc.)'
        },
        to_currency: {
          type: 'string',
          description: 'The target currency code'
        }
      },
      required: ['amount', 'from_currency', 'to_currency']
    }
  }
};

/**
 * Calculator tool implementation
 */
export function calculator(
  operation: string,
  a: number,
  b: number
): { result: number; description: string } {
  let result: number;
  let description: string;
  
  // Perform the requested operation
  switch (operation) {
    case 'add':
      result = a + b;
      description = `${a} + ${b} = ${result}`;
      break;
    case 'subtract':
      result = a - b;
      description = `${a} - ${b} = ${result}`;
      break;
    case 'multiply':
      result = a * b;
      description = `${a} × ${b} = ${result}`;
      break;
    case 'divide':
      if (b === 0) {
        throw new Error('Cannot divide by zero');
      }
      result = a / b;
      description = `${a} ÷ ${b} = ${result}`;
      break;
    case 'power':
      result = Math.pow(a, b);
      description = `${a}^${b} = ${result}`;
      break;
    case 'sqrt':
      if (a < 0) {
        throw new Error('Cannot take square root of negative number');
      }
      result = Math.sqrt(a);
      description = `√${a} = ${result}`;
      break;
    case 'log':
      if (a <= 0 || b <= 0 || b === 1) {
        throw new Error('Invalid logarithm parameters');
      }
      result = Math.log(a) / Math.log(b);
      description = `log_${b}(${a}) = ${result}`;
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  
  return {
    result,
    description
  };
}

/**
 * Today date tool implementation
 */
export function today(
  format: string = '%Y-%m-%d'
): { date: string; weekday: string; month: string; year: number; month_num: number; day: number } {
  const now = new Date();
  
  // Format the date based on the provided format
  // Simple format replacement for common patterns
  let formatted = format
    .replace('%Y', now.getFullYear().toString())
    .replace('%m', (now.getMonth() + 1).toString().padStart(2, '0'))
    .replace('%d', now.getDate().toString().padStart(2, '0'))
    .replace('%H', now.getHours().toString().padStart(2, '0'))
    .replace('%M', now.getMinutes().toString().padStart(2, '0'))
    .replace('%S', now.getSeconds().toString().padStart(2, '0'));
  
  // Get day and month names
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  
  return {
    date: formatted,
    weekday,
    month,
    year: now.getFullYear(),
    month_num: now.getMonth() + 1,
    day: now.getDate()
  };
}

/**
 * Currency converter tool implementation
 */
export function convertCurrency(
  amount: number,
  from_currency: string,
  to_currency: string
): { converted_amount: number; exchange_rate: number; from_currency: string; to_currency: string; original_amount: number } {
  // Example exchange rates (fixed for demo purposes)
  const rates: Record<string, number> = {
    'USD': 1.0,     // US Dollar (base)
    'EUR': 0.92,    // Euro
    'GBP': 0.79,    // British Pound
    'JPY': 149.5,   // Japanese Yen
    'CAD': 1.35,    // Canadian Dollar
    'AUD': 1.52,    // Australian Dollar
    'CHF': 0.88,    // Swiss Franc
    'CNY': 7.21,    // Chinese Yuan
    'INR': 83.1,    // Indian Rupee
    'MXN': 16.8,    // Mexican Peso
  };
  
  // Normalize currency codes
  from_currency = from_currency.toUpperCase();
  to_currency = to_currency.toUpperCase();
  
  // Check if currencies are supported
  if (!rates[from_currency]) {
    throw new Error(`Currency not supported: ${from_currency}`);
  }
  
  if (!rates[to_currency]) {
    throw new Error(`Currency not supported: ${to_currency}`);
  }
  
  // Convert to USD first, then to target currency
  const amount_in_usd = amount / rates[from_currency];
  const amount_in_target = amount_in_usd * rates[to_currency];
  
  // Calculate the exchange rate
  const exchange_rate = rates[to_currency] / rates[from_currency];
  
  return {
    converted_amount: parseFloat(amount_in_target.toFixed(2)),
    exchange_rate: parseFloat(exchange_rate.toFixed(6)),
    from_currency,
    to_currency,
    original_amount: amount
  };
}

/**
 * Get all common tools as an array of tool definitions
 */
export function getCommonTools(): ToolDefinition[] {
  return [
    calculatorTool,
    todayTool,
    currencyConverterTool
  ];
}

/**
 * Tool implementations mapped by name for easy lookup
 */
export const toolImplementations: Record<string, Function> = {
  'calculator': calculator,
  'today': today,
  'currency_converter': convertCurrency
};