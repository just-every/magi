# MAGI Version Management

This document describes the version management and update system for MAGI containers.

## Overview

The MAGI system now supports versioning and live updates for running containers. This allows you to:

- Deploy patches and updates to running containers without full system restart
- Roll back to previous versions if issues occur
- Choose between different update strategies based on your needs
- Track version history with Git tags and commits

## How It Works

### Version Tracking

The system uses Git for version tracking:
- Each commit represents a potential version
- Tagged releases (e.g., `v1.0.0`) are treated as official versions
- The current version is determined by the latest Git tag or commit hash

### Container Images

Docker images are tagged with versions:
- `magi-engine:latest` - The default/current version
- `magi-engine:v1.0.0` - Specific tagged version
- `magi-engine:abc123` - Specific commit version

### Update Strategies

Three update strategies are available:

1. **Rolling Update** (Default)
   - Updates containers one at a time
   - Minimizes downtime
   - Allows gradual rollout

2. **Immediate Update**
   - Stops all containers and restarts with new version
   - Fastest update method
   - Brief downtime for all containers

3. **Graceful Update**
   - Waits for containers to complete current tasks
   - Then performs rolling update
   - Best for production environments

## Using the Version Manager

### Via UI

1. Click the Git icon in the top toolbar
2. The Version Manager modal will open showing:
   - Current active version
   - Available versions (tags and recent commits)
   - Update strategy selector

3. To update to a different version:
   - Select the update strategy
   - Click "Update" next to the desired version
   - Monitor progress in the UI

4. To rollback:
   - Click "Rollback" next to a previous version
   - Confirm the action

5. To create a new version tag:
   - Click "Create Tag"
   - Enter tag name (e.g., `v1.0.1`)
   - Optionally add a description

### Via API

#### Get Available Versions
```bash
GET /api/versions
```

Response:
```json
{
  "success": true,
  "versions": [
    {
      "version": "v1.0.0",
      "commit": "abc123",
      "tag": "v1.0.0",
      "date": "2024-01-15T10:00:00Z",
      "active": true
    }
  ],
  "current": { ... }
}
```

#### Update Containers
```bash
POST /api/versions/update
{
  "version": "v1.0.1",
  "strategy": "rolling",
  "containers": ["AI-xyz123"] // Optional, updates all if not specified
}
```

#### Rollback
```bash
POST /api/versions/rollback
{
  "version": "v1.0.0"
}
```

#### Create Version Tag
```bash
POST /api/versions/tag
{
  "tag": "v1.0.2",
  "description": "Bug fixes and performance improvements"
}
```

## Environment Variables

- `MAGI_VERSION` - Override the default version for new containers
- `PROJECT_VERSION` - Version to use for project containers

## Best Practices

1. **Tag Important Releases**
   - Use semantic versioning (e.g., v1.0.0)
   - Add descriptive messages to tags

2. **Test Before Production**
   - Use rolling updates to test on a subset first
   - Monitor logs during updates

3. **Prepare for Rollback**
   - Keep previous versions available
   - Document breaking changes

4. **Update Strategy Selection**
   - Use graceful updates for production
   - Use immediate updates for development
   - Use rolling updates for testing

## Troubleshooting

### Container Won't Update

1. Check if the image exists:
   ```bash
   docker images | grep magi-engine
   ```

2. Build the specific version:
   ```bash
   git checkout v1.0.0
   npm run build:docker
   ```

3. Check container status:
   ```bash
   docker ps -a | grep task-AI
   ```

### Update Fails

1. Check logs in the UI
2. Verify Git repository state
3. Ensure Docker daemon is running
4. Check available disk space

### Rollback Issues

1. Ensure the target version image exists
2. Check for breaking changes between versions
3. Review container logs for errors

## Socket Events

The system emits these WebSocket events:

- `version:update:start` - Update process begins
- `version:update:container` - Individual container update
- `version:update:complete` - Update finished successfully
- `version:update:error` - Update failed
- `version:config:updated` - Configuration changed

## Implementation Details

The version management system consists of:

1. **VersionManager** (`controller/src/server/managers/version_manager.ts`)
   - Handles version tracking and updates
   - Manages Docker image building
   - Implements update strategies

2. **Container Manager Updates**
   - Support for versioned images
   - Environment variable propagation

3. **API Routes** (`controller/src/server/routes/version_routes.ts`)
   - RESTful endpoints for version operations

4. **UI Component** (`controller/src/client/js/components/VersionManager.tsx`)
   - React component for version management
   - Real-time update progress