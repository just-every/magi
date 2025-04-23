#!/bin/bash

# Helper function to install core dependencies based on project type
# and update package-lock.json

install_dependencies() {
    local project_type=$1
    local backend_app_name=$2
    local frontend_app_name=$3
    local game_app_name=$4

    echo "Installing core dependencies for type: $project_type"

    # Install common dev dependency (Prisma CLI) for types that need it
    if [[ "$project_type" == "web-saas" ]]; then
        echo "Installing Prisma CLI (dev dependency)..."
        npm install --save-dev prisma
        if [ $? -ne 0 ]; then
            echo "Error installing Prisma CLI."
            return 1
        fi
        echo "Installing Prisma Client..."
        npm install @prisma/client
        if [ $? -ne 0 ]; then
            echo "Error installing Prisma Client."
            return 1
        fi
    fi

    # Install dependencies based on type
    case $project_type in
        web-saas)
            echo "Installing backend dependencies (Auth, Config)..."
            CURRENT_DIR=$(pwd)
            echo "Changing to backend app directory: $backend_app_name"
            cd "$backend_app_name" || return 1
            npm install @nestjs/passport passport @nestjs/jwt passport-jwt bcrypt @nestjs/config
            INSTALL_RESULT=$?
            cd "$CURRENT_DIR" || return 1
            if [ $INSTALL_RESULT -ne 0 ]; then
                echo "Error installing backend dependencies."
                return 1
            fi

            echo "Installing backend dev dependencies (Types)..."
            cd "$backend_app_name" || return 1
            npm install --save-dev @types/passport-jwt @types/bcrypt
            INSTALL_RESULT=$?
            cd "$CURRENT_DIR" || return 1
            if [ $INSTALL_RESULT -ne 0 ]; then
                echo "Error installing backend dev dependencies."
                return 1
            fi

            echo "Installing frontend dependencies (Zustand, Immer)..."
            echo "Changing to frontend app directory: $frontend_app_name"
            cd "$frontend_app_name" || return 1
            npm install zustand immer
            INSTALL_RESULT=$?
            cd "$CURRENT_DIR" || return 1
            if [ $INSTALL_RESULT -ne 0 ]; then
                echo "Error installing frontend dependencies."
                return 1
            fi
            ;;

        web-frontend)
            echo "Installing frontend dependencies (Zustand, Immer)..."
            # Change to the app directory instead of using workspace flag
            echo "Changing to app directory: $frontend_app_name"
            CURRENT_DIR=$(pwd)
            cd $frontend_app_name || return 1
            npm install zustand immer
            INSTALL_RESULT=$?
            cd "$CURRENT_DIR" || return 1
            if [ $INSTALL_RESULT -ne 0 ]; then
                echo "Error installing frontend dependencies."
                return 1
            fi
            ;;

        game-2d)
            echo "Installing game dependencies (Phaser, Zustand, Immer)..."
            echo "Changing to game app directory: $game_app_name"
            CURRENT_DIR=$(pwd)
            cd "$game_app_name" || return 1
            npm install phaser zustand immer
            INSTALL_RESULT=$?
            cd "$CURRENT_DIR" || return 1
            if [ $INSTALL_RESULT -ne 0 ]; then
                echo "Error installing 2D game dependencies."
                return 1
            fi
            ;;

        game-3d)
            echo "Installing game dependencies (Three, R3F, Drei, Rapier, Zustand, Immer)..."
            echo "Changing to game app directory: $game_app_name"
            CURRENT_DIR=$(pwd)
            cd "$game_app_name" || return 1
            # Note: @dimforge/rapier3d-compat might be needed depending on environment setup for WASM
            # Using --legacy-peer-deps to handle React version mismatch
            npm install --legacy-peer-deps three @react-three/fiber @react-three/drei @react-three/rapier @dimforge/rapier3d-compat zustand immer
            INSTALL_RESULT=$?
            if [ $INSTALL_RESULT -ne 0 ]; then
                cd "$CURRENT_DIR" || return 1
                echo "Error installing 3D game dependencies."
                return 1
            fi

            echo "Installing game dev dependencies (Types)..."
            npm install --legacy-peer-deps --save-dev @types/three
            INSTALL_RESULT=$?
            cd "$CURRENT_DIR" || return 1
            if [ $INSTALL_RESULT -ne 0 ]; then
                echo "Error installing 3D game dev dependencies."
                return 1
            fi
            ;;
    esac

    # Ensure package-lock.json is updated based on package.json
    echo "Generating/Updating package-lock.json..."
    npm install --package-lock-only
    if [ $? -ne 0 ]; then
        echo "Error updating package-lock.json."
        return 1
    fi

    echo "Dependency installation complete."
    return 0 # Success
}
