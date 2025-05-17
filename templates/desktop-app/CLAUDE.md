# Desktop Application

This is a cross-platform desktop application built with Electron and React. It provides a native UI experience across Windows, macOS, and Linux while leveraging web technologies for the interface. The application features system tray integration, custom application menus, and secure IPC communication.

## Core Modules & Files

- `src/main/main.ts`: Entry point for the Electron main process
- `src/main/preload.ts`: Preload script for secure IPC bridge
- `src/main/ipc/handlers.ts`: IPC communication handlers
- `src/renderer/index.tsx`: Entry point for the React renderer process
- `src/renderer/App.tsx`: Main React component
- `src/main/menu/appMenu.ts`: Application menu configuration
- `src/main/tray/tray.ts`: System tray integration
- `src/renderer/hooks/`: Custom React hooks (settings, theme)
- `assets/icons/`: Application icons for different platforms

## `project_map.json`

- `project_map.json`: Contains a detailed overview of the project structure, frameworks, and entry points.

## Common Bash Commands

```bash
# Installation and Setup
npm install           # Install dependencies
npm start             # Start the application in development mode

# Development
npm run lint          # Run ESLint to check code quality
npm run format        # Format code with Prettier

# Building and Packaging
npm run package       # Package the app without creating installers
npm run make          # Create platform-specific distributables
```

## Code Style Guidelines

- Follow TypeScript best practices with strict type checking
- React functional components with hooks are preferred over class components
- Use SCSS modules for styling (see `src/renderer/styles/`)
- Separate concerns between main and renderer processes
- Use context API for state management (see `src/renderer/hooks/useSettings.tsx`)

## Testing Instructions

- Run tests with `npm test`
- Test both main and renderer processes independently
- For the main process, focus on IPC communication testing
- For the renderer, use React Testing Library for component tests

## Repository Etiquette

- Branch names: `feature/short-description`, `fix/issue-summary`
- Use conventional commits (e.g., `feat:`, `fix:`, `chore:`)
- Pull requests should target the main branch
- Include screenshots for UI changes

## Developer Environment Setup

- Requires Node.js 18.x or higher
- Install dependencies: `npm install`
- For development, run with `npm start`
- For debugging main process: `npm run start:debug`
- For debugging renderer: Use Chrome DevTools (View > Toggle Developer Tools)

## Project-Specific Warnings

- IMPORTANT: Avoid using `remote` module as it's deprecated in Electron
- Always use the IPC bridge in preload script for main-renderer communication
- Ensure proper context isolation for security (see preload.ts)
- Only expose necessary APIs through preload script

## Key Utility Functions / APIs

- `src/shared/constants.ts`: Shared constants between main and renderer
- `src/main/ipc/handlers.ts`: Register IPC handlers with proper validation
- `src/renderer/hooks/useSettings.tsx`: Settings management hook
- `src/renderer/hooks/useTheme.tsx`: Theme switching functionality

## Electron Security Best Practices

- Context isolation is enabled for security
- Content Security Policy is enforced
- Only expose necessary APIs through preload script
- Validate all IPC inputs in the main process
- Disable Node integration in renderer process