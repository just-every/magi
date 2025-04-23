#!/bin/bash

# Helper function to create docker-compose.yml, .env.example, .gitignore, README.md
# and initialize Prisma (for relevant project types).

create_dev_files() {
    local project_type=$1
    local project_name=$2
    local backend_app_name=$3
    local frontend_app_name=$4
    local game_app_name=$5
    local db_user=$6
    local db_password=$7
    local db_name=$8
    local db_port=$9

    # --- Create .env.example, and Init Prisma (if applicable) ---
    if [[ "$project_type" == "web-saas" ]]; then
        # Check if the top-level docker-compose.yml exists
        if [[ -f "/Users/zemaj/www/magi-system/docker-compose.yml" ]]; then
            echo "Using shared PostgreSQL service from the top-level docker-compose.yml..."
        else
            echo "Creating default docker-compose.yml for PostgreSQL..."
            cat << EOF > docker-compose.yml
version: '3.8'
services:
  db:
    image: postgres:15 # Or mysql, etc. based on user choice later
    restart: always
    environment:
      POSTGRES_USER: ${db_user}
      POSTGRES_PASSWORD: ${db_password}
      POSTGRES_DB: ${db_name}
    ports:
      - "${db_port}:5432" # Expose DB port
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
EOF
            if [ $? -ne 0 ]; then
                echo "Error creating docker-compose.yml."
                return 1
            fi
        fi

        echo "Creating default .env.example file..."
        cat << EOF > .env.example
# Database connection string (adjust provider if not postgresql)
# Copy this file to .env and fill in your actual secrets/config
# Using shared database configuration from magi-system
DATABASE_URL="postgresql://\${DATABASE_USER:-postgres}:\${DATABASE_PASSWORD:-postgres}@\${DATABASE_HOST:-localhost}:\${DATABASE_PORT:-5432}/\${DATABASE_NAME:-postgres}?schema=public"

# JWT Secret (Change this in .env!)
JWT_SECRET="replace-this-with-a-real-secret"

# Add other environment variables as needed
# e.g., API_PORT=3000
EOF
        if [ $? -ne 0 ]; then
            echo "Error creating .env.example file."
            return 1
        fi

        echo "Initializing Prisma..."
        npx nx exec --project=${backend_app_name} -- npx prisma init --datasource-provider postgresql
        if [ $? -ne 0 ]; then
            echo "Error initializing Prisma."
            return 1
        fi

        # Update schema.prisma to use environment variables
        echo "Updating Prisma schema to use environment variables..."
        SCHEMA_PATH="${backend_app_name}/prisma/schema.prisma"
        if [ -f "$SCHEMA_PATH" ]; then
            # Replace the default datasource with one that uses env vars
            sed -i.bak '/^datasource db {/,/^}/c\
datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}' "$SCHEMA_PATH"
            rm -f "${SCHEMA_PATH}.bak"
        else
            echo "Warning: Could not find schema.prisma in expected location: $SCHEMA_PATH"
        fi

        # Check if we need to start a local database or use the shared one
        if [[ -f "/Users/zemaj/www/magi-system/docker-compose.yml" ]]; then
            echo "Using shared database from magi-system..."
            # Check if the shared database container is running
            if ! docker ps | grep -q "magi-postgres"; then
                echo "Starting shared database container from magi-system..."
                (cd /Users/zemaj/www/magi-system && docker compose up -d db)
                if [ $? -ne 0 ]; then
                    echo "Error starting shared database container. Is Docker running?"
                    return 1
                fi
            fi
        else
            # IMPORTANT: This step requires:
            # 1. Docker CLI to be installed in the environment
            # 2. Docker daemon to be accessible (e.g., Docker socket mounted if running in a container)
            # 3. Network connectivity for container image pulls
            echo "Starting local database container (requires Docker)..."
            docker compose up -d
            if [ $? -ne 0 ]; then
                echo "Error starting docker compose. Is Docker running?"
                return 1
            fi
        fi

        echo "Waiting for database to initialize..."
        # Robust DB readiness check with timeout
        # Try for 30 seconds (30 attempts, 1 second apart)
        max_attempts=30
        attempt=1

        # Check if pg_isready is available, if not warn but continue with a sleep
        if command -v pg_isready > /dev/null 2>&1; then
            # PostgreSQL client tools are available
            echo "Using pg_isready to check database readiness..."
            until pg_isready -h localhost -p ${db_port} -U ${db_user} > /dev/null 2>&1 || [ $attempt -gt $max_attempts ]; do
                echo "Waiting for PostgreSQL to become available... ($attempt/$max_attempts)"
                attempt=$((attempt + 1))
                sleep 1
            done

            if [ $attempt -gt $max_attempts ]; then
                echo "Database did not become ready within the timeout period."
                echo "You may need to run the Prisma migration manually once the database is ready:"
                echo "npx nx exec --project=${backend_app_name} -- npx prisma migrate dev --name init"
                return 1
            fi

            echo "PostgreSQL is now available."
        else
            # No pg_isready available, fall back to longer sleep
            echo "WARNING: pg_isready command not found. Using sleep instead."
            echo "For more reliable operation, consider installing postgresql-client package."
            echo "Sleeping for 15 seconds to give database time to initialize..."
            sleep 15
        fi

        echo "Running initial Prisma migration..."
        npx nx exec --project=${backend_app_name} -- npx prisma migrate dev --name init
        if [ $? -ne 0 ]; then
            echo "Error running initial Prisma migration."
            echo "This could happen if:"
            echo "  - The database is still starting up"
            echo "  - The database connection details are incorrect"
            echo "  - Prisma schema has errors"
            echo "Try running the migration manually later:"
            echo "npx nx exec --project=${backend_app_name} -- npx prisma migrate dev --name init"
            return 1
        fi

    fi

    # --- Create .gitignore ---
    echo "Creating default .gitignore file..."
    cat << 'EOF' > .gitignore
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# Dependencies
node_modules/
.pnp/
.pnp.js
.yarn/install-state.gz

# Nx
dist/
tmp/
nx-cache/
.nx/cache/

# Testing
coverage/
junit.xml

# Production
build/

# Misc
.DS_Store
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# IDEs / Editors
.idea/
.vscode/
*.swp
*~

# Prisma (optional, ensure schema.prisma is committed if needed)
# **/prisma/dev.db
# **/prisma/dev.db-journal

# Operating System Files
Thumbs.db
EOF
    if [ $? -ne 0 ]; then
        echo "Error creating .gitignore file."
        return 1
    fi

    # --- Create README.md ---
    echo "Creating default README.md..."
    # Basic Header
    cat << EOF > README.md
# ${project_name}

**Project Type:** \`${project_type}\`

This is an Nx workspace containing the initial setup for the '${project_name}' project.

## Getting Started

1.  **Install Dependencies:** If you haven't already, or if dependencies change:
    \`\`\`bash
    npm install
    \`\`\`
2.  **Setup Environment (if applicable):**
    - This script created a default \`.env.example\` file (if applicable for project type).
    - **Copy \`.env.example\` to \`.env\`**: \`cp .env.example .env\`
    - **Update \`.env\`** with your actual secrets (like a real \`JWT_SECRET\`) and configurations. **Do not commit \`.env\`!**
3.  **Start Database (if applicable):** If a \`docker-compose.yml\` was created, it was likely started by the setup script. To start/stop manually:
    \`\`\`bash
    # Start
    docker compose up -d
    # Stop
    docker compose down
    \`\`\`
4.  **Database Migrations (if applicable):** If using Prisma (e.g., for \`web-saas\`), the initial migration was attempted by the script. For subsequent changes:
    - Modify \`${backend_app_name}/prisma/schema.prisma\`.
    - Run:
    \`\`\`bash
    npx nx exec --project=${backend_app_name} -- npx prisma migrate dev --name <migration_description>
    \`\`\`

## Development Servers

EOF
    if [ $? -ne 0 ]; then
        echo "Error creating initial README.md."
        return 1
    fi

    # Add Backend instructions if applicable
    if [[ "$project_type" == "web-saas" ]]; then
        cat << EOF >> README.md
* **Backend API (\`${backend_app_name}\`):** Serves the NestJS application. Requires \`.env\` file to be configured.
    \`\`\`bash
    npx nx serve ${backend_app_name}
    \`\`\`
EOF
        if [ $? -ne 0 ]; then
            echo "Error appending backend dev info to README.md."
            return 1
        fi
    fi

    # Add Frontend/Game instructions
    local current_frontend_app_name=""
    local frontend_type_desc=""
    if [[ "$project_type" == "web-saas" || "$project_type" == "web-frontend" ]]; then
        current_frontend_app_name=$frontend_app_name
        frontend_type_desc="Frontend App"
    elif [[ "$project_type" == "game-2d" || "$project_type" == "game-3d" ]]; then
        current_frontend_app_name=$game_app_name
        frontend_type_desc="Game App"
    fi

    if [ -n "$current_frontend_app_name" ]; then
        cat << EOF >> README.md
* **${frontend_type_desc} (\`${current_frontend_app_name}\`):** Serves the React application using Vite.
    \`\`\`bash
    npx nx serve ${current_frontend_app_name}
    \`\`\`
EOF
        if [ $? -ne 0 ]; then
            echo "Error appending frontend dev info to README.md."
            return 1
        fi
    fi

    # Add Build section header
    cat << EOF >> README.md

## Building for Production

Nx provides commands to build optimized versions of the applications.

EOF
    if [ $? -ne 0 ]; then
        echo "Error appending build header to README.md."
        return 1
    fi

    # Add Backend build instructions if applicable
    if [[ "$project_type" == "web-saas" ]]; then
        cat << EOF >> README.md
* **Backend API (\`${backend_app_name}\`):**
    \`\`\`bash
    npx nx build ${backend_app_name}
    \`\`\`
    *(Output will be in \`dist/${backend_app_name}\`)*
EOF
        if [ $? -ne 0 ]; then
            echo "Error appending backend build info to README.md."
            return 1
        fi
    fi

    # Add Frontend/Game build instructions
    if [ -n "$current_frontend_app_name" ]; then
        cat << EOF >> README.md
* **${frontend_type_desc} (\`${current_frontend_app_name}\`):**
    \`\`\`bash
    npx nx build ${current_frontend_app_name}
    \`\`\`
    *(Output will be in \`dist/${current_frontend_app_name}\`)*
EOF
        if [ $? -ne 0 ]; then
            echo "Error appending frontend build info to README.md."
            return 1
        fi
    fi

    # Add Testing section header
    cat << EOF >> README.md

## Running Tests

Nx uses Jest by default for testing applications and libraries.

EOF
    if [ $? -ne 0 ]; then
        echo "Error appending test header to README.md."
        return 1
    fi

    # Add Backend test instructions if applicable
    if [[ "$project_type" == "web-saas" ]]; then
        cat << EOF >> README.md
* **Backend API (\`${backend_app_name}\`):**
    \`\`\`bash
    npx nx test ${backend_app_name}
    \`\`\`
EOF
        if [ $? -ne 0 ]; then
            echo "Error appending backend test info to README.md."
            return 1
        fi
    fi

    # Add Frontend/Game test instructions
    if [ -n "$current_frontend_app_name" ]; then
        cat << EOF >> README.md
* **${frontend_type_desc} (\`${current_frontend_app_name}\`):**
    \`\`\`bash
    npx nx test ${current_frontend_app_name}
    \`\`\`
EOF
        if [ $? -ne 0 ]; then
            echo "Error appending frontend test info to README.md."
            return 1
        fi
    fi

    # Add final note
    cat << EOF >> README.md

---

*(This is a basic README. Add more specific project details, setup instructions for uninstalled dependencies (e.g., UI libs), deployment info, and contribution guidelines as needed.)*
EOF
    if [ $? -ne 0 ]; then
        echo "Error appending final note to README.md."
        return 1
    fi

    return 0 # Success
}
