# Version Management Example

This example demonstrates how to use the MAGI version management system to update containers and roll back changes.

## Prerequisites

1. MAGI system running with Docker
2. Git repository with tagged releases

## Example Workflow

### 1. Check Current Version

First, check the current version via the API:

```bash
curl http://localhost:3010/api/versions
```

This returns:
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
    },
    {
      "version": "def456",
      "commit": "def456",
      "date": "2024-01-14T15:00:00Z",
      "description": "fix: improve error handling"
    }
  ],
  "current": {
    "version": "v1.0.0",
    "commit": "abc123",
    "tag": "v1.0.0",
    "date": "2024-01-15T10:00:00Z",
    "active": true
  }
}
```

### 2. Create a New Version Tag

After making changes to the codebase:

```bash
# Make your changes
git add .
git commit -m "feat: add new agent capabilities"

# Create a version tag
curl -X POST http://localhost:3010/api/versions/tag \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "v1.1.0",
    "description": "Added new agent capabilities and performance improvements"
  }'
```

### 3. Update Running Containers

Update all running containers to the new version:

```bash
curl -X POST http://localhost:3010/api/versions/update \
  -H "Content-Type: application/json" \
  -d '{
    "version": "v1.1.0",
    "strategy": "rolling"
  }'
```

The system will:
1. Build Docker images for v1.1.0 if they don't exist
2. Stop and restart containers one by one (rolling update)
3. Emit real-time progress events via WebSocket

### 4. Monitor Update Progress

You can monitor the update via WebSocket events:

```javascript
const socket = io('http://localhost:3010');

socket.on('version:update:start', (data) => {
  console.log('Update started:', data);
});

socket.on('version:update:container', (data) => {
  console.log('Updating container:', data.processId);
});

socket.on('version:update:complete', (data) => {
  console.log('Update complete!');
});

socket.on('version:update:error', (data) => {
  console.error('Update failed:', data.error);
});
```

### 5. Rollback if Needed

If issues are discovered, roll back to the previous version:

```bash
curl -X POST http://localhost:3010/api/versions/rollback \
  -H "Content-Type: application/json" \
  -d '{
    "version": "v1.0.0"
  }'
```

## Update Strategies Explained

### Rolling Update (Default)
- Updates containers one at a time
- Minimal downtime
- Safe for production

```json
{
  "version": "v1.1.0",
  "strategy": "rolling"
}
```

### Immediate Update
- Stops all containers, then restarts with new version
- Faster but causes downtime
- Good for development

```json
{
  "version": "v1.1.0",
  "strategy": "immediate"
}
```

### Graceful Update
- Waits for containers to finish current tasks
- Then performs rolling update
- Best for long-running tasks

```json
{
  "version": "v1.1.0",
  "strategy": "graceful"
}
```

## Using the UI

The Version Manager UI provides a visual interface:

1. Click the Git icon in the toolbar
2. View current version and available versions
3. Select update strategy from dropdown
4. Click "Update" or "Rollback" buttons
5. Monitor progress in real-time

## Best Practices

1. **Always tag production releases**
   ```bash
   git tag -a v1.0.0 -m "Production release v1.0.0"
   ```

2. **Test in development first**
   ```bash
   # Update only specific containers for testing
   curl -X POST http://localhost:3010/api/versions/update \
     -H "Content-Type: application/json" \
     -d '{
       "version": "v1.1.0",
       "strategy": "immediate",
       "containers": ["AI-test123"]
     }'
   ```

3. **Use semantic versioning**
   - MAJOR.MINOR.PATCH (e.g., 1.2.3)
   - MAJOR: Breaking changes
   - MINOR: New features
   - PATCH: Bug fixes

4. **Document breaking changes**
   Include detailed descriptions when creating tags for versions with breaking changes.

## Troubleshooting

### Build Failures

If the Docker build fails:

1. Check the error logs
2. Build manually:
   ```bash
   git checkout v1.1.0
   npm run build:docker
   ```

### Container Won't Start

1. Check container logs:
   ```bash
   docker logs task-AI-xyz123
   ```

2. Verify environment variables are set correctly

### Rollback Doesn't Work

1. Ensure the target version image exists:
   ```bash
   docker images | grep magi-engine
   ```

2. Build the image manually if needed