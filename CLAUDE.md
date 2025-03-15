# MAGI System

The system contains a node front end which is used to interact with a docker container running a python backend. The node server is responsible for managing the docker containers and streaming output back to the web interface. The web interface is built using TypeScript and React, and uses socket.io for real-time communication.

## Structure
The project is organized as follows:
- `magi/`: Python backend with agent implementations
    - `core_agents/`: Specialized agent implementations
    - `docker/`: Docker configuration
    - `utils/`: Shared utility modules
- `src/`: TypeScript source for the Node.js server
- `public/`: Static web assets
- `utils/`: Node.js utilities for Docker and setup

## ALWAYS TEST YOUR CHANGES
1. Make changes to code
2. Lint all code with `npm run lint` (fix with `npm run lint:fix`)
3. Test node server with `npm run dev`
4. Test magi backend with `test/magi.sh "your prompt here"`
5. Verify all changed functionality works
6. Fix ALL errors found during testing (related to changes or not)
7. Repeat steps 2 to 6 until no errors are found
8. With GitHub, commit final code and push

Changes should ALWAYS be tested after they are made. If any errors are found (regardless if they are related or not) they should be fixed immediately. Once no errors are found, final code should be committed and pushed as long as the task was completed successfully.
