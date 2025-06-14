# Bug Report: create_project Tool Timeout Issue

## Summary
The `create_project` tool is being incorrectly marked as "running in the background" after 30 seconds, even though the project creation completes successfully much earlier. This is due to a mismatch between the ensemble framework's default 30-second tool timeout and the `create_project` function's expected execution time.

## Issue Details

### Observed Behavior
1. User calls `create_project` tool
2. Project is created successfully (shown immediately in UI)
3. After ~10-30 seconds, the message "Tool create_project is running in the background" appears
4. This confuses users as the project was already created

### Root Cause
The issue originates in the `@just-every/ensemble` package:

1. **Default Tool Timeout**: All tools have a 30-second timeout (`FUNCTION_TIMEOUT_MS = 30000`) defined in:
   ```
   node_modules/@just-every/ensemble/dist/config/tool_execution.js
   ```

2. **Excluded Tools**: Some long-running tools are excluded from this timeout in `EXCLUDED_FROM_TIMEOUT_FUNCTIONS`:
   - `start_task`
   - `send_message` 
   - `wait_for_running_tool`
   - etc.

3. **Missing Exclusion**: `create_project` is NOT in the exclusion list, but it should be because:
   - It waits for project creation confirmation via event listeners
   - Has an internal 5-minute timeout
   - Is expected to be a long-running operation

### Code References
- Timeout configuration: `@just-every/ensemble/dist/config/tool_execution.js`
- Timeout handling: `@just-every/ensemble/dist/utils/tool_execution_manager.js:80`
- create_project implementation: `/engine/src/utils/project_utils.ts:241-251`

## Recommended Fix

Add `create_project` to the `EXCLUDED_FROM_TIMEOUT_FUNCTIONS` set in the ensemble package:

```javascript
// In @just-every/ensemble/dist/config/tool_execution.js
export const EXCLUDED_FROM_TIMEOUT_FUNCTIONS = new Set([
    'start_task',
    'send_message',
    'wait_for_running_tool',
    'create_project',  // <-- Add this line
    // ... other excluded functions
]);
```

## Alternative Solutions

1. **Make timeout configurable per tool** - Allow tools to specify their own timeout values
2. **Increase global timeout** - Not recommended as it would affect all tools
3. **Refactor create_project** - Make it return immediately and track progress asynchronously

## Impact
- User confusion when seeing "running in the background" for already completed operations
- No functional impact - projects are created successfully
- Affects user experience and trust in the system

## Reproduction Steps
1. Call `create_project` with any valid parameters
2. Observe that project is created immediately 
3. Wait 30 seconds
4. See "Tool create_project is running in the background" message appear

## Environment
- Package: `@just-every/ensemble`
- Affected tool: `create_project`
- Location: Tool execution timeout handling