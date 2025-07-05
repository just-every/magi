# Idle Mode Implementation

## Overview

This document describes the implementation that allows the MAGI system's main loop to start immediately when `npm run dev` is executed without an initial command. Previously, the system would fail to start if no command was provided.

## Changes Made

### 1. Engine Changes (magi.ts)

**File:** `/engine/src/magi.ts`

- Made the prompt parameter optional for non-tool runs
- Added handling for the special idle mode marker `[IDLE_MODE_START]`
- Modified the prompt parsing to allow starting without a prompt when no tool is specified
- Added conditional logic to only spawn initial thought if a valid prompt is provided

Key changes:
```typescript
// Made promptText optional
let promptText: string | undefined;

// Allow starting without prompt for non-tool runs
} else if (args.tool && args.tool !== 'none') {
    // Tool runs require a prompt
    return endProcess(1, 'Either --prompt or --base64 must be provided for tool runs');
}
// If no prompt and no tool, we're starting the overseer in idle mode

// Only spawn initial thought if a prompt was provided and it's not the idle mode marker
if (promptText && promptText !== '[IDLE_MODE_START]') {
    await spawnThought(args, promptText);
} else if (promptText === '[IDLE_MODE_START]') {
    console.log('Starting overseer in idle mode, waiting for commands...');
    await addMonologue(
        'I am now ready and waiting for commands. The system is initialized and I can begin helping as soon as I receive instructions.'
    );
}
```

### 2. Controller Changes (server_manager.ts)

**File:** `/controller/src/server/managers/server_manager.ts`

- Added automatic startup of the overseer in idle mode when no initial command is provided
- Created `startOverseerIdleMode()` method to handle idle mode initialization
- Added AgentProcess import and proper typing

Key changes:
```typescript
// In constructor, check for initial command
if (process.env.MAGI_INITIAL_COMMAND) {
    // Execute the initial command
    setTimeout(() => {
        console.log('Executing initial command:', initialCommand);
        this.handleCommandRun(initialCommand);
    }, 1000);
} else {
    console.log('No initial command found in environment');
    // Start the overseer in idle mode after a short delay
    setTimeout(() => {
        console.log('Starting overseer in idle mode...');
        this.startOverseerIdleMode();
    }, 1000);
}

// New method to start overseer in idle mode
async startOverseerIdleMode(): Promise<void> {
    const processId = `AI-${Math.random().toString(36).substring(2, 8)}`;
    const idleModeMarker = '[IDLE_MODE_START]';
    
    const agentProcess: AgentProcess = {
        processId: processId,
        started: new Date(),
        status: 'running',
        tool: 'other',
        command: idleModeMarker,
        name: 'Overseer',
        output: 'Starting overseer in idle mode...'
    };
    
    await this.processManager.createProcess(processId, idleModeMarker, agentProcess);
    // ... bootstrap projects
}
```

### 3. Type Updates (shared-types.ts)

**File:** `/common/shared-types.ts`

- Extended StreamEventType to include project event types to fix TypeScript compilation errors

```typescript
export type StreamEventType = ProviderStreamEventType | 'design' | 'format_info' | 'complete' | 'project_create' | 'project_update' | 'project_delete';
```

## How It Works

1. When `npm run dev` is executed without a command:
   - The dev script sets an empty `MAGI_INITIAL_COMMAND` environment variable
   - The controller starts up and detects no initial command
   - After a 1-second delay, it calls `startOverseerIdleMode()`

2. The idle mode startup:
   - Creates a new process with the special marker `[IDLE_MODE_START]`
   - This marker is passed as a base64-encoded command to the Docker container
   - The magi.ts script recognizes this marker and starts the main loop without spawning an initial thought

3. The overseer then:
   - Adds its initial monologues
   - Logs that it's ready and waiting for commands
   - Enters the main loop, waiting for commands via WebSocket

## Benefits

- The system now starts successfully without requiring an initial command
- The overseer is ready to receive commands immediately after startup
- Users can start the system with just `npm run dev` and then interact via the UI
- The implementation maintains backward compatibility with the existing command-based startup

## Testing

To test the implementation:

1. Run `npm run dev` without any command arguments
2. The system should start successfully and show "Starting overseer in idle mode..." in the logs
3. The UI should be accessible at http://localhost:3010
4. Commands can be sent through the UI and will be processed normally