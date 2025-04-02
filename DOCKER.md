# MAGI Docker Configuration

This document explains how to run the MAGI system using Docker and Docker Compose, which provides better cross-platform compatibility, especially for Windows users.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

## Quick Start

The easiest way to start the MAGI system is to use the provided script:

```bash
./start-docker.sh
```

This will:
1. Build all required Docker images
2. Start the controller container
3. Set up the required network and volumes

Once started, you can access the MAGI web interface at: http://localhost:3010

## Manual Setup

If you prefer to run the commands manually:

1. Build the images:
   ```bash
   docker-compose build
   ```

2. Start the controller:
   ```bash
   docker-compose up -d controller
   ```

3. View logs:
   ```bash
   docker-compose logs -f controller
   ```

4. Stop all containers:
   ```bash
   docker-compose down
   ```

## Architecture

The Docker setup consists of:

1. **Controller Container**: Runs the Node.js web server and manages MAGI agent containers
2. **MAGI Agent Containers**: Dynamically created by the controller to handle specific tasks
3. **Docker Network**: A bridge network named `magi-network` for communication between containers
4. **Volumes**: 
   - `claude_credentials`: For Claude authentication data
   - `magi_output`: For storing MAGI output files

## Troubleshooting

### Container communication issues

If containers can't communicate with each other:

1. Ensure all containers are on the same Docker network:
   ```bash
   docker network inspect magi-network
   ```

2. Check controller container logs:
   ```bash
   docker compose logs controller
   ```

3. Make sure the `.env` file is correctly mounted and contains required API keys

### Docker socket permission issues

If you see errors about connecting to the Docker socket:

1. Try the non-containerized controller approach:
   ```bash
   # On Linux/macOS
   ./run-local.sh
   
   # On Windows
   run-local.bat
   ```
   
   This approach runs only the controller locally (outside Docker) while still 
   using Docker for the agent containers.

2. Or try the simplified host network mode:
   ```bash
   # On Linux/macOS
   ./use-host-network.sh
   
   # On Windows
   use-host-network.bat
   ```

3. Or manually fix permissions:
   ```bash
   sudo chmod 666 /var/run/docker.sock
   ```

### Windows-specific issues

Windows users might encounter additional issues:

1. Make sure Docker Desktop is using WSL 2 backend (Settings > General)
2. Enable integration with your WSL 2 distro (Settings > Resources > WSL Integration)
3. For networking issues, use the host network scripts:
   ```
   use-host-network.bat
   ```
4. If file permission errors occur, check Docker Desktop's file sharing permissions

## Configuration

You can modify the following files to customize the Docker setup:

- `docker-compose.yml`: Main configuration for services, networks, and volumes
- `controller/docker/Dockerfile`: Build instructions for the controller container
- `magi/docker/Dockerfile`: Build instructions for MAGI agent containers