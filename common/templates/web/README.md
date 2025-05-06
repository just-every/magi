# TypeScript React Express ESBuild Boilerplate

Welcome to the TypeScript React Express ESBuild boilerplate, tailored for budding developers learning to craft MERN CRUD applications. However, this boilerplate is also ideal for anyone aiming to switch gears and utilize ESBuild over the conventional webpack.

## Overview

This boilerplate is designed with simplicity and efficiency in mind. It leverages ESBuild, known for its speed and ease of configuration, to bundle your JavaScript and styles. It provides a structured starting point for both client and server development using popular technologies like React, Express, and TypeScript.

## Features

-   **React**: For crafting intuitive UIs.
-   **Express**: A minimalist web framework for building the server-side.
-   **TypeScript**: Bringing strong typing to JavaScript, enhancing maintainability and developer experience.
-   **ESBuild**: A revolutionary fast JavaScript bundler and minifier.
-   **Bootstrap SASS**: Empower your projects with the world's most popular CSS framework, now in its SASS variant. Tailor designs seamlessly with variables and mixins.

    _Note_: While this boilerplate uses Bootstrap SASS, the flexibility of ESBuild means it's straightforward to switch plugins. For instance, you can easily incorporate PostCSS with TailwindCSS or any other preferred styling solution.

## Getting Started

1. **Install Dependencies**

    ```sh
    npm install
    ```

2. **Running in Development**
Start both client and server in development mode:
    ```sh
    npm run dev
    ```

3. **Running in Docker Composer**
    ```sh
    npm run docker:build
    npm run docker:run
    ```

## Directory Structure

Understanding the project's structure is crucial for efficiently navigating and utilizing this boilerplate. Here's a detailed breakdown of the directory tree:

```
dist/
├─ server.js
esbuild/
├─ client.dev.mjs
├─ server.dev.mjs
├─ client.prod.mjs
├─ server.prod.mjs
node_modules/
public/
├─ static/
│  ├─ bundle.js
├─ index.html
├─ favicon.ico
src/
├─ client/
│  ├─ styles/
│  │  ├─ app.scss
│  ├─ App.tsx
│  ├─ index.tsx
│  ├─ tsconfig.json
├─ server/
│  ├─ server.ts
│  ├─ tsconfig.json
.gitignore
nodemon.json
package-lock.json
package.json
README.md
tsconfig.json
```

### Top-Level Overview

-   **`dist/`**: The output directory where your server-side TypeScript files get compiled to JavaScript.

    -   `server.js`: The compiled server-side entry point. **Note**: This file and the entire `dist/` directory are not tracked on GitHub as they represent compiled production code.

-   **`esbuild/`**: Houses configuration files for the ESBuild bundler.

    -   `client.dev.mjs`: ESBuild configuration for client-side development.
    -   `server.dev.mjs`: ESBuild configuration for server-side development.
    -   `client.prod.mjs`: ESBuild configuration for client-side production.
    -   `server.prod.mjs`: ESBuild configuration for server-side production.

-   **`node_modules/`**: Standard directory for all installed npm packages.

-   **`public/`**: Serves static files and the main `index.html` for your React application.

    -   `static/`: Contains bundled output files for the client side.
        -   `bundle.js`: Bundled JavaScript for the client. **Note**: The bundled `bundle.js` is not tracked on GitHub as it is a dynamically generated file based on the source code.
    -   `index.html`: The main HTML file that serves as a shell for your React app.
    -   `favicon.ico`: The little website icon that appears in your tab/bookmarks.

-   **`src/`**: The core of your application's source code, both client-side and server-side.

    -   `client/`: Contains all client-side React components and styles.
        -   `styles/`: Directory for all your SCSS files.
            -   `app.scss`: Main style file for your application.
        -   `App.tsx`: The main React component for your application.
        -   `index.tsx`: Client-side entry point.
        -   `tsconfig.json`: TypeScript configuration specific to the client side.
    -   `server/`: Houses server-side logic using Express.
        -   `server.ts`: Entry point for the server.
        -   `tsconfig.json`: TypeScript configuration specific to the server side.

-   **`.gitignore`**: Lists files and directories that should not be tracked by Git. This includes the compiled outputs like those in the `dist/` directory and dynamically generated bundles like `app.js`.

-   **`nodemon.json`**: Configuration for Nodemon, a utility that monitors changes in your server code and automatically restarts the server.

-   **`package-lock.json`**: Automatically generated file that describes the exact tree that was generated in `node_modules` as a result of running `npm install`.

-   **`package.json`**: Lists package dependencies and contains various metadata about the project, like scripts.

-   **`README.md`**: This very file, offering a guide to the project.

-   **`tsconfig.json`**: The root TypeScript configuration file.

## Building for Production

The scripts for production builds ensure optimized performance for deployment.

1. **Building for Production**

    ```sh
    npm run build
    ```

2. **Running in Production**
    ```sh
    npm start
    ```
