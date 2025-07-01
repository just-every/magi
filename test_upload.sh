#!/bin/bash

# Test script for file upload functionality

echo "Testing file upload endpoint..."

# Create a test file
echo "Test content for file upload" > test_upload_file.txt

# Test the upload endpoint
curl -X POST \
  http://localhost:3010/api/upload \
  -F "file=@test_upload_file.txt" \
  -H "Accept: application/json" \
  | jq .

# Clean up
rm test_upload_file.txt

echo "Test complete!"