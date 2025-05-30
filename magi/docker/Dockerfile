###############################################################################
# Stage 0 – Grab current `latest` tag numbers (runs quickly, every build)
###############################################################################
FROM node:23-slim AS latest-versions

RUN set -e; \
    npm view @anthropic-ai/claude-code  dist-tags.latest  > /tmp/CLAUDE_VER && \
    npm view @openai/codex              dist-tags.latest  > /tmp/CODEX_VER

###############################################################################
# Stage 1 – Build the application's dependencies
###############################################################################
FROM node:23-slim AS builder

RUN npm install -g npm
RUN apt-get update && \
    apt-get install -y python3 make g++ pkg-config \
                       libpixman-1-dev libcairo2-dev libpango1.0-dev \
                       libjpeg-dev libgif-dev librsvg2-dev --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy common files
COPY ./common/ ./common/

COPY ./magi/package.json ./magi/package-lock.json ./

# Install dependencies (updated for stream_end)
# Don't use --ignore-scripts so native modules like node-pty get built
RUN --mount=type=cache,target=/root/.npm \
    npm install

###############################################################################
# Stage 2 – Final runtime image
###############################################################################
FROM node:23-slim

########################################################################
# ---- System & global tooling ----------------------------------------
########################################################################
ARG TARGET_UID=1001
ARG TARGET_GID=1001
ARG USER_NAME=magi_user
ARG GROUP_NAME=magi_user

RUN npm install -g npm && npm update -g
RUN npm install -g ts-node esbuild

RUN apt-get update && \
    apt-get install -y --no-install-recommends git gosu sudo ripgrep \
                       libpixman-1-0 libcairo2 libpango1.0-0 libjpeg62-turbo \
                       libgif7 librsvg2-2 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid ${TARGET_GID} ${GROUP_NAME} || true && \
    useradd  --uid ${TARGET_UID} --gid ${TARGET_GID} -m --shell /bin/bash ${USER_NAME} && \
    usermod  -aG sudo ${USER_NAME} && \
    echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

########################################################################
# ---- App directory setup --------------------------------------------
########################################################################
RUN mkdir -p /app /magi_output /claude_shared /custom_tools && \
    chown -R ${USER_NAME}:${GROUP_NAME} /app

WORKDIR /app

RUN mkdir -p /home/${USER_NAME}/.claude /home/${USER_NAME}/.cache && \
    touch /home/${USER_NAME}/.claude/config.json && \
    touch /home/${USER_NAME}/.claude.json && \
    chown -R ${USER_NAME}:${GROUP_NAME} /home/${USER_NAME}/.claude \
           /home/${USER_NAME}/.claude.json /home/${USER_NAME}/.cache && \
    chmod -R 777 /home/${USER_NAME}/.cache   # tighten if possible

########################################################################
# ---- Bring in project dependencies ----------------------------------
########################################################################
COPY --from=builder --chown=${USER_NAME}:${GROUP_NAME} /build/node_modules ./node_modules
# Ensemble and mech packages are now installed from npm

########################################################################
# ---- 1️⃣  Install exact AI CLI versions (cached until new tags) -----
########################################################################
COPY --from=latest-versions /tmp/CLAUDE_VER /tmp/
COPY --from=latest-versions /tmp/CODEX_VER  /tmp/

RUN --mount=type=cache,target=/root/.npm \
    set -e; \
    CLAUDE=$(cat /tmp/CLAUDE_VER); \
    CODEX=$(cat /tmp/CODEX_VER); \
    npm install -g "@anthropic-ai/claude-code@$CLAUDE" "@openai/codex@$CODEX"

########################################################################
# ---- 2️⃣  Copy source & build (only these layers redo on edits) -----
########################################################################
COPY --chown=${USER_NAME}:${GROUP_NAME} ./magi/ ./
COPY --chown=${USER_NAME}:${GROUP_NAME} ./common/shared-types.ts ./src/types/shared-types.ts

# Build with stream_end support
RUN npm run build

########################################################################
# ---- Entrypoint ------------------------------------------------------
########################################################################
COPY ./magi/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN echo '#!/bin/sh\nexec node --no-deprecation --experimental-vm-modules /app/dist/utils/tool_runner.js "$@"' \
    > /usr/local/bin/test-custom-tool.sh && chmod +x /usr/local/bin/test-custom-tool.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "--no-deprecation", "--experimental-vm-modules", "dist/magi.js"]
