# Three.js TypeScript Boilerplate

## Boilerplate Overview

When run, the boilerplate shows a green wireframe rotating cube, with OrbitControls included.

It uses webpack-dev-server for the development build, and NodeJS with Express for production build.

Both server and client projects are written in TypeScript.

## Installing

1. Install dependencies

```bash
npm install
```

2. Start it

```bash
npm run dev
```

3. Visit [http://127.0.0.1:8080](http://127.0.0.1:8080)

You should see a rotating green wireframe cube, and be able to rotate it further with your mouse.

## Running in Docker

```bash
docker build -t game .
docker run -p 3000:3000 game
```
