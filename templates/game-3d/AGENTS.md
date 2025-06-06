# 3D Multiplayer Game

[detailed_description]

// TypeScript-based 3D multiplayer game with client-server architecture
// Uses Three.js for WebGL rendering and WebSockets for networking

This is a 3D multiplayer game template built with TypeScript, featuring client-server architecture for networked gameplay. It uses WebGL for 3D rendering via Three.js and WebSockets for real-time communication between players.

## Core Modules & Files

// Client-server separation with shared type definitions
// Client handles rendering and input, server handles game logic

- `src/client/client.ts`: Main entry point for the client-side game
- `src/server/server.ts`: Main entry point for the game server
- `src/typings/`: TypeScript type definitions for game entities and networking protocols
- `dist/`: Compiled output for both client and server code

## `project_map.json`

// Project overview with structure information

- `project_map.json`: Contains a detailed overview of the project structure, frameworks, and entry points.

## Common Bash Commands

```bash
# Installation and Setup
npm install           # Install dependencies
npm start             # Start development server with hot-reloading

# Development
npm run dev:client    # Run client in development mode
npm run dev:server    # Run server in development mode
npm run lint          # Run ESLint to check code quality

# Building and Packaging
npm run build         # Build both client and server
npm run build:client  # Build only the client
npm run build:server  # Build only the server
npm run serve         # Run the built server with production client
```

## Code Style Guidelines

// Entity-component architecture recommended
// Server is authoritative for game state
// TypeScript interfaces define network protocols

- Follow TypeScript best practices with strong typing
- Use Three.js patterns for 3D scene management
- Implement entity-component architecture for game objects
- Keep network message sizes optimized
- Use TypeScript interfaces for network protocol definitions
- Follow separation of concerns between client and server

## Testing Instructions

// Test with multiple browser instances
// Use Chrome DevTools for performance monitoring

- Test client-server communication with multiple browser instances
- For performance testing, use Chrome DevTools Performance panel
- Monitor WebGL performance with Three.js built-in stats
- Test network synchronization with artificial latency

## Repository Etiquette

// Include media for visual changes

- Branch names: `feature/short-description`, `fix/issue-summary`
- Use conventional commits (e.g., `feat:`, `fix:`, `chore:`)
- Pull requests should target the main branch
- Include screenshots or videos for visual changes

## Developer Environment Setup

// Client runs on port 8080, server on port 3000
// Chrome DevTools useful for WebGL debugging

- Requires Node.js 16.x or higher
- Install dependencies: `npm install`
- For development, run with `npm start`
- Access the development client at http://localhost:8080
- Server runs on port 3000 by default
- Use Chrome DevTools for debugging

## Project-Specific Warnings

// PERF CRITICAL: Monitor WebGL performance
// NETWORK: Implement client-side prediction
// MEMORY: Clean up Three.js resources

- WebGL performance is highly dependent on hardware
- Be mindful of draw calls and polygon counts for 3D models
- Network synchronization can be challenging - implement prediction and reconciliation
- Physics can be CPU-intensive; consider server-side physics with client prediction
- Clean up resources (geometries, textures, event listeners) to prevent memory leaks

## Key Game Concepts

// Server is authoritative for game state
// Client predicts and renders between server updates
// Network protocol defined in src/typings/

- **Client-Server Architecture**: Server is authoritative for game state
- **WebGL Rendering**: Three.js renders the 3D scene in the browser
- **Network Synchronization**: Server updates are sent to all clients
- **Input Handling**: Client inputs are sent to the server for processing
- **Physics**: Can be implemented on server, client, or both with reconciliation
- **Entity Management**: Track and update game entities across the network

## Performance Optimization

// Use instancing for repeated objects
// Implement LOD for distant objects
// Consider binary protocols for networking

- Use instancing for repeated 3D objects
- Implement level-of-detail (LOD) for distant objects
- Optimize WebGL settings based on device capabilities
- Compress network messages for minimal bandwidth
- Use binary protocols for efficient network communication
- Implement spatial partitioning for collision detection