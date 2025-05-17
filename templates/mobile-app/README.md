# React Native Mobile Application

[detailed_description]

A complete, production-ready template for building cross-platform mobile applications with React Native, TypeScript, and modern best practices.

## Features

- **React Native** - Cross-platform mobile framework for iOS and Android
- **TypeScript** - Type-safe development experience
- **Expo Workflow** - Simplified development and testing
- **Navigation** - React Navigation for screen management
- **State Management** - Context API and hooks for app state (consider Zustand, Jotai, or Redux Toolkit for more complex apps)
- **UI Components** - Reusable component library
- **Authentication** - User authentication flow
- **API Integration** - Axios setup for data fetching
- **Form Handling** - Formik and Yup validation
- **Testing** - Jest and React Native Testing Library

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm start

# Start iOS simulator
npm run ios

# Start Android emulator
npm run android

# Run tests
npm test

# Build for production (using EAS Build)
npm run build:android  # For Android
npm run build:ios      # For iOS
# Or more generally:
# eas build -p <platform> --profile <profileName>
```

## Project Structure

```
/
├── app/                   # Expo Router app directory
│   ├── (auth)/            # Authentication screens
│   │   ├── login.tsx      # Login screen
│   │   ├── register.tsx   # Registration screen
│   │   └── forgot-password.tsx  # Password reset
│   ├── (tabs)/            # Main app tabs
│   │   ├── home.tsx       # Home screen
│   │   ├── profile.tsx    # User profile
│   │   └── settings.tsx   # App settings
│   ├── _layout.tsx        # Root layout
│   └── index.tsx          # Entry screen
├── assets/                # Static assets
│   ├── fonts/             # Custom fonts
│   └── images/            # Images and icons
├── components/            # Reusable UI components
│   ├── ui/                # Basic UI elements
│   └── forms/             # Form components
├── hooks/                 # Custom React hooks
├── services/              # API services
│   ├── api.ts             # API client setup
│   └── authService.ts     # Auth service with mock implementation
├── utils/                 # Utility functions
├── styles/                # Global styles
├── types/                 # TypeScript type definitions
│   ├── api.ts             # API-related type definitions
│   └── user.ts            # User-related type definitions
├── App.tsx                # Application root
├── babel.config.js        # Babel configuration
├── app.json               # Expo configuration
├── tsconfig.json          # TypeScript configuration
├── jest.config.js         # Jest test configuration
└── package.json           # Dependencies and scripts
```

## Key Components

### Authentication

The template includes a complete authentication flow:

- User registration and login with email/password
- Auth context management in `hooks/useAuth.tsx`
- Secure token storage via Expo SecureStore
- Protected routes with navigation guards
- Mock authentication service in `services/authService.ts`
- Type definitions in `types/user.ts`

### Navigation

Built with React Navigation and Expo Router:

- Tab navigation for main app screens
- Stack navigation for authentication flow
- Deep linking support
- Navigation guards for protected routes

### UI Components

Pre-built UI components for rapid development:

- Buttons, inputs, and form controls with consistent theming
- Cards and list items 
- Loading indicators
- Modal dialogs
- Toast notifications
- Complete theming system via `styles/theme.ts` with design tokens for colors, spacing, typography, and shadows

### API Integration

Ready-to-use API integration with:

- Axios client configuration
- Request/response interceptors
- Error handling
- Authentication header management

## Development Features

- Hot reloading for rapid development
- Comprehensive theming system for consistent design
- Path aliases (`@/`) for clean imports
- ESLint and Prettier for code quality
- Husky for pre-commit hooks
- Debug configurations
- Environment variable management (via Expo Constants and app.json extra)

## Next Steps

- Customize the app theme and branding
- Connect to your backend API
- Implement business logic
- Add additional screens and features
- Configure push notifications
- Set up app analytics

This template is designed to be a starting point for AI agents developing mobile applications.
