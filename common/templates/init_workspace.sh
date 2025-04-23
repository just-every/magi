#!/bin/bash

# Helper function to initialize the Nx workspace

initialize_workspace() {
    local project_name=$1
    echo "Initializing Nx workspace '$project_name'..."

    # Use non-interactive flags to make this work in Docker environments
    # '--preset=apps' creates an empty workspace with apps/ and libs/ directories
    # '--nxCloud=skip' skips Nx Cloud setup to avoid requiring interaction
    # '--pm=npm' sets npm as the package manager
    npx create-nx-workspace@latest "$project_name" --preset=apps --nxCloud=skip --pm=npm

    return $? # Return the exit code of the command
}
