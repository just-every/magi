# --- Build Stage ---
FROM node:23-slim AS builder

# Install latest npm globally and build dependencies
RUN apt-get update && \
    apt-get install -y rsync python3 make g++ --no-install-recommends && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g npm && npm update -g

# Set working directory for the build stage
WORKDIR /build

# Copy built ensemble package to node_modules
COPY ./common/ ./common/

# Copy package files for controller
COPY  ./controller/package.json ./package.json
COPY  ./controller/package-lock.json ./package-lock.json

# Install ALL dependencies (including dev dependencies)
RUN npm install

# --- Final Stage ---
FROM node:23-slim

# Install Docker CLI and other tools needed at runtime
RUN apt-get update && \
    apt-get install -y ca-certificates curl gnupg rsync git && \
    # Update ca-certificates to ensure we have the latest root certificates
    update-ca-certificates && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    chmod a+r /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && \
    apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user
ARG TARGET_UID=1001
ARG TARGET_GID=1001
ARG USER_NAME=magi_user
ARG GROUP_NAME=magi_user
RUN groupadd --gid ${TARGET_GID} ${GROUP_NAME} || true && \
    useradd --uid ${TARGET_UID} --gid ${TARGET_GID} -m --shell /bin/bash ${USER_NAME}

# Add user to docker group to access docker socket
RUN groupadd -g 998 docker || true && \
    usermod -aG docker ${USER_NAME}

# Create volume mount points
RUN mkdir -p /magi_output /magi_auth /external/host /custom_tools && \
        chown -R ${USER_NAME}:${GROUP_NAME} /magi_output /magi_auth /external/host /custom_tools

# Expose the ports
EXPOSE 3010
EXPOSE 3011

# Set working directory
WORKDIR /app

# Copy node_modules from builder stage
# This provides all dependencies separate from the mounted code
COPY --from=builder --chown=${USER_NAME}:${GROUP_NAME} /build/node_modules ./node_modules
# Ensemble package is now installed from npm

# Copy the application source code
# Changes here will invalidate cache from this point onwards
COPY --chown=${USER_NAME}:${GROUP_NAME} ./controller/ ./
COPY --chown=${USER_NAME}:${GROUP_NAME} ./common/ ../common/
COPY --chown=${USER_NAME}:${GROUP_NAME} ./db/ ./db/
COPY --chown=${USER_NAME}:${GROUP_NAME} ./templates/ ./templates/

# Build the application (runs as root)
RUN npm run build:docker

# Default command for development
# We'll run as root to have Docker socket access
# Use exec form with node directly for proper signal handling
COPY ./controller/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["dev"]
