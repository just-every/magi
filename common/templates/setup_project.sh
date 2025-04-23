#!/bin/bash

# Main script to orchestrate project setup using helper functions.
#
# Usage: ./setup_project.sh <project_type> <project_name>
#
# Supported project_type:
#   - web-saas
#   - web-frontend
#   - game-2d
#   - game-3d

# --- Helper Function to Generate Random String ---
generate_random_string() {
    # Generate a random 8-character alphanumeric string
    # Explicitly set locale to C to avoid 'tr: Illegal byte sequence' errors on macOS
    LC_ALL=C cat /dev/urandom | LC_ALL=C tr -dc 'a-zA-Z0-9' | head -c 8
}

# --- Configuration ---
export DEFAULT_BACKEND_APP_NAME="api"
export DEFAULT_FRONTEND_APP_NAME="web"
export DEFAULT_GAME_APP_NAME="game"

# Generate random suffixes for database credentials
export DB_USER="magi-user-$(generate_random_string)"
export DB_PASSWORD="magi-password-$(generate_random_string)"
export DB_NAME="magi-db-$(generate_random_string)"
export DB_PORT="5432"

# --- Add robustness to script execution ---
set -e          # Exit immediately if a command exits with a non-zero status
set -o pipefail # Return value of a pipeline is the status of the last command to exit with a non-zero status

# --- Get Script Directory for Relative Paths ---
# This ensures the script can be run from any directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

# --- Source Helper Functions ---
# Source from the script directory, not the current working directory
source "${SCRIPT_DIR}/init_workspace.sh"
source "${SCRIPT_DIR}/generate_apps.sh"
source "${SCRIPT_DIR}/install_deps.sh"
source "${SCRIPT_DIR}/create_dev_files.sh"
source "${SCRIPT_DIR}/add_boilerplate.sh"

# --- Arguments ---
PROJECT_TYPE=$1
PROJECT_NAME=$2

# --- Validation ---
if [ -z "$PROJECT_TYPE" ] || [ -z "$PROJECT_NAME" ]; then
    echo "Usage: $0 <project_type> <project_name>"
    echo "Supported project_type: web-saas, web-frontend, game-2d, game-3d"
    exit 1
fi

# Check if project directory already exists
if [ -d "$PROJECT_NAME" ]; then
    echo "Error: Directory '$PROJECT_NAME' already exists."
    exit 1
fi

# --- Execution Flow ---
echo "Starting project setup for '$PROJECT_NAME' (Type: $PROJECT_TYPE)..."

# 1. Initialize Workspace
initialize_workspace "$PROJECT_NAME"
if [ $? -ne 0 ]; then
    echo "Error during workspace initialization."
    exit 1
fi

# --- Add environment checks and debugging ---
echo "Checking environment settings before directory change:"
echo "SHELL=$SHELL, PATH=$PATH"
echo "Current directory: $(pwd)"
echo "Nx installation: $(which npx 2> /dev/null || echo 'npx not found')"

# Navigate into the project directory (essential for subsequent commands)
cd "$PROJECT_NAME" || exit 1
echo "Entered directory: $(pwd)"

# Try to ensure environment is correct after directory change
export PATH="$PATH:$HOME/.npm/bin:./node_modules/.bin"
echo "Updated PATH=$PATH"
echo "Verifying npx availability: $(which npx 2> /dev/null || echo 'npx not found')"
echo "Verifying nx plugins: $(npx --no-install nx --version 2> /dev/null || echo 'nx command not found')"
echo "Node version: $(node --version 2> /dev/null || echo 'node not found')"
echo "npm version: $(npm --version 2> /dev/null || echo 'npm not found')"

# 2. Generate Applications
# Use process substitution or capture output to get the generated frontend name
echo "Calling generate_applications with: PROJECT_TYPE=$PROJECT_TYPE, BACKEND=$DEFAULT_BACKEND_APP_NAME, FRONTEND=$DEFAULT_FRONTEND_APP_NAME, GAME=$DEFAULT_GAME_APP_NAME"
# Temporarily redirect function output to a separate file to avoid capturing all logs
generate_applications "$PROJECT_TYPE" "$DEFAULT_BACKEND_APP_NAME" "$DEFAULT_FRONTEND_APP_NAME" "$DEFAULT_GAME_APP_NAME" > /tmp/app_gen_output.$$
GENERATION_EXIT_CODE=$?

# Read the last line of the output which should contain the frontend app name
FRONTEND_APP_GENERATED=$(tail -n 1 /tmp/app_gen_output.$$)
rm -f /tmp/app_gen_output.$$

if [[ $GENERATION_EXIT_CODE -ne 0 ]]; then
    echo "==========================================="
    echo "ERROR: Application generation failed with exit code $GENERATION_EXIT_CODE"
    echo "Called generate_applications with:"
    echo "  PROJECT_TYPE: $PROJECT_TYPE"
    echo "  BACKEND_APP: $DEFAULT_BACKEND_APP_NAME"
    echo "  FRONTEND_APP: $DEFAULT_FRONTEND_APP_NAME"
    echo "  GAME_APP: $DEFAULT_GAME_APP_NAME"
    echo "==========================================="
    exit 1
fi
echo "Application generation completed successfully."
# Handle potential empty output if no frontend was generated or if function didn't echo
if [[ -z "$FRONTEND_APP_GENERATED" && ("$PROJECT_TYPE" == "web-frontend" || "$PROJECT_TYPE" == "game-2d" || "$PROJECT_TYPE" == "game-3d") ]]; then
    echo "Warning: Frontend app name not captured correctly, using default convention."
    # Deduce name based on convention if output capture failed
    if [[ "$PROJECT_TYPE" == "web-frontend" ]]; then FRONTEND_APP_GENERATED=$DEFAULT_FRONTEND_APP_NAME; fi
    if [[ "$PROJECT_TYPE" == "game-2d" || "$PROJECT_TYPE" == "game-3d" ]]; then FRONTEND_APP_GENERATED=$DEFAULT_GAME_APP_NAME; fi
elif [[ "$PROJECT_TYPE" == "web-saas" ]]; then
    FRONTEND_APP_GENERATED=$DEFAULT_FRONTEND_APP_NAME # Ensure it's set for web-saas
fi
echo "Using frontend app name (if any): $FRONTEND_APP_GENERATED"

# 3. Install Dependencies
install_dependencies "$PROJECT_TYPE" "$DEFAULT_BACKEND_APP_NAME" "$DEFAULT_FRONTEND_APP_NAME" "$DEFAULT_GAME_APP_NAME"
if [ $? -ne 0 ]; then
    echo "Error during dependency installation."
    exit 1
fi

# 4. Create Local Dev Files (.env.example, .gitignore, docker-compose, README, Init Prisma)
# This step now also handles docker compose up and prisma migrate dev
create_dev_files "$PROJECT_TYPE" "$PROJECT_NAME" "$DEFAULT_BACKEND_APP_NAME" "$DEFAULT_FRONTEND_APP_NAME" "$DEFAULT_GAME_APP_NAME" "$DB_USER" "$DB_PASSWORD" "$DB_NAME" "$DB_PORT"
if [ $? -ne 0 ]; then
    echo "Error creating local development files or running initial migration."
    exit 1
fi

# 5. Add Boilerplate Code
add_boilerplate_code "$PROJECT_TYPE" "$DEFAULT_BACKEND_APP_NAME" "$FRONTEND_APP_GENERATED" # Pass the actual generated frontend name
if [ $? -ne 0 ]; then
    echo "Error adding boilerplate code."
    exit 1
fi

# --- Completion Message ---
echo "--------------------------------------------------"
echo "Basic Nx project structure, core dependencies, dev files (.gitignore, .env.example, docker-compose.yml, README.md), boilerplate code, and initial DB setup (if applicable) for '$PROJECT_NAME' ($PROJECT_TYPE) completed."
echo "Current directory: $(pwd)"
echo ""
echo "Next Steps:"
echo "1. Review all generated files, including the README.md, boilerplate code, .gitignore, .env.example, and Prisma schema (if applicable)."
echo "2. **IMPORTANT:** Copy '.env.example' to '.env' (\`cp .env.example .env\`) and update it with your actual secrets/configuration."
echo "3. Check Docker container status ('docker ps') and database logs ('docker compose logs db') if applicable (DB was started during setup)."
echo "4. Test the boilerplate: Run 'npx nx serve api' and 'npx nx serve ${FRONTEND_APP_GENERATED}' (in separate terminals) and check the browser (see README)."
echo "5. Initialize Git repository ('git init'), add files ('git add .'), and commit changes ('git commit -m \"Initial project setup\"')."
echo "6. Add specific UI libraries (e.g., Mantine, Shadcn UI) if needed."
echo "7. Modify the default Prisma schema and run further migrations as needed (see README)."
echo "--------------------------------------------------"

exit 0
