FROM nikolaik/python-nodejs:python3.13-nodejs23-slim

# Install claude code
RUN npm install -g @anthropic-ai/claude-code

# Install python dependencies
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=bind,source=docker/requirements.txt,target=requirements.txt \
    python -m pip install -r requirements.txt

# Install Playwright dependencies
RUN playwright install-deps chromium

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1

# Create a non-root user
RUN useradd -m magi_user

# Create a non-root user and ensure permissions
RUN mkdir -p /home/magi_user/.claude && \
    touch /home/magi_user/.claude/config.json && \
    touch /home/magi_user/.claude.json && \
    chmod 777 /home/magi_user/.claude.json && \
    chmod -R 777 /home/magi_user/.claude && \
    chown -R magi_user:magi_user /home/magi_user/
RUN mkdir -p /app && chown -R magi_user:magi_user /app

# Create output directories with proper permissions
RUN mkdir -p /magi_output && chmod 777 /magi_output
RUN mkdir -p /claude_shared && chmod 777 /claude_shared

# Switch to non-root user
USER magi_user

# No COPY command for magi folder - we'll mount it as a volume instead
WORKDIR /app

# Install browser for the non-root user and create required directories
RUN mkdir -p /home/magi_user/.cache && \
    mkdir -p /home/magi_user/screenshots && \
    chmod -R 777 /home/magi_user/.cache

# Install Playwright chromium for magi_user
RUN playwright install chromium

# Set environment variable for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/home/magi_user/.cache/ms-playwright

# Command to run when container starts
CMD ["python", "magi/magi.py"]
