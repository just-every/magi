# Mobile Application

[detailed_description]

This is a production-ready mobile app template built with React Native, TypeScript, and Expo. It features authentication flows, file-based navigation with Expo Router, and a reusable component library. The app is designed for iOS and Android platforms with a focus on maintainability and developer experience.

## Core Modules & Files

- `App.tsx`: Main entry point and provider wrapper
- `app/index.tsx`: Home screen component
- `app/_layout.tsx`: Root layout and navigation container
- `app/(auth)/`: Authentication screens (login, register, forgot-password)
- `app/(tabs)/`: Main application tabs (home, profile, settings)
- `components/ui/`: Reusable UI components
- `hooks/useAuth.tsx`: Authentication state management
- `services/`: API and authentication services
- `styles/theme.ts`: Global theming and styling constants

## `project_map.json`

- `project_map.json`: Contains a detailed overview of the project structure, frameworks, and entry points.

## Common Bash Commands

```bash
# Installation and Setup
npm install           # Install dependencies
npx expo start        # Start the development server
npx expo start --clear # Start with clean cache

# Development
npm run lint          # Run ESLint to check code quality
npm run format        # Format code with Prettier
npm test              # Run Jest tests

# Building and Preview
npx expo prebuild     # Generate native projects
expo build:android    # Build Android APK/AAB
expo build:ios        # Build iOS archive
expo publish          # Publish to Expo servers
```

## Code Style Guidelines

- Follow TypeScript best practices with strict type checking
- Use functional components with hooks
- Implement screen and component organization by feature
- Use Expo Router for navigation (file-based routing)
- Separate business logic from UI components
- Follow React Native performance best practices
- Use theme variables for consistent styling

## Testing Instructions

- Run tests with `npm test`
- Use Jest for unit and component testing
- Consider Detox for end-to-end testing
- Test on both iOS and Android platforms
- Verify functionality on different screen sizes

## Repository Etiquette

- Branch names: `feature/short-description`, `fix/issue-summary`
- Use conventional commits (e.g., `feat:`, `fix:`, `chore:`)
- Pull requests should target the main branch
- Include screenshots for UI changes
- Document significant API changes

## Developer Environment Setup

- Requires Node.js 16.x or higher
- Install dependencies: `npm install`
- Install Expo CLI: `npm install -g expo-cli`
- For iOS development: XCode and CocoaPods
- For Android development: Android Studio and JDK
- Start development server: `npx expo start`
- Access via Expo Go app or simulator/emulator

## Project-Specific Warnings

- Always test on both iOS and Android
- Be mindful of platform-specific behavior differences
- Handle authentication token expiration properly
- Use React Navigation hooks only in screens within navigation context
- Expo Router only works within components under `app/` directory
- Beware of memory leaks from unremoved event listeners

## Key Utility Functions / APIs

- `hooks/useAuth.tsx`: Authentication state management
- `services/api.ts`: API client setup
- `services/authService.ts`: Auth-related network requests
- `styles/theme.ts`: UI theming constants
- Expo libraries for device capabilities (camera, location, etc.)

## Mobile App Best Practices

- Implement proper form validation
- Handle offline/online state gracefully
- Optimize images and assets for mobile
- Implement proper keyboard handling
- Use responsive design patterns
- Cache network requests where appropriate
- Add loading indicators for asynchronous operations