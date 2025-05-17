# Electron Desktop Application

[detailed_description]

A comprehensive template for building cross-platform desktop applications with Electron, React, TypeScript, and modern tooling.

## Features

- **Electron Framework** - Build cross-platform desktop apps with web technologies
- **React Frontend** - Modern React with hooks and functional components
- **TypeScript Support** - Type-safe development experience
- **Hot Reload** - Fast development with hot module replacement
- **Inter-Process Communication** - Secure main-to-renderer process messaging
- **Application Packaging** - Configured for building distributable applications
- **Auto Updates** - Ready for implementing automatic updates
- **Native Features** - Access to file system, notifications, and OS-specific features
- **Persistence** - Local data storage with Electron Store
- **Context Menu** - Right-click menu support
- **Tray Support** - System tray integration

## Quick Start

```bash
# Install dependencies
npm install

# Start development mode
npm run dev

# Package application for current platform
npm run package

# Package application for all platforms
npm run package:all

# Create distributables (installers, portable)
npm run dist
```

## Project Structure

```
/
├── assets/               # Static assets
│   ├── icons/            # Application icons
│   └── images/           # Image resources
├── src/
│   ├── main/             # Main process code
│   │   ├── ipc/          # IPC handlers
│   │   ├── menu/         # Application menus
│   │   ├── tray/         # System tray implementation
│   │   ├── updater/      # Auto-update functionality
│   │   ├── utils/        # Utility functions
│   │   ├── preload.ts    # Preload script for IPC
│   │   └── main.ts       # Main application entry
│   ├── renderer/         # Renderer process (React)
│   │   ├── components/   # UI components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── pages/        # Application pages
│   │   ├── services/     # Services for data handling
│   │   ├── styles/       # CSS/SCSS styles
│   │   ├── utils/        # Utility functions
│   │   ├── App.tsx       # Main React component
│   │   └── index.tsx     # Renderer entry point
│   └── shared/           # Shared code between processes
│       ├── constants.ts  # Shared constants
│       └── types.ts      # TypeScript interfaces/types
├── forge.config.js       # Electron Forge configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies and scripts
```

## Application Features

### Main Process

The main process handles core application functionality:

- Window management and lifecycle
- Native OS integration
- Menu and tray creation
- Security policies and permissions
- File system access
- Auto-updates

### Renderer Process

The React-based renderer provides the user interface:

- Modern React components
- State management with Context API (for more complex applications consider a dedicated library such as Zustand or Jotai)
- Routing with React Router
- Styling with CSS/SCSS
- Form handling and validation

### Inter-Process Communication

Secure communication between main and renderer processes:

- Contextbridge for exposing APIs
- Preload scripts for security
- Typed message passing
- Asynchronous request/response pattern

## Distribution

This template is configured for creating production-ready distributables:

- Windows: NSIS Installer, portable exe
- macOS: DMG, pkg installer
- Linux: AppImage, deb, rpm packages

## Environment Configuration

This template supports environment variable configuration via `.env` files during development.

1. Copy `.env.example` to `.env` in the project root.
2. Add your environment-specific variables (API keys, feature flags, etc.).
3. These variables will be loaded into `process.env` at runtime when `NODE_ENV` is `development`.

> NOTE: `.env` is gitignored. For production builds configure environment variables through your CI/CD or system environment.

## Development Features

- ESLint and Prettier for code quality
- Hot reloading for fast development
- Chrome DevTools for debugging
- Error boundary for crash handling
- Built-in support for environment variables

## Next Steps

- Customize application branding and UI
- Implement business logic and features
- Configure auto-update server
- Set up installer customization
- Add platform-specific enhancements

This template is designed to be a starting point for AI agents developing desktop applications.
