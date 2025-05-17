# Web Application

// Next.js 13+ App Router with TypeScript
// Features authentication, database integration, and UI components

This is a full-stack web application built with Next.js App Router, React, TypeScript, NextAuth for authentication, and Prisma ORM for database integration. It provides a complete foundation for building modern web applications with user authentication, database access, and server-side rendering.

## Core Modules & Files

// App Router with Server Components
// NextAuth.js for authentication
// Prisma ORM for database access

- `src/app/page.tsx`: Main homepage component
- `src/app/layout.tsx`: Root layout with providers
- `src/app/providers.tsx`: Client-side providers for React context
- `src/app/api/auth/[...nextauth]/route.ts`: NextAuth.js configuration and routes
- `src/app/login/`: User login page and form components
- `src/app/register/`: User registration page and form components
- `src/components/`: Reusable React components
- `src/components/ui/`: UI component library
- `src/lib/prisma.ts`: Prisma client singleton
- `prisma/schema.prisma`: Database schema definition

## `project_map.json`

// Project structure overview

- `project_map.json`: Contains a detailed overview of the project structure, frameworks, and entry points.

## Common Bash Commands

```bash
# Installation and Setup
npm install           # Install dependencies
npx prisma generate   # Generate Prisma client
npx prisma db push    # Push schema to database
npx prisma studio     # Open Prisma database viewer
npm run dev           # Start development server

# Development
npm run lint          # Run ESLint to check code quality
npm run format        # Format code with Prettier
npm test              # Run Jest tests

# Building and Deployment
npm run build         # Build for production
npm start             # Start production server
```

## Code Style Guidelines

// Use Server Components for data fetching
// Use Client Components for interactivity
// Use Tailwind for styling

- Follow TypeScript best practices with strict type checking
- Use Next.js App Router for routing and layouts
- Implement React Server Components where appropriate
- Use client-side components only when necessary (interactivity, hooks)
- Follow component organization by feature
- Use Tailwind CSS for styling with consistent design tokens
- Implement proper form validation and error handling

## Testing Instructions

// Unit tests should be placed in __tests__ directories

- Run tests with `npm test`
- Add unit tests in `__tests__` directories
- Test both client and server components
- Use React Testing Library for component tests
- Test authentication flows thoroughly

## Repository Etiquette

// Include screenshots for UI changes

- Branch names: `feature/short-description`, `fix/issue-summary`
- Use conventional commits (e.g., `feat:`, `fix:`, `chore:`)
- Pull requests should target the main branch
- Include component screenshots for UI changes
- Document API changes

## Developer Environment Setup

// Node.js 18+ required
// PostgreSQL database required
// Environment variables in .env.local

- Requires Node.js 18.x or higher
- PostgreSQL database (local or remote)
- Install dependencies: `npm install`
- Set up environment variables: copy `.env.example` to `.env.local`
- Generate Prisma client: `npx prisma generate`
- Push database schema: `npx prisma db push`
- Start development server: `npm run dev`
- Access the app at http://localhost:3000

## Project-Specific Warnings

// IMPORTANT: Server Components cannot use hooks or browser APIs
// NextAuth requires proper secret configuration
// Handle database connections properly

- Ensure database connection is properly configured in `.env.local`
- NextAuth requires proper secret configuration for production
- Server Components cannot use browser APIs or React hooks
- API routes should include proper error handling
- Sensitive operations should have proper authorization checks
- Handle database connection pooling for production

## Key Utility Functions / APIs

// Prisma client is a singleton
// NextAuth provides session and auth utilities

- `src/lib/prisma.ts`: Prisma client for database access
- `src/lib/utils.ts`: Utility functions
- `src/app/api/auth/[...nextauth]/route.ts`: NextAuth configuration
- `src/components/ui/`: Reusable UI components
- NextAuth.js session and authentication utilities

## Next.js Best Practices

// Use Server Components for data fetching
// Use metadata for SEO optimization
// Use route groups for organization

- Use Server Components for data fetching
- Implement proper metadata for SEO
- Use image optimization with `next/image`
- Implement proper error handling with error.tsx files
- Use route groups for organizing related routes
- Implement proper loading states with loading.tsx files
- Leverage server actions for form submissions