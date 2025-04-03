# MAGI Docker Configuration

The MAGI System uses a Docker-first approach, eliminating the need for installing dependencies on the host machine.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

## Quick Start

Three shell scripts are provided in the root directory for easy management:

```bash
# Run the setup process (first time only)
./setup.sh

# Start the MAGI System
./start.sh

# Stop the MAGI System
./stop.sh
```

Once started, you can access the MAGI web interface at: http://localhost:3010

## Manual Docker Commands

If you prefer to run the commands manually:

1. Setup (first time only):
   ```bash
   docker-compose build setup
   docker-compose run --rm setup
   ```

2. Build all images:
   ```bash
   docker-compose build
   ```

3. Start the system:
   ```bash
   docker-compose up -d
   ```

4. View logs:
   ```bash
   docker-compose logs -f
   ```

5. Stop all containers:
   ```bash
   docker-compose down
   ```

## Docker Components

The system consists of several Docker components:

1. **Controller Service**: Node.js web server that manages the UI and Docker containers
2. **MAGI Base Image**: Used for the AI agent containers
3. **Setup Service**: Handles initial configuration and environment setup

## Directory Structure

Docker configuration is organized in the `/docker` directory:

```
docker/
├── controller/     # Controller service Docker files
├── magi/           # MAGI AI service Docker files 
├── setup/          # Setup service Docker files
└── README.md       # Docker-specific documentation
```

## Docker Architecture

The Docker setup consists of:

1. **Controller Container**: Runs the Node.js web server and manages MAGI agent containers
2. **MAGI Agent Containers**: Dynamically created by the controller to handle specific tasks
3. **Docker Network**: A bridge network named `magi-network` for communication between containers
4. **Volumes**: 
   - `claude_credentials`: For Claude authentication data
   - `magi_output`: For storing MAGI output files

## Troubleshooting

### Container Communication Issues

If containers can't communicate with each other:

1. Ensure all containers are on the same Docker network:
   ```bash
   docker network inspect magi-network
   ```

2. Check container logs:
   ```bash
   docker-compose logs -f
   ```

3. Make sure the `.env` file is correctly mounted and contains required API keys

### Docker Socket Permission Issues

If you see errors about connecting to the Docker socket:

1. Manually fix permissions:
   ```bash
   sudo chmod 666 /var/run/docker.sock
   ```

2. Or run Docker with your user:
   ```bash
   sudo usermod -aG docker $USER
   # Log out and log back in to apply changes
   ```

### Windows-Specific Issues

Windows users might encounter additional issues:

1. Make sure Docker Desktop is using WSL 2 backend (Settings > General)
2. Enable integration with your WSL 2 distro (Settings > Resources > WSL Integration)
3. If file permission errors occur, check Docker Desktop's file sharing permissions

## Development with Docker

When making changes to the codebase:

- Changes to controller source files will hot reload automatically
- Changes to Docker configuration require a restart:
  ```bash
  ./stop.sh
  docker-compose build
  ./start.sh
  ```

## Notes for Repository Contributors

The root-level package.json has been removed to simplify the system. All functionality is now handled through Docker, which:

1. Eliminates the need to install Node.js/npm on the host machine
2. Provides a consistent environment across different platforms
3. Simplifies setup and running processes

A backup of the original package.json is stored in the `/backup` directory for reference.

## Configuration

You can modify the following files to customize the Docker setup:

- `docker-compose.yml`: Main configuration for services, networks, and volumes
- `docker/controller/Dockerfile`: Build instructions for the controller container
- `docker/magi/Dockerfile`: Build instructions for MAGI agent containers
- `docker/setup/Dockerfile`: Build instructions for the setup container