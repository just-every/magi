# Pause Mechanism Fix - Concurrent Silence Timeouts

## Issue Description
When multiple code providers have concurrent silence timeouts, the pause mechanism (`pauseAllSilenceTimeouts()`) was not correctly tracking the time elapsed since the last activity. This caused issues when resuming, where timeouts would either:
1. Fire immediately after resume (if calculated remaining time was negative/zero)
2. Never fire (if calculated remaining time was incorrect)

## Root Cause
The `resetSilenceTimeout()` function, which is called whenever there's activity from a PTY process, was not updating the `lastActivity` timestamp in the `activeSilenceTimeouts` tracking map. This meant:

1. When a timeout was reset due to activity, the new timeout was created but the tracking map still had the old `lastActivity` value
2. When pausing, the calculation `remainingTime - (now - lastActivity)` used stale data
3. This resulted in incorrect remaining time calculations

## Fix Applied

### 1. Update lastActivity on Reset
In `engine/src/utils/run_pty.ts`, modified `resetSilenceTimeout()` to update the tracking map:

```typescript
const resetSilenceTimeout = () => {
    if (silenceTimeoutId) clearTimeout(silenceTimeoutId);

    // Check if globally paused
    if (pausedState) {
        silenceTimeoutId = null;
        return;
    }

    const now = Date.now();
    
    // Update lastActivity in the tracking map
    const timeoutInfo = activeSilenceTimeouts.get(messageId);
    if (timeoutInfo) {
        timeoutInfo.lastActivity = now;
        timeoutInfo.remainingTime = silenceTimeoutMs;
    }
    // ... rest of function
```

### 2. Enhanced Logging
Added detailed logging to help debug concurrent timeout issues:

- Log when already paused/resumed to avoid duplicate operations
- Log elapsed time and remaining time when pausing
- Log when timeouts have no remaining time during resume
- Log when timeouts already have active timers

## How It Works Now

1. **Activity Tracking**: Every time a PTY process sends output, `resetSilenceTimeout()` updates both the timeout and the `lastActivity` timestamp
2. **Pause Calculation**: When pausing, the exact elapsed time since last activity is calculated correctly
3. **Resume Behavior**: When resuming, timeouts are recreated with the correct remaining time

## Testing
- Existing tests pass without modification
- The fix ensures concurrent timeouts from multiple code providers are properly paused and resumed
- Enhanced logging helps monitor the pause/resume behavior in production

## Recommendations for Future Improvements

1. **Timeout Acknowledgment**: Consider implementing acknowledgment from code providers when they receive pause signals
2. **Direct Timer Management**: Instead of relying on escape sequences, consider implementing direct timer management in code providers
3. **Timeout Grouping**: Group related timeouts together to ensure they're paused/resumed atomically
4. **State Persistence**: Consider persisting pause state to handle controller restarts gracefully