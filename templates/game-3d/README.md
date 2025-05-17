# 3D Game Development Template

A streamlined Three.js and TypeScript starter template for building interactive 3D applications, games, and visualizations.

## Features

- **Three.js Integration** - Industry-standard 3D library with comprehensive rendering capabilities
- **TypeScript Support** - Strong typing for safer, more maintainable code
- **Dev Environment** - Hot-reloading development server for rapid iteration
- **Production Ready** - Express.js server for production deployment
- **Docker Support** - Containerization for consistent deployment
- **Orbit Controls** - Built-in camera controls for interactive navigation

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
docker build -t game-3d .

# Run container
docker run -p 3000:3000 game-3d
```

## Structure

```
/
├── src/
│   ├── client/           # Frontend code
│   │   ├── client.ts     # Main Three.js application entry point
│   │   ├── webpack.dev.js  # Development webpack configuration
│   │   └── webpack.prod.js # Production webpack configuration
│   ├── server/           # Backend code
│   │   └── server.ts     # Express server for production
│   └── typings/          # TypeScript type definitions
├── Dockerfile            # Docker configuration
└── package.json          # Dependencies and scripts
```

## Customize Your 3D Application

The default scene includes a rotating green wireframe cube with orbit controls. Modify `src/client/client.ts` to:

- Add new 3D models and assets
- Implement game mechanics and physics
- Create custom materials and lighting
- Add user interactions and controls
- Build immersive experiences

## Next Steps

- Add textures and materials to enhance visuals
- Implement custom shaders for advanced effects
- Add physics using Cannon.js or Ammo.js
- Create game logic and interactions
- Optimize for performance with instance meshes

This template is designed to be a starting point for AI agents developing 3D web applications and games.