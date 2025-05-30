# Code Provider Registration Fix Summary

## Issues Fixed

1. **Sub-agents not showing in column view**
   - Fixed filter logic to include 'waiting' status
   - Improved worker visibility by showing all workers of visible parent processes
   - Added debug logging for troubleshooting

2. **Git worktree undefined branch name**
   - Fixed undefined `branchName` variable in `prepareGitRepository`
   - Made git fetch optional for repos without remotes or SSH access

3. **CodeAgent using wrong models**
   - Removed duplicate claude-code/codex entries from MODEL_REGISTRY
   - Created external model registration system with unique provider IDs
   - Fixed provider validation to support external providers
   - Successfully made CodeAgent use claude-code instead of gpt-4.1

## Key Changes

### Controller
- `ProcessTreeColumn.tsx`: Fixed sub-agent visibility in column view
- `container_manager.ts`: Fixed git worktree branch name and optional fetch

### Ensemble
- `external_models.ts`: New external model registration system
- `model_provider.ts`: Added support for external provider validation
- `model_data.ts`: Removed duplicate code model entries

### Magi
- `register_code_providers.ts`: New file to register claude-code and codex providers
- `magi.ts`: Added call to register code providers on startup
- `Dockerfile`: Removed --ignore-scripts to properly build native modules

## Testing
- Confirmed CodeAgent now uses claude-code model
- Verified sub-agents appear in column view
- Git operations work without errors