#!/bin/bash

# Test script for Telegram integration
# Usage: ./telegram-test.sh "Your message here"

if [ -z "$1" ]; then
  echo "Please provide a message to send to Telegram."
  echo "Usage: ./telegram-test.sh \"Your message here\""
  exit 1
fi

MESSAGE=$1

cd "$(dirname "$0")/.."

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Check if Telegram token is set
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "Error: TELEGRAM_BOT_TOKEN is not set in your .env file."
  exit 1
fi

# Print token length for debugging (don't show the actual token)
TOKEN_LENGTH=${#TELEGRAM_BOT_TOKEN}
echo "Bot token length: $TOKEN_LENGTH characters"
if [[ $TOKEN_LENGTH -lt 20 ]]; then
  echo "Warning: Token seems too short. Tokens are usually longer."
fi

# Try to get bot info to verify the token is valid
echo "Checking if bot token is valid..."
BOT_INFO=$(curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe")
if [[ "$BOT_INFO" == *"\"ok\":true"* ]]; then
  BOT_USERNAME=$(echo "$BOT_INFO" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
  echo "✅ Bot token is valid! Connected to bot: @$BOT_USERNAME"
else
  echo "❌ Error: Bot token appears to be invalid. Response from Telegram:"
  echo "$BOT_INFO"
  echo ""
  echo "Please check that:"
  echo "1. You've created a bot with @BotFather on Telegram"
  echo "2. You've copied the correct token to your .env file"
  echo "3. The token is entered correctly without extra spaces"
  exit 1
fi

# Get the first allowed chat ID from env
CHAT_ID=$(echo "$TELEGRAM_ALLOWED_CHAT_IDS" | cut -d',' -f1)

if [ -z "$CHAT_ID" ]; then
  echo "Error: TELEGRAM_ALLOWED_CHAT_IDS is not set or is empty in your .env file."
  exit 1
fi

# Validate chat ID format - should be a number
if ! [[ $CHAT_ID =~ ^-?[0-9]+$ ]]; then
  echo "Warning: Chat ID doesn't look like a valid Telegram ID (should be a number)"
fi

echo "Using chat ID: $CHAT_ID"

# Send message using curl
echo "Sending message to chat ID: $CHAT_ID"
# Add -v for verbose output to see what's happening
RESPONSE=$(curl -v -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$CHAT_ID" \
  -d "text=TEST MESSAGE FROM MAGI: $MESSAGE" \
  -d "parse_mode=HTML" 2>&1)

# Print the full response for debugging
echo "Full response:"
echo "$RESPONSE"

# Check if response contains ok:true
echo "$RESPONSE" | grep -o '"ok":true'

if [ $? -eq 0 ]; then
  echo "✅ Message sent successfully!"
else
  echo "❌ Failed to send message."
  
  # Check specifically for "chat not found" error
  if [[ "$RESPONSE" == *"chat not found"* ]]; then
    echo ""
    echo "ERROR: Chat not found. This is caused by Telegram's privacy policy."
    echo ""
    echo "IMPORTANT: You must first message your bot from Telegram before it can message you."
    echo "Please follow these steps:"
    echo "1. Open Telegram and search for @$BOT_USERNAME"
    echo "2. Start a conversation by sending any message to the bot"
    echo "3. Run this test script again"
    echo ""
    echo "This is a Telegram requirement, not a bug in the implementation."
  else
    echo ""
    echo "Common issues:"
    echo "1. The chat ID might be incorrect - make sure you've entered the correct one"
    echo "2. You might need to start a conversation with the bot before it can message you"
    echo "3. The bot might not have permission to send messages in this chat"
    echo ""
    echo "Try sending a message to your bot from Telegram app first, then run this test again."
  fi
  exit 1
fi