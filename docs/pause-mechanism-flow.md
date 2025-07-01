# MAGI Pause Mechanism Flow

## Overview
The pause mechanism allows users to pause all AI agent activity through the UI. Here's how it works:

## Flow Diagram

```
┌─────────────────┐
│   UI (React)    │
│                 │
│ User clicks     │
│ pause button    │
└────────┬────────┘
         │
         │ socket.emit('set_pause_state', true)
         │
         ▼
┌─────────────────┐
│ Controller      │
│ Server Manager  │
│                 │
│ handleSetPause  │
│ State()         │
└────────┬────────┘
         │
         │ Broadcasts to:
         │ 1. All UI clients
         │ 2. All engine processes
         │
         ▼
┌─────────────────┐
│ Communication   │
│ Manager         │
│                 │
│ setPauseState() │
└────────┬────────┘
         │
         │ Sends 'system_command' message
         │ type: 'pause'
         │
         ▼
┌─────────────────┐
│ Engine Process  │
│ communication.ts│
│                 │
│ Receives system │
│ command         │
└────────┬────────┘
         │
         │ Calls pause() from @just-every/ensemble
         │
         ▼
┌─────────────────┐
│ Pause Controller│
│ (ensemble)      │
│                 │
│ Emits 'paused'  │
│ event           │
└────────┬────────┘
         │
         │ pauseController.on('paused')
         │
         ▼
┌─────────────────┐
│ Engine Process  │
│ communication.ts│
│                 │
│ Sends \x1b\x1b  │
│ to PTY processes│
└────────┬────────┘
         │
         │ sendToAllPtyProcesses('\x1b\x1b')
         │
         ▼
┌─────────────────┐
│ Code Providers  │
│ (Claude, GPT,   │
│  etc.)          │
│                 │
│ Receive escape  │
│ sequence        │
└─────────────────┘
```

## Detailed Steps

### 1. UI Interaction
- User clicks the pause button in the React UI
- `togglePauseState()` is called in `SocketContext.tsx`
- Emits `'set_pause_state'` event with boolean value to server

### 2. Controller Processing
- Server receives event in `server_manager.ts`
- `handleSetPauseState()` method:
  - Updates local `isSystemPaused` state
  - Broadcasts `'pause_state_update'` to all connected UI clients
  - Calls `communicationManager.setPauseState()` for each active process

### 3. Communication to Engine
- `CommunicationManager.setPauseState()` in controller:
  - Calls `sendSystemCommand()` with 'pause' or 'resume'
  - Sends JSON message: `{ type: 'system_command', command: 'pause' }`

### 4. Engine Receives Command
- Engine's `communication.ts` receives the system_command
- Calls `pause()` from `@just-every/ensemble` package
- This triggers the pause controller's event system

### 5. PTY Process Notification
- Pause controller emits 'paused' event
- Event handler sends escape sequences to all PTY processes:
  - Sends `\x1b\x1b` (double escape) twice with 100ms delay
  - This is meant to pause all code providers

### 6. Resume Flow
- Similar flow but with 'resume' command
- Sends multiple variations of newlines to ensure compatibility:
  - 'Please continue\r\n'
  - '\r', '\n', '\x1b\r', '\x1b\n', '\x1b\n\r' with delays

## Key Components

### Controller Side
- `server_manager.ts`: Handles socket events and coordinates pause state
- `communication_manager.ts`: Manages WebSocket connections to engine processes

### Engine Side
- `communication.ts`: Receives system commands and manages pause controller
- `run_pty.ts`: Contains `sendToAllPtyProcesses()` function
- `@just-every/ensemble`: Provides pause/resume functionality

## Potential Issues

### Concurrent Silence Timeouts
When multiple code providers have silence timeouts active simultaneously:
1. The escape sequence might not reach all PTY processes
2. Some providers might already be in a state where they can't receive input
3. The timing of the pause signal might miss certain timeout windows

### Recommendations
1. Ensure all PTY processes are properly registered before sending pause signals
2. Consider implementing acknowledgment from code providers
3. Add retry logic for pause signals that fail to stop timeouts
4. Implement a more robust pause mechanism that cancels timers directly