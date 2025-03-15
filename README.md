# MAGI System

    M(ostly)
    A(utonomous) 
    G(enerative) 
    I(ntelligence)

The MAGI System is optimized for large scale programming tasks. Multiple AI agents work simultaneously towards multiple goals. It is self-updating with the goal of becoming largely autonomous.

## Architecture

The system consists of two main components:

1. **Node.js Web Interface**: A server that manages Docker containers and provides a real-time web interface using Socket.IO
2. **Python Backend**: A containerized system that runs specialized agents using the OpenAI Agents framework

### Key Components

- **Supervisor Agent**: Central orchestrator that analyzes requests and delegates to specialized agents
- **Specialized Agents**:
  - **Code Agent**: Handles programming tasks through Claude CLI
  - **Filesystem Agent**: Manages file operations via shell commands
  - **Search Agent**: Performs web searches for information
  - **Browser Agent**: Executes browser automation tasks (placeholder implementation)

## Overview

- The web interface runs on http://localhost:3001 (or next available port)
- Socket.io is used for real-time communication
- Frontend code is written in TypeScript for type safety
- Backend Python code runs in Docker for isolation and dependency management
- Core agents include code, browser, filesystem, and search agents
- All agents are supervised by a central supervisor agent


## Installation

1. Clone the repository:
   ```
   git clone https://github.com/has-context/magi-system.git
   cd magi-system
   ```

2. Run the automated setup script:
   ```
   npm run setup
   ```
   
   The setup script will:
   - Prompt you for your OpenAI API key (you can get one at https://platform.openai.com/api-keys)
   - Install Node.js dependencies
   - Build the Docker image
   - Set up Claude integration

   Alternatively, you can perform each step manually:
   ```
   # Create a .env file with your OpenAI API key
   echo "OPENAI_API_KEY=your_api_key_here" > .env
   
   # Install dependencies
   npm ci
   
   # Build Docker image
   docker build -t magi-system:latest -f magi/docker/Dockerfile .
   
   # Set up Claude integration
   npm run setup-claude
   ```


### Starting the Development Server

Run the Node.js development server:
```bash
npm run dev
```

This will:
1. Start the web server
2. Open your default browser to the web interface
3. Allow you to interact with the system through the web UI

### Testing the Python Backend

To test the Python backend:
```bash
test/magi.sh "your prompt here"
```
