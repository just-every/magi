#!/bin/bash
# Load .env file if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Run the manager CLI
npx tsx src/cli.ts "$@"
