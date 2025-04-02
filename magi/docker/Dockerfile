# --- Build Stage ---
# Use official Node.js slim image as a base
# Docker will detect the appropriate architecture automatically
FROM node:23-slim AS builder

# Install latest npm globally
RUN npm install -g npm

# Install build dependencies required for native addons (like node-pty)
RUN apt-get update && \
    apt-get install -y python3 make g++ --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set working directory for the build stage
WORKDIR /build

# Copy package.json and package-lock.json
COPY magi/package.json .
COPY magi/package-lock.json .

# Install ALL dependencies using npm ci based on lock file
# Native modules are compiled here for the build architecture
RUN --mount=type=cache,target=/root/.npm \
    npm ci


# --- Final Stage ---
# Use the same base image for consistency
FROM node:23-slim

# Define desired UID/GID using ARG for flexibility during build
# You can override these with --build-arg TARGET_UID=xxxx at docker build time
ARG TARGET_UID=1001
ARG TARGET_GID=1001
ARG USER_NAME=magi_user
ARG GROUP_NAME=magi_user

# Install latest npm globally
RUN npm install -g npm

# Global installs needed at runtime
RUN npm install -g @anthropic-ai/claude-code

# Install system dependencies required by Playwright at runtime
RUN apt-get update && \
    npx playwright install-deps chromium && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user and group, create app and config directories
RUN groupadd --gid ${TARGET_GID} ${GROUP_NAME} || true && \
    useradd --uid ${TARGET_UID} --gid ${TARGET_GID} -m --shell /bin/bash ${USER_NAME}
RUN mkdir -p /app && chown -R magi_user:magi_user /app
RUN mkdir -p /home/magi_user/.claude && \
    touch /home/magi_user/.claude/config.json && \
    touch /home/magi_user/.claude.json && \
    chown -R magi_user:magi_user /home/magi_user/.claude /home/magi_user/.claude.json
RUN mkdir -p /home/magi_user/.cache && chown -R magi_user:magi_user /home/magi_user/.cache && chmod -R 777 /home/magi_user/.cache

# Set the working directory
WORKDIR /app

# Copy node_modules (including devDependencies) from the builder stage
# This layer depends only on package-lock.json changes via the builder stage
COPY --from=builder --chown=magi_user:magi_user /build/node_modules ./node_modules

# Switch to the user that will run playwright
USER magi_user
# Run the install command - this layer is cached unless node_modules changed
RUN npx playwright install --only-shell chromium
# Switch back to root temporarily for subsequent build steps (optional but often simpler)
USER root

# Copy the entrypoint script (adjust source path as needed)
COPY magi/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Copy the application source code
# Changes here will invalidate cache from this point onwards
COPY --chown=magi_user:magi_user magi/. ./

# Build the application (runs as root)
RUN npm run build

# Switch to the final user
USER magi_user

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/magi.js"]
