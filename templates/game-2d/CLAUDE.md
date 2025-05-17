# 2D Game Project

This is a 2D game development template built with Phaser 3 and TypeScript. It provides a foundation for creating browser-based 2D games with scene management, game objects, and optional multiplayer capabilities through an Express server.

## Core Modules & Files

- `src/index.ts`: Main entry point for the game
- `src/game.ts`: Core game configuration and initialization
- `src/scenes/`: Game scenes that represent different states/screens
  - `BootScene.ts`: Initial loading scene
  - `MenuScene.ts`: Main menu scene
  - `GameScene.ts`: Primary gameplay scene
- `src/objects/`: Game object classes
  - `Player.ts`: Player character implementation
  - `Enemy.ts`: Enemy character implementation
- `src/assets/`: Game assets (images, audio, tilemaps)
- `server/server.ts`: Express server for multiplayer/deployment

## `project_map.json`

- `project_map.json`: Contains a detailed overview of the project structure, frameworks, and entry points.

## Common Bash Commands

```bash
# Installation and Setup
npm install           # Install dependencies
npm start             # Start development server with hot-reloading

# Development
npm run lint          # Run ESLint to check code quality
npm run format        # Format code with Prettier

# Building and Packaging
npm run build         # Build for development
npm run build:prod    # Build for production (minified)
npm run serve         # Serve the built game via Express
```

## Code Style Guidelines

- Follow TypeScript best practices with strong typing
- Use Phaser 3's scene system for game state management
- Extend Phaser classes (Scene, GameObject, etc.) when implementing game objects
- Keep scene update methods optimized for performance
- Use asset preloading in the BootScene

## Testing Instructions

- Test game mechanics directly in the browser
- For performance testing, use the browser's developer tools
- Monitor frame rate during gameplay with Phaser's built-in FPS display

## Repository Etiquette

- Branch names: `feature/short-description`, `fix/issue-summary`
- Use conventional commits (e.g., `feat:`, `fix:`, `chore:`)
- Pull requests should target the main branch
- Include screenshots or GIFs for visual changes

## Developer Environment Setup

- Requires Node.js 16.x or higher
- Install dependencies: `npm install`
- For development, run with `npm start`
- Access the development server at http://localhost:8080
- Use Chrome DevTools for debugging

## Project-Specific Warnings

- Keep sprite asset sizes optimized for performance
- Be mindful of memory leaks - clean up event listeners and timers in scene shutdown
- Physics calculations can be CPU-intensive; optimize collision detection
- Don't place heavy logic in the render loop, use the update loop instead

## Key Game Concepts

- **Scenes**: Separate game states (Boot, Menu, Game)
- **Game Loop**: Phaser's update function runs every frame
- **Sprites**: Visual game objects with physics properties
- **Input Handling**: Mouse, keyboard, and touch inputs
- **Collision Detection**: Phaser's physics system handles collisions
- **Asset Management**: Preload assets in the boot scene

## Performance Tips

- Use texture atlases for sprite animations to reduce draw calls
- Implement object pooling for frequently created/destroyed objects
- Use Phaser's built-in camera system for viewport management
- Employ spatial partitioning for large-scale collision detection
- Optimize with Phaser's built-in performance monitoring tools