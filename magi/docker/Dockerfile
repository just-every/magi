FROM nikolaik/python-nodejs:python3.13-nodejs23-slim

# Install claude code
RUN npm install -g @anthropic-ai/claude-code

# Install python dependencies
COPY magi/docker/requirements.txt /app/magi/docker/requirements.txt
RUN pip install -r /app/magi/docker/requirements.txt
RUN rm /app/magi/docker/requirements.txt

# Install playwright
RUN python -m playwright install

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

# Switch to non-root user
USER magi_user

# No COPY command for magi folder - we'll mount it as a volume instead
WORKDIR /app

# Command to run when container starts
CMD ["python", "magi/magi.py"]
