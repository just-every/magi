# --- Build Stage ---
# Use official Node.js slim image as a base
# Docker will detect the appropriate architecture automatically
FROM node:23-slim AS builder

# Install latest npm globally
RUN npm install -g npm

# Install build dependencies required for native addons (like node-pty and canvas)
RUN apt-get update && \
    apt-get install -y python3 make g++ pkg-config libpixman-1-dev libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set working directory for the build stage
WORKDIR /build

# Copy package.json and package-lock.json
COPY ./magi/package.json ./magi/package-lock.json ./

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

# Install latest npm globally and ensure fresh registry data
RUN npm install -g npm && npm update -g

# Global installs needed at runtime
RUN npm install -g ts-node esbuild @anthropic-ai/claude-code@latest @openai/codex@latest

# Install system dependencies required at runtime, including sudo and git
# Also install gosu for switching users in the entrypoint
# And include dependencies for canvas package
RUN apt-get update && \
    apt-get install -y --no-install-recommends git gosu sudo \
    libpixman-1-0 libcairo2 libpango1.0-0 libjpeg62-turbo libgif7 librsvg2-2 && \
    # Clean up apt cache
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user and group
RUN groupadd --gid ${TARGET_GID} ${GROUP_NAME} || true && \
    useradd --uid ${TARGET_UID} --gid ${TARGET_GID} -m --shell /bin/bash ${USER_NAME} && \
    # Add the user to the sudo group
    usermod -aG sudo ${USER_NAME} && \
    # Allow sudo group members to run commands without a password
    echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Create app and config directories and set permissions
RUN mkdir -p /app && chown -R ${USER_NAME}:${GROUP_NAME} /app
RUN mkdir -p /home/${USER_NAME}/.claude && \
    touch /home/${USER_NAME}/.claude/config.json && \
    touch /home/${USER_NAME}/.claude.json && \
    chown -R ${USER_NAME}:${GROUP_NAME} /home/${USER_NAME}/.claude /home/${USER_NAME}/.claude.json
RUN mkdir -p /home/${USER_NAME}/.cache && chown -R ${USER_NAME}:${GROUP_NAME} /home/${USER_NAME}/.cache && chmod -R 777 /home/${USER_NAME}/.cache # Consider if 777 is truly needed

# Set the working directory
WORKDIR /app

# Create volume mount points (ownership will be handled by entrypoint for mounted volumes)
RUN mkdir -p /magi_output /claude_shared

# Copy node_modules (including devDependencies) from the builder stage
# This layer depends only on package-lock.json changes via the builder stage
COPY --from=builder --chown=${USER_NAME}:${GROUP_NAME} /build/node_modules ./node_modules

# Copy the entrypoint script (adjust source path as needed)
COPY ./magi/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create test-custom-tool.sh for running scripts with tool context
RUN echo '#!/bin/sh\nexec node --no-deprecation --experimental-vm-modules /app/dist/utils/tool_runner.js "$@"' > /usr/local/bin/test-custom-tool.sh && \
    chmod +x /usr/local/bin/test-custom-tool.sh

# Copy the application source code
# Changes here will invalidate cache from this point onwards
COPY --chown=${USER_NAME}:${GROUP_NAME} ./magi/ ./
COPY --chown=${USER_NAME}:${GROUP_NAME} ./common/shared-types.ts ./src/types/shared-types.ts

# Build the application (runs as root)
RUN npm run build

# DO NOT switch user here - let the entrypoint script run as root initially
# The entrypoint script should use 'gosu ${USER_NAME} <command>' to run the main process as the non-root user
# USER ${USER_NAME} # <-- REMOVED THIS LINE

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# Default command if entrypoint doesn't override
CMD ["node", "--no-deprecation", "--experimental-vm-modules", "dist/magi.js"]
