# Next.js Static Site

[detailed_description]

A lightweight, optimized template for building static websites and landing pages with Next.js, React, and Tailwind CSS.

## Features

- **Next.js App Router** - Modern React framework with optimized static site generation
- **TypeScript** - Type-safe development with full type checking 
- **Tailwind CSS v4** - Utility-first CSS framework with modern `@theme inline` configuration
- **Responsive Design** - Mobile-first layouts that work across all devices
- **Dark/Light Mode** - Automatic theme switching based on user's system preferences
- **Reusable Components** - Pre-built Header and Footer components
- **TurboPack** - Enhanced development experience with fast refresh
- **ESLint** - Code quality and style consistency
- **Docker Support** - Containerized development and deployment
- **Minimal Dependencies** - Lightweight core with no unnecessary bloat

## Quick Start

```bash
# Install dependencies
npm install

# Start development server with hot-reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

Visit [http://localhost:3000](http://localhost:3000) to see your site.

## Project Structure

```
/
├── public/                  # Static assets
│   ├── logo.svg             # Example logo (used in Header)
│   └── vercel.svg           # Example asset
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── page.tsx         # Homepage with example sections
│   │   ├── not-found.tsx    # Custom 404 error page
│   │   ├── layout.tsx       # Root layout with Header/Footer
│   │   └── globals.css      # Global styles and Tailwind config
│   └── components/          # Reusable UI components
│       ├── Header.tsx       # Site header with navigation
│       └── Footer.tsx       # Site footer with links and copyright
├── .env.example             # Environment variables template
├── Dockerfile               # Docker configuration
├── next.config.ts           # Next.js configuration
├── postcss.config.mjs       # PostCSS configuration
├── tailwind.config.js       # Tailwind CSS configuration
└── package.json             # Dependencies and scripts
```

**Note about pages:** The template includes a single example page (`page.tsx`) and a custom 404 page. The navigation links in the Header and Footer components point to standard routes like `/about` and `/services`, but these pages are not included in the template. When using this template, you'll need to create these pages as needed for your specific project.

## Optimized for Static Sites

This template is specifically designed for:

- **Fast Loading** - Optimized build process for minimal bundle size
- **SEO Friendly** - Structured for better search engine performance with metadata examples
- **Content-Focused** - Clean structure for content presentation
- **Easy Deployment** - Ready for static hosting platforms
- **Simple Customization** - Clear structure for easy modification

## Design System

The template uses Tailwind CSS for styling with:
- **Geist Font** - Clean, modern typeface from Vercel
- **Automatic Dark Mode** - Uses `prefers-color-scheme` media query
- **Tailwind CSS v4** - Uses the new `@theme inline` feature for custom properties
- **Consistent spacing and typography** - Through Tailwind's utility classes
- **Responsive design patterns** - Mobile-first approach with responsive components
- **Interactive mobile menu** - Fully functional hamburger menu with animations

### Component Features

- **Header Component** - Includes:
  - Logo using `next/image` for optimization
  - Desktop navigation bar
  - Interactive mobile menu with toggle functionality
  - Smooth animations for better UX

- **Footer Component** - Includes:
  - Multiple column layout for links and information
  - Newsletter signup form
  - Social media icons
  - Responsive design for all screen sizes

### Font Usage

The template uses the Geist font family:
- `font-sans` class applies Geist Sans
- `font-mono` class applies Geist Mono

### Image Optimization

The template demonstrates the use of Next.js image optimization:
- Uses `next/image` for the site logo, showing proper width/height usage
- Automatically provides responsive images, lazy loading, and modern formats

## Environment Variables

Copy `.env.example` to `.env.local` to set up your environment variables:

```
# Key environment variables
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_NAME=Your Site Name
```

## Next Steps

- Add content pages to the `app` directory
- Customize the theme in the `tailwind.config.js` file
- Add static assets to the `public` directory
- Uncomment and configure SEO metadata in `layout.tsx`
- Configure analytics using environment variables

This template is designed to be a starting point for AI agents developing static websites, landing pages, and content-focused web applications.
