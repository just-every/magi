FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install additional dependencies for OpenAI Agents
RUN pip install --no-cache-dir openai docker

# Copy application files
COPY . .

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Create a startup script with proper logging
RUN echo '#!/bin/bash\necho "MAGI System Container starting..."\necho "Environment: $(env | grep -v API_KEY)"\necho "Command to execute: $COMMAND"\nif [ -n "$COMMAND" ]; then\n  echo "Executing command: $COMMAND"\n  python -c "import os; print(f\"Processing command: {os.environ.get(\"COMMAND\", \"\")}\")" 2>&1\nfi\ntail -f /dev/null' > /app/start.sh && chmod +x /app/start.sh

# Command to run when container starts
CMD ["/app/start.sh"]