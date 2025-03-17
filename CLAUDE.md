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

## How to solve problems
- Always search the web to ensure you have up-to-date information about packages or code which you are working with.
- If the first solution fails, do more research before trying something else.
- **Never** add a simulation or mock code to solve an error. This can be done temporarily for debugging, but it should never be left in the code and a real solution should be implemented. **Always fix the underlying problem.**

## ALWAYS TEST YOUR CHANGES
1. Make changes to code
2. Lint all code with `npm run lint` (fix with `npm run lint:fix`)
3. Test magi docker backend with `test/magi-docker.sh -p "your prompt here"`
4. You can also test individual agents directly with python using `test/magi-python.sh -p "your prompt here" -a codes` where `code` is the name of the agent you want to test (`supervisor`, `code`, `browser`, `shell`, `search`, `reasoning` or `worker`)
5. Verify all changed functionality works
6. Fix ALL errors found during testing (related to changes or not)
7. Repeat steps 2 to 6 until no errors are found
8. With GitHub, commit final code and push

Changes should ALWAYS be tested after they are made. If any errors are found (regardless if they are related or not) they should be fixed immediately. Once no errors are found, final code should be committed and pushed as long as the task was completed successfully.
