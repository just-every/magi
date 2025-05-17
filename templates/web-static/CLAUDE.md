# Static Website

[detailed_description]

This is a modern static website template built with Next.js, React, TypeScript, and Tailwind CSS. It's optimized for fast loading, SEO performance, and developer experience. The template provides a minimal yet complete foundation for building static websites with modern web technologies.

## Core Modules & Files

- `src/app/page.tsx`: Main homepage component
- `src/app/layout.tsx`: Root layout component
- `src/app/not-found.tsx`: Custom 404 page
- `src/app/globals.css`: Global styles including Tailwind imports
- `src/components/Header.tsx`: Site header with navigation
- `src/components/Footer.tsx`: Site footer
- `public/`: Static assets served by Next.js
- `next.config.ts`: Next.js configuration
- `tailwind.config.js`: Tailwind CSS configuration

## `project_map.json`

- `project_map.json`: Contains a detailed overview of the project structure, frameworks, and entry points.

## Common Bash Commands

```bash
# Installation and Setup
npm install           # Install dependencies
npm run dev           # Start development server

# Development
npm run lint          # Run ESLint to check code quality
npm run format        # Format code with Prettier

# Building and Deployment
npm run build         # Build for production
npm start             # Start production server
npm run analyze       # Analyze bundle size
```

## Code Style Guidelines

- Follow TypeScript best practices with strict type checking
- Use Next.js App Router for routing and layouts
- Implement React Server Components for static content
- Use client-side components only when necessary
- Follow component organization by feature
- Use Tailwind CSS for styling with consistent design tokens
- Follow semantic HTML practices for accessibility

## Testing Instructions

- Run tests with `npm test`
- Add unit tests for components when applicable
- Use React Testing Library for component tests
- Verify responsive design across device sizes
- Test across different browsers

## Repository Etiquette

- Branch names: `feature/short-description`, `fix/issue-summary`
- Use conventional commits (e.g., `feat:`, `fix:`, `chore:`)
- Pull requests should target the main branch
- Include screenshots for visual changes
- Document significant changes

## Developer Environment Setup

- Requires Node.js 18.x or higher
- Install dependencies: `npm install`
- Start development server: `npm run dev`
- Access the site at http://localhost:3000
- Enable development builds with `NODE_ENV=development`

## Project-Specific Warnings

- Server Components cannot use browser APIs or React hooks
- Handle metadata properly for SEO optimization
- Optimize images using Next.js Image component
- Be mindful of client-side JavaScript size
- Static exports require special configuration
- Verify output in production build before deployment

## Key Utility Functions & APIs

- Next.js Image component for optimized images
- Next.js Link component for client-side navigation
- Next.js Head component for metadata
- Tailwind CSS utility classes
- TypeScript type definitions

## Next.js Best Practices

- Use Server Components for static content
- Implement proper metadata for SEO
- Use image optimization with next/image
- Implement proper error handling with error.tsx
- Use proper caching strategies
- Follow Next.js directory structure conventions
- Keep client-side JavaScript minimal