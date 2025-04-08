# --- Build Stage ---
FROM node:23-slim AS builder

# Install latest npm globally and build dependencies
RUN apt-get update && \
    apt-get install -y rsync python3 make g++ --no-install-recommends && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g npm

# Set working directory for the build stage
WORKDIR /build

# Copy package files for controller
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev dependencies)
RUN npm ci

# --- Final Stage ---
FROM node:23-slim

# Install Docker CLI and other tools needed at runtime
RUN apt-get update && \
    apt-get install -y ca-certificates curl gnupg rsync git && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    chmod a+r /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && \
    apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g npm nodemon

# Create a non-root user
ARG USER_ID=1001
ARG GROUP_ID=1001
RUN groupadd -g ${GROUP_ID} magi_user && \
    useradd -u ${USER_ID} -g magi_user -m magi_user && \
    # Add user to docker group to access docker socket
    groupadd -g 998 docker || true && \
    usermod -aG docker magi_user

# Set working directory
WORKDIR /app

# Create volume mount points
RUN mkdir -p /magi_output /claude_shared /external/host && \
	chown -R magi_user:magi_user /magi_output /claude_shared /external/host

# Copy node_modules from builder stage
# This provides all dependencies separate from the mounted code
COPY --from=builder --chown=magi_user:magi_user /build/node_modules ./node_modules

COPY nodemon.json package.json tsconfig.json webpack.config.js ./

# Expose the ports
EXPOSE 3010
EXPOSE 3011

# Default command for development
# We'll run as root to have Docker socket access
# Use exec form with node directly for proper signal handling
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["dev"]
