#!/usr/bin/env bash
set -euo pipefail
# Run tests for all tools in the examples/tools directory
#
# Usage: ./run-all-tools.sh [verbose|quiet]
#   verbose - Show full output for all tools
#   quiet   - Show only errors (default)
#
# Returns non-zero exit code if any test fails

# Get script directory
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
TOOLS_DIR="$SCRIPT_DIR/tools"
VERBOSE=0

# Check for verbose flag
if [ "${1:-}" = "verbose" ]; then
  VERBOSE=1
fi

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Running all tool tests from ${TOOLS_DIR}${NC}"
echo -e "${YELLOW}===================================${NC}"

# Track results
PASSED=0
FAILED=0
FAILED_TOOLS=()

# Find all TypeScript files
TOOLS=$(find "$TOOLS_DIR" -name "*.ts" | sort)

# Get total count
TOTAL=$(echo "$TOOLS" | wc -l | tr -d ' ')

echo "Found $TOTAL tools to test"
echo ""

# Testing function with common arguments
test_tool() {
  local tool=$1
  local name=$(basename "$tool" .ts)
  local args='{"verbose":true}'

  # Add specific arguments for execute-command test
  if [ "$name" = "execute-command" ]; then
    args='{"command":"echo \"hello\"","verbose":true}'
  fi

  echo -e "${YELLOW}[$((PASSED+FAILED+1))/$TOTAL] Testing $name...${NC}"

  # Run the tool with docker compose
  if [ $VERBOSE -eq 1 ]; then
    # In verbose mode, show all output
    echo "Running tool $name in verbose mode..."
    "$SCRIPT_DIR/run-tool-docker.sh" "$tool" "$args"
    local status=$?
  else
    # In quiet mode, capture output and only show on failure
    echo "Running tool $name in quiet mode..."
    local output
    output=$("$SCRIPT_DIR/run-tool-docker.sh" "$tool" "$args" 2>&1)
    local status=$?
  fi

  # Check result
  if [ $status -eq 0 ]; then
    echo -e "${GREEN}✓ $name passed${NC}"
    ((PASSED++))
  else
    echo -e "${RED}✗ $name failed${NC}"
    if [ $VERBOSE -eq 0 ]; then
      # In quiet mode, show output on failure
      echo "$output"
    fi
    FAILED_TOOLS+=("$name")
    ((FAILED++))
  fi

  echo ""
  return $status
}

# Test each tool, but continue even if one fails
for tool in $TOOLS; do
  test_tool "$tool" || true
done

# Print summary
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}============${NC}"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Failed: $FAILED${NC}"
  echo -e "${RED}Failed tools: ${FAILED_TOOLS[*]}${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
