# Next.js Full-Stack Web Application

[detailed_description]

A complete, production-ready template for building full-stack web applications with user authentication, database integration, and modern UI components.

## Features

- **Next.js App Router** - Latest Next.js framework with React Server Components
- **TypeScript** - Type-safe development experience with full type checking
- **Authentication** - NextAuth implementation with JWT and session management
- **Database Integration** - Prisma ORM with PostgreSQL support and migrations
- **Form Handling** - React Hook Form with Zod validation
- **UI Components** - Radix UI primitives with Tailwind CSS styling
- **Docker Support** - Containerized development and deployment
- **API Routes** - Built-in backend API with proper routing
- **Turbopack** - Enhanced development experience with faster builds and hot reloading

## Quick Start

```bash
# Install dependencies
npm install

# Initialize database (first-time setup)
npx prisma migrate dev
npx prisma db seed

# Start development server with hot-reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

Visit [http://localhost:3000](http://localhost:3000) to see your application.

## Project Structure

```
/
├── prisma/                  # Database schema and seeds
│   ├── schema.prisma        # Database models and relationships
│   └── seed.ts              # Initial data for development
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── api/             # Backend API routes
│   │   │   ├── auth/        # Authentication endpoints
│   │   │   └── users/       # User data endpoints
│   │   ├── login/           # User login page
│   │   ├── register/        # User registration page
│   │   ├── page.tsx         # Homepage
│   │   └── layout.tsx       # Root layout with providers
│   ├── components/          # Reusable UI components
│   │   ├── Header.tsx       # Navigation header with authentication status
│   │   ├── logout.tsx       # Logout button component
│   │   └── ui/              # Design system components
│   ├── lib/                 # Utilities and shared code
│   │   ├── prisma.ts        # Database client
│   │   └── utils.ts         # Helper functions
│   └── types/               # TypeScript declarations
│       └── next-auth.d.ts   # NextAuth type extensions
├── Dockerfile               # Docker configuration
├── next.config.ts           # Next.js configuration
└── package.json             # Dependencies and scripts
```

## Authentication

The template includes a complete authentication system with:

- User registration with password hashing (using bcrypt)
- Login functionality with JWT session handling
- Enhanced session with user ID, name, and email available client-side
- Protected routes and API endpoints
- User profile display in the header when logged in

## Database Integration

Prisma ORM is preconfigured with:
- PostgreSQL database connection
- Migration system for schema changes
- Seed script for initial data population
- Type-safe database queries

## UI Components

The template provides a set of ready-to-use UI components:
- Form inputs with validation
- Buttons with various styles
- Layout components for consistent design
- Responsive design with Tailwind CSS

## Next Steps

- Customize the authentication flow for your application
- Extend the database schema for your data model
- Create additional API endpoints
- Add more UI components and pages
- Configure deployment settings

This template is designed to be a starting point for AI agents developing full-stack web applications.
