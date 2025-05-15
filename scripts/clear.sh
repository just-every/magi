#!/bin/bash
# Script to clear the magi_output Docker volume, .server data folder, and database
# Usage: ./scripts/clear.sh

set -e

# Load environment variables from .env file if it exists
if [ -f ".env" ]; then
  echo "Loading environment variables from .env file"
  export $(grep -v '^#' .env | xargs)
elif [ -f "../.env" ]; then
  echo "Loading environment variables from ../.env file"
  export $(grep -v '^#' ../.env | xargs)
fi

# Print banner
echo "========================================"
echo "MAGI System - Clear Script"
echo "========================================"
echo ""

# Print database connection parameters for debugging
print_db_params() {
    echo "Database connection parameters:"
    echo "  DATABASE_HOST: ${DATABASE_HOST:-not set}"
    echo "  DATABASE_PORT: ${DATABASE_PORT:-5432}"
    echo "  DATABASE_USER: ${DATABASE_USER:-postgres}"
    echo "  DATABASE_NAME: ${DATABASE_NAME:-postgres}"
}

# Function to check if PostgreSQL is running
check_postgres() {
    # Get the PostgreSQL container ID
    POSTGRES_CONTAINER=$(docker ps -q -f name=postgres)
    
    # First check if the container is running
    if [ -z "$POSTGRES_CONTAINER" ]; then
        echo "PostgreSQL container is not running"
        return 1
    fi
    
    # Try connecting directly inside the container
    if docker exec "$POSTGRES_CONTAINER" pg_isready -h localhost >/dev/null 2>&1; then
        echo "PostgreSQL is running and accepting connections!"
        return 0
    else
        echo "PostgreSQL container is running but not accepting connections"
        return 1
    fi
}

# Function to clear the magi_output volume
clear_magi_output() {
    echo "Clearing magi_output volume..."
    # Create a temporary container to access the volume and clear its contents
    docker run --rm -v magi_output:/magi_output alpine:latest sh -c "rm -rf /magi_output/* /magi_output/.[!.]* 2>/dev/null || true"
    
    # Verify the cleaning
    echo "Verifying cleanup..."
    OUTPUT=$(docker run --rm -v magi_output:/magi_output alpine:latest sh -c "ls -la /magi_output")
    FILECOUNT=$(echo "$OUTPUT" | wc -l)
    
    if [ "$FILECOUNT" -le 3 ]; then
        # Only ".", ".." and possibly ".gitkeep" remain
        echo "✅ magi_output volume has been successfully cleared."
    else
        echo "⚠️ Some files may remain in the volume:"
        echo "$OUTPUT"
    fi
}

# Function to clear the .server folder
clear_server_folder() {
    echo "Clearing .server data folder..."
    # Clear the .server data folder (if it exists)
    if [ -d ".server" ]; then
        rm -rf .server/* .server/.[!.]* 2> /dev/null || true
        echo "✅ .server data folder has been cleared."
        
        # Verify .server is empty
        SERVER_FILES=$(ls -la .server | wc -l)
        if [ "$SERVER_FILES" -le 3 ]; then
            echo "✅ .server directory has been successfully cleared."
        else
            echo "⚠️ Some files may remain in the .server directory:"
            ls -la .server
        fi
    else
        echo "ℹ️ .server data folder not found, creating it."
        mkdir -p .server
    fi
}

# Function to truncate database tables
truncate_database() {
    echo "Truncating database tables..."
    
    # Get the PostgreSQL container ID
    POSTGRES_CONTAINER=$(docker ps -q -f name=postgres)
    
    if [ -z "$POSTGRES_CONTAINER" ]; then
        echo "PostgreSQL container is not running"
        return 1
    fi
    
    # Default database parameters
    DB_USER="${DATABASE_USER:-postgres}"
    DB_NAME="${DATABASE_NAME:-postgres}"
    
    echo "Getting list of tables from database..."
    
    # Get a list of all tables except pgmigrations using docker exec
    TABLES=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != 'pgmigrations';" | grep -v '^\s*$')
    
    if [ -z "$TABLES" ]; then
        echo "ℹ️ No tables found to truncate."
    else
        echo "Connected to database, truncating tables..."
        
        # Start a transaction
        docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "BEGIN; SET CONSTRAINTS ALL DEFERRED;"
        
        # Loop through each table and truncate it
        for TABLE in $TABLES; do
            # Remove any whitespace
            TABLE=$(echo "$TABLE" | tr -d ' ')
            echo "Truncating table: $TABLE"
            docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "TRUNCATE TABLE \"$TABLE\" CASCADE;"
        done
        
        # Commit the transaction
        docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "COMMIT;"
        echo "✅ All tables except pgmigrations have been truncated successfully."
    fi
}

# Function to start the database using docker compose
start_database() {
    echo "Starting database with docker compose..."
    
    # Print current environment settings
    print_db_params
    
    # Start the database service
    docker compose up -d db
    
    echo "Waiting for database to start..."
    
    # Check if the container started correctly (up to 5 attempts)
    for attempt in {1..5}; do
        echo "Waiting for database container (attempt $attempt/5)..."
        
        # Get the container ID
        POSTGRES_CONTAINER=$(docker ps -q -f name=postgres)
        
        if [ -z "$POSTGRES_CONTAINER" ]; then
            echo "Container not found yet, waiting..."
            sleep 2
            continue
        fi
        
        # Show container startup logs on first successful check
        if [ "$attempt" -eq 1 ]; then
            echo "PostgreSQL container is starting:"
            docker logs "$POSTGRES_CONTAINER" 2>&1 | grep "LOG:" | grep -i "database system" | tail -3
        fi
        
        # Check if the database is accepting connections
        if docker exec "$POSTGRES_CONTAINER" pg_isready -h localhost >/dev/null 2>&1; then
            echo "✅ Database started successfully and is accepting connections!"
            return 0
        fi
        
        echo "Database container is running but not yet accepting connections..."
        sleep 3
    done
    
    echo "⚠️ Database container is running but not accepting connections after multiple attempts."
    echo "Container logs:"
    docker logs "$POSTGRES_CONTAINER" 2>&1 | tail -5
    
    return 1
}

# Ask if user wants to perform all operations
read -p "Do you want to perform all operations (clear volume, folder, and truncate DB)? (y/N) " -n 1 -r PERFORM_ALL
echo ""
if [[ $PERFORM_ALL =~ ^[Yy]$ ]]; then
    CLEAR_OUTPUT="y"
    CLEAR_SERVER="y"
    CLEAR_DB="y"
    echo "All operations will be performed."
else
    # Ask about clearing magi_output
    read -p "Do you want to clear the magi_output volume? (y/N) " -n 1 -r CLEAR_OUTPUT
    echo ""
    
    # Ask about clearing .server folder
    read -p "Do you want to clear the .server folder? (y/N) " -n 1 -r CLEAR_SERVER
    echo ""
    
    # Ask about truncating database tables
    read -p "Do you want to truncate all database tables? (y/N) " -n 1 -r CLEAR_DB
    echo ""
fi

# Execute operations based on user selections
if [[ $CLEAR_OUTPUT =~ ^[Yy]$ ]]; then
    clear_magi_output
else
    echo "Skipping magi_output volume cleanup."
fi

if [[ $CLEAR_SERVER =~ ^[Yy]$ ]]; then
    clear_server_folder
else
    echo "Skipping .server folder cleanup."
fi

if [[ $CLEAR_DB =~ ^[Yy]$ ]]; then
    DB_WAS_STARTED=false
    
    # Try to connect to the database first
    echo "Checking if database is already running..."
    if ! check_postgres; then
        echo "PostgreSQL is not running or not accessible. Starting it automatically..."
        if start_database; then
            DB_WAS_STARTED=true
            echo "Database successfully started and connected."
        else
            echo ""
            echo "⚠️ Could not establish connection to the database."
            echo "Please try one of these solutions:"
            echo "1. Run 'docker compose up -d db' manually and try again"
            echo "2. Try 'psql -h localhost -U postgres' to test connection"
            echo "3. Check that DATABASE_* environment variables are correctly set"
            echo ""
            read -p "Do you want to skip database truncation and continue? (Y/n) " -n 1 -r SKIP_DB
            echo ""
            if [[ ! $SKIP_DB =~ ^[Nn]$ ]]; then
                CLEAR_DB="n"
            else
                echo "Aborting script."
                exit 1
            fi
        fi
    else
        echo "Database is already running and accessible."
    fi
    
    # Only try to truncate if database is now running
    if [[ $CLEAR_DB =~ ^[Yy]$ ]]; then
        # Make sure we're using the correct host
        export DB_HOST="$DATABASE_HOST"
        truncate_database
        
        # If we started the database, stop it automatically
        if [ "$DB_WAS_STARTED" = true ]; then
            echo "Stopping database that was started for this operation..."
            docker compose stop db
            echo "✅ Database stopped."
        fi
    else
        echo "Skipping database truncation."
    fi
else
    echo "Skipping database truncation."
fi

echo ""
echo "Clear operation completed."