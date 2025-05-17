# 2D Game Development Template

A modern, structured template for building 2D games with Phaser 3, TypeScript, and Webpack.

## Features

- **Phaser 3 Framework** - Popular open-source game framework with comprehensive 2D capabilities
- **TypeScript Support** - Strong typing for safer, more maintainable game code
- **Modern Asset Pipeline** - Asset management with automatic optimization
- **Dev Environment** - Hot-reloading development server for rapid iteration
- **Production Ready** - Optimized build process for deployment
- **Scene Management** - Organized structure for game scenes and states
- **Docker Support** - Containerization for consistent deployment

## Quick Start

```bash
# Install dependencies
npm install

# Start development server with hot-reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Visit [http://localhost:8080](http://localhost:8080) during development or [http://localhost:3000](http://localhost:3000) in production.

## Docker Deployment

```bash
# Build Docker image
docker build -t game-2d .

# Run container
docker run -p 3000:3000 game-2d
```

## Project Structure

```
/
├── src/
│   ├── assets/           # Game assets (images, audio, etc.)
│   │   ├── images/       # Image assets
│   │   ├── audio/        # Audio assets
│   │   └── tilemaps/     # Tilemap files
│   ├── scenes/           # Game scenes
│   │   ├── BootScene.ts  # Initial loading scene
│   │   ├── GameScene.ts  # Main gameplay scene
│   │   └── MenuScene.ts  # Menu screens
│   ├── objects/          # Game object classes
│   │   ├── Player.ts     # Player character
│   │   └── Enemy.ts      # Enemy entities
│   ├── utils/            # Utility functions and helpers
│   │   └── constants.ts  # Game constants and configuration
│   ├── types/            # TypeScript type definitions
│   ├── game.ts           # Main game initialization
│   └── index.ts          # Entry point
├── server/               # Simple express server for production
│   └── server.ts         # Server implementation
├── webpack/              # Webpack configuration
│   ├── webpack.common.js # Shared webpack config
│   ├── webpack.dev.js    # Development config
│   └── webpack.prod.js   # Production config
├── Dockerfile            # Docker configuration
└── package.json          # Dependencies and scripts
```

## Game Development Features

The template includes:

- **Physics Engine** - Arcade physics system for collision detection and movement
- **Input Management** - Keyboard, mouse, and touch input handling
- **Animation System** - Sprite animation framework
- **Camera Controls** - Viewport management and following mechanics
- **Particle Effects** - System for creating visual effects
- **Sound Management** - Audio playback and control
- **State Management** - Game state and data persistence

## Next Steps

- Add game mechanics and gameplay features
- Create custom sprites and animations
- Design game levels and challenges
- Implement audio and visual effects
- Add UI elements and menus
- Optimize performance for target platforms

This template is designed to be a starting point for AI agents developing 2D games and interactive experiences.