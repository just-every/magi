#!/bin/bash

# Helper function to generate applications based on project type

generate_applications() {
    local project_type=$1
    local backend_app_name=$2
    local frontend_app_name=$3
    local game_app_name=$4
    local frontend_app_generated="" # Variable to store the name of the generated frontend/game app

    echo "Generating applications for type: $project_type"

    # Pre-install plugins directly to ensure they're available
    echo "Pre-installing required Nx plugins..."
    set +e # Temporarily disable exit on error for diagnostics
    if [[ "$project_type" == "web-saas" || "$project_type" == "web-frontend" ]]; then
        echo "Installing @nx/react plugin..."
        npm install --save-dev @nx/react
    fi

    if [[ "$project_type" == "web-saas" ]]; then
        echo "Installing @nx/nest plugin..."
        npm install --save-dev @nx/nest
    fi

    if [[ "$project_type" == "game-2d" || "$project_type" == "game-3d" ]]; then
        echo "Installing @nx/react plugin for game UI..."
        npm install --save-dev @nx/react
    fi
    set -e # Re-enable exit on error

    case $project_type in
        web-saas)
            echo "Setting up 'web-saas': Generating NestJS API and React Frontend..."

            echo "Attempting: npx nx g @nx/nest:app $backend_app_name ..."
            # Set up log file for debugging
            LOG_FILE="/tmp/nx-command-$$.log"
            echo "Logging nx command output to: $LOG_FILE"

            # Run the nx command and capture both stdout and stderr
            { npx nx g @nx/nest:app "$backend_app_name" --strict --tags="scope:backend,type:app"; } > "$LOG_FILE" 2>&1
            EXITCODE=$?

            # Output log regardless of success/failure
            echo "--- Command output start ---"
            cat "$LOG_FILE"
            echo "--- Command output end ---"

            if [ $EXITCODE -ne 0 ]; then
                echo "ERROR: Failed during 'npx nx g @nx/nest:app $backend_app_name' with exit code $EXITCODE"
                echo "Detailed output in: $LOG_FILE"
                return 1
            fi
            echo "Completed: npx nx g @nx/nest:app $backend_app_name"

            echo "Attempting: npx nx g @nx/react:app $frontend_app_name ..."
            # Set up log file for debugging
            LOG_FILE="/tmp/nx-command-$$.log"
            echo "Logging nx command output to: $LOG_FILE"

            # Run the nx command and capture both stdout and stderr
            { npx nx g @nx/react:app "$frontend_app_name" --bundler=vite --style=tailwind --tags="scope:frontend,type:app"; } > "$LOG_FILE" 2>&1
            EXITCODE=$?

            # Output log regardless of success/failure
            echo "--- Command output start ---"
            cat "$LOG_FILE"
            echo "--- Command output end ---"

            if [ $EXITCODE -ne 0 ]; then
                echo "ERROR: Failed during 'npx nx g @nx/react:app $frontend_app_name' with exit code $EXITCODE"
                echo "Detailed output in: $LOG_FILE"
                return 1
            fi
            echo "Completed: npx nx g @nx/react:app $frontend_app_name"
            frontend_app_generated=$frontend_app_name
            ;;

        web-frontend)
            echo "Setting up 'web-frontend': Generating React Frontend..."

            echo "Attempting: npx nx g @nx/react:app $frontend_app_name ..."
            # Set up log file for debugging
            LOG_FILE="/tmp/nx-command-$$.log"
            echo "Logging nx command output to: $LOG_FILE"

            # Run the nx command and capture both stdout and stderr
            { npx nx g @nx/react:app "$frontend_app_name" --bundler=vite --style=tailwind --tags="scope:frontend,type:app"; } > "$LOG_FILE" 2>&1
            EXITCODE=$?

            # Output log regardless of success/failure
            echo "--- Command output start ---"
            cat "$LOG_FILE"
            echo "--- Command output end ---"

            if [ $EXITCODE -ne 0 ]; then
                echo "ERROR: Failed during 'npx nx g @nx/react:app $frontend_app_name' with exit code $EXITCODE"
                echo "Detailed output in: $LOG_FILE"
                return 1
            fi
            echo "Completed: npx nx g @nx/react:app $frontend_app_name"
            frontend_app_generated=$frontend_app_name
            ;;

        game-2d | game-3d)
            echo "Setting up '$project_type': Generating React Frontend (for game UI/loader)..."

            echo "Attempting: npx nx g @nx/react:app $game_app_name ..."
            # Set up log file for debugging
            LOG_FILE="/tmp/nx-command-$$.log"
            echo "Logging nx command output to: $LOG_FILE"

            # Run the nx command and capture both stdout and stderr
            { npx nx g @nx/react:app "$game_app_name" --bundler=vite --style=tailwind --tags="scope:game,type:app"; } > "$LOG_FILE" 2>&1
            EXITCODE=$?

            # Output log regardless of success/failure
            echo "--- Command output start ---"
            cat "$LOG_FILE"
            echo "--- Command output end ---"

            if [ $EXITCODE -ne 0 ]; then
                echo "ERROR: Failed during 'npx nx g @nx/react:app $game_app_name' with exit code $EXITCODE"
                echo "Detailed output in: $LOG_FILE"
                return 1
            fi
            echo "Completed: npx nx g @nx/react:app $game_app_name"
            frontend_app_generated=$game_app_name
            ;;

        app-mobile-app)
            echo "Error: 'app-mobile-app' type requires manual setup using @nx/expo plugin."
            echo "Example: npx nx g @nx/expo:app my-mobile-app"
            return 1
            ;;

        *)
            echo "Error: Unsupported project type '$project_type'."
            echo "Supported types: web-saas, web-frontend, game-2d, game-3d"
            return 1
            ;;
    esac

    # Return the name of the generated frontend app (or empty string)
    # Using exit code to pass back the name is a bit hacky in bash,
    # but returning 0 for success and the name via echo might be better.
    # Let's return 0 for success and rely on the main script knowing the name convention.
    # A better way would be global variables or temp files, but let's keep it simpler.
    # We'll return the name via exit code for now, main script checks for non-zero/non-empty.
    # Correction: Returning name via exit code is bad. Let's echo it and capture in main script,
    # or simpler, just return 0 and let main script deduce the name.
    # Let's return 0 on success, 1 on error. Main script will deduce the name.
    # Correction 2: Pass the name back via the exit code, but check specifically for 1 as error code.
    echo "$frontend_app_generated" # Echo the name
    return 0                       # Indicate success
}
