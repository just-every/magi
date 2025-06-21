# CI/CD Pipeline Documentation

This document explains the Continuous Integration/Continuous Deployment (CI/CD) pipeline for the MAGI project, implemented using GitHub Actions.

## Workflow Setup

The CI/CD pipeline is defined in the `.github/workflows/ci.yml` file. This workflow is automatically triggered on `push` and `pull_request` events targeting the `main` branch.

## Jobs

The pipeline consists of the following jobs, executed in a specific order to ensure code quality and proper functionality:

### 1. Lint & Type-Check

- **Purpose:** This job ensures code quality and catches static analysis errors early in the development cycle.
- **Steps:**
    - Installs project dependencies using `npm ci` (clean install for CI environments).
    - Runs ESLint (`npm run lint`) to enforce code style and identify potential issues.
    - Executes the TypeScript compiler (`npm run type-check`) to verify type correctness.

### 2. Test & Coverage

- **Purpose:** This job runs all unit tests and measures code coverage to prevent regressions and ensure sufficient test coverage.
- **Steps:**
    - Installs project dependencies using `npm ci`.
    - Runs all unit tests using Vitest (`npm test -- --coverage`).
    - **Coverage Threshold:** (Note: The current configuration assumes Vitest itself will enforce a coverage threshold if configured in `package.json` or `vitest.config.ts`. Future enhancements might involve dedicated GitHub Actions for coverage reporting and threshold enforcement).

### 3. Build

- **Purpose:** This job performs a full production build of the project to ensure that the application compiles correctly and is ready for deployment.
- **Steps:**
    - Installs project dependencies using `npm ci`.
    - Executes the build command (`npm run build`).

### 4. Smoke Test (Recommended)

- **Purpose:** This optional but highly recommended job ensures that the application starts up correctly and its key functionalities are operational in a Dockerized environment.
- **Dependencies:** This job `needs` the `build` job to complete successfully, as it relies on the built artifacts.
- **Steps:**
    - Checks out the code.
    - Builds and spins up the Docker environment using `docker-compose up --build -d`.
    - Waits for a specified duration (`sleep 60`) to allow services to initialize.
    - Runs a set of basic smoke tests (placeholder: `echo "Running smoke tests..."`). This step should be replaced with actual commands to execute your smoke tests.
    - Tears down the Docker environment (`docker-compose down`) in an `always()` block to ensure cleanup even if tests fail.

## Status Badges

Status badges will be added to the `README.md` file to visually represent the current status of the CI/CD pipeline jobs (Build, Test, and Coverage). These badges provide a quick overview of the project's health.

## Branch Protection

To maintain code quality and stability, branch protection rules will be configured on the `main` branch in GitHub. These rules will require the successful completion of all CI checks (Lint & Type-Check, Test & Coverage, Build, and Smoke Test) before any pull request can be merged into the `main` branch.
