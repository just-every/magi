# Controller Development Guide

## Local Development Setup

### Prerequisites
- Node.js 23+
- PostgreSQL database running locally or via Docker
- Chrome browser (for browser automation features)

### Initial Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your values
```

3. Ensure database is running:
```bash
# From parent directory
docker compose up -d db
```

### Development Commands

#### For local development (with auto-reload):
```bash
npm run dev
```
This runs:
- TypeScript compiler in watch mode
- Webpack in watch mode for client bundle
- Nodemon to auto-restart server on changes

#### For Docker development (mimics production):
```bash
npm run start:docker
```

#### Build only:
```bash
npm run build
```

#### Start production server:
```bash
npm start
```

### Project Structure
- `src/server/` - Express server and API routes
- `src/client/` - React frontend application
- `src/types/` - TypeScript type definitions
- `dist/` - Compiled output (gitignored)

### Common Issues

1. **Missing shared-types**: The controller depends on `../common/shared-types.ts`. Make sure you're developing from the magi root directory or symlink the common folder.

2. **Port conflicts**: Default port is 3010. Change in .env if needed.

3. **Database connection**: Ensure PostgreSQL is running and accessible at the configured host/port.

### Tips
- The dev server automatically reloads on TypeScript changes
- Client changes are hot-reloaded via webpack
- Check `nodemon.json` to customize watch behavior