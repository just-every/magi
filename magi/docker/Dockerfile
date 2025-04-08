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
COPY package.json .
COPY package-lock.json .

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
RUN npm install -g @anthropic-ai/claude-code@latest

# Install system dependencies required by Playwright and gosu at runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends git gosu && \
    npx playwright install-deps chromium && \
    # Clean up apt cache
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user and group, create app and config directories
RUN groupadd --gid ${TARGET_GID} ${GROUP_NAME} || true && \
    useradd --uid ${TARGET_UID} --gid ${TARGET_GID} -m --shell /bin/bash ${USER_NAME}
RUN mkdir -p /app && chown -R ${USER_NAME}:${GROUP_NAME} /app
RUN mkdir -p /home/${USER_NAME}/.claude && \
    touch /home/${USER_NAME}/.claude/config.json && \
    touch /home/${USER_NAME}/.claude.json && \
    chown -R ${USER_NAME}:${GROUP_NAME} /home/${USER_NAME}/.claude /home/${USER_NAME}/.claude.json
RUN mkdir -p /home/${USER_NAME}/.cache && chown -R ${USER_NAME}:${GROUP_NAME} /home/${USER_NAME}/.cache && chmod -R 777 /home/${USER_NAME}/.cache # Consider if 777 is truly needed

# Set the working directory
WORKDIR /app

# Create volume mount points (ownership will be handled by entrypoint for mounted volumes)
# The chown command previously here was removed as it's ineffective for runtime volumes.
RUN mkdir -p /magi_output /claude_shared

# Copy node_modules (including devDependencies) from the builder stage
# This layer depends only on package-lock.json changes via the builder stage
COPY --from=builder --chown=${USER_NAME}:${GROUP_NAME} /build/node_modules ./node_modules

# Switch to the user that will run playwright install
USER ${USER_NAME}
# Run the install command - this layer is cached unless node_modules changed
RUN npx playwright install --only-shell chromium
# Switch back to root temporarily for subsequent build steps
USER root

# Copy the entrypoint script (adjust source path as needed)
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Copy the application source code
# Changes here will invalidate cache from this point onwards
COPY --chown=${USER_NAME}:${GROUP_NAME} . ./

# Build the application (runs as root)
RUN npm run build

# DO NOT switch user here - let the entrypoint script run as root initially
# USER ${USER_NAME} # <-- REMOVED THIS LINE

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# Default command if entrypoint doesn't override
CMD ["node", "dist/magi.js"]
