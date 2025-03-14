"""
Docker container management for MAGI System.
"""
import os
import docker
import asyncio
from typing import Dict, Optional, List

class DockerManager:
    """Manages Docker containers for processes."""
    
    def __init__(self):
        """Initialize the Docker client."""
        self.client = docker.from_env()
        self.containers: Dict[str, docker.models.containers.Container] = {}
        
    async def create_container(self, process_id: str, env_vars: Optional[Dict[str, str]] = None) -> str:
        """
        Create a Docker container for running OpenAI agents.
        
        Args:
            process_id: Unique identifier for the process
            env_vars: Environment variables to pass to the container
            
        Returns:
            Container ID
        """
        try:
            # Set default environment variables if not provided
            if env_vars is None:
                env_vars = {}
                
            # Add PROCESS_ID to environment variables
            env_vars['PROCESS_ID'] = process_id
            
            # Create environment variable list
            env_list = [f"{key}={value}" for key, value in env_vars.items()]
            
            # Create the container
            container = self.client.containers.run(
                "magi-system:latest",  # Image name (should match what you build with docker build)
                # Use a command that outputs an initial message and then keeps running
                command="sh -c 'echo \"Container started successfully. Ready to process commands.\" && tail -f /dev/null'",
                detach=True,
                environment=env_list,
                remove=False,  # Don't auto-remove container so we can get logs
                volumes={
                    os.path.abspath('.'): {'bind': '/app', 'mode': 'rw'}
                },
                tty=True,  # Keep container running until we explicitly stop it
                stdin_open=True  # Keep STDIN open to prevent early exit
            )
            
            # Store the container reference
            self.containers[process_id] = container
            
            return container.id
            
        except Exception as e:
            # Log the error and re-raise
            print(f"Error creating Docker container: {str(e)}")
            raise
    
    async def send_input(self, process_id: str, input_text: str) -> bool:
        """
        Send input to a running container by executing a command with the input.
        
        Args:
            process_id: Process ID associated with the container
            input_text: Input text to send
            
        Returns:
            Success status
        """
        if process_id not in self.containers:
            return False
        
        try:
            container = self.containers[process_id]
            
            # First check if the container is still running
            try:
                container.reload()
                if container.status != 'running':
                    print(f"Cannot send input - container {process_id} status: {container.status}")
                    return False
            except Exception as reload_e:
                print(f"Error checking container status: {str(reload_e)}")
                return False
            
            # Save input to a file inside the container
            container.exec_run(f"sh -c \"echo '{input_text}' >> /tmp/input.txt\"")
            
            # Execute the command using the input (simulating command execution)
            result = container.exec_run(
                f"sh -c \"cd /app && python -c 'import os; print(f\\\"Processing input: {input_text}\\\"); print(\\\"Command output would appear here\\\")'\"",
                workdir="/app"
            )
            
            # Log the command execution result
            print(f"Command execution result ({process_id}): {result.exit_code}")
            if result.exit_code != 0:
                print(f"Command execution error: {result.output.decode('utf-8')}")
                
            return True
        except Exception as e:
            print(f"Error sending input to container: {str(e)}")
            return False
    
    async def stop_container(self, process_id: str) -> bool:
        """
        Stop a running container and remove it.
        
        Args:
            process_id: Process ID associated with the container
            
        Returns:
            Success status
        """
        if process_id not in self.containers:
            return False
        
        try:
            container = self.containers[process_id]
            # Get logs before stopping
            try:
                logs = container.logs().decode('utf-8')
                print(f"Container {process_id} logs before stopping: {logs}")
            except Exception as log_e:
                print(f"Error getting logs before stop: {str(log_e)}")
                
            # Stop the container
            container.stop(timeout=2)
            
            # Remove the container to prevent accumulation
            try:
                container.remove()
            except Exception as rm_e:
                print(f"Error removing container: {str(rm_e)}")
                
            # Remove from our tracking dict
            del self.containers[process_id]
            return True
        except Exception as e:
            print(f"Error stopping container: {str(e)}")
            return False
    
    async def get_logs(self, process_id: str, tail: Optional[int] = 100) -> str:
        """
        Get logs from a container.
        
        Args:
            process_id: Process ID associated with the container
            tail: Number of log lines to return
            
        Returns:
            Container logs
        """
        if process_id not in self.containers:
            return "Container not found or not running"
        
        try:
            container = self.containers[process_id]
            
            # First check if the container is still running
            try:
                container.reload()
                status = container.status
                
                # If the container has exited, refresh it once more to be sure
                if status == 'exited':
                    container.reload()
            except Exception as reload_e:
                return f"Container status check failed: {str(reload_e)}"
            
            # Get logs with a shorter timeout to prevent blocking
            try:
                logs = container.logs(tail=tail).decode('utf-8')
                if not logs:
                    # Run a command to generate a log message
                    container.exec_run("echo 'Container is active and running. Waiting for command execution.'")
                    # Try to get logs again
                    logs = container.logs(tail=tail).decode('utf-8')
                    if not logs:
                        return "Container is running but waiting for activity. You can send input to start processing."
                return logs
            except Exception as log_e:
                return f"Error retrieving logs: {str(log_e)}"
                
        except Exception as e:
            return f"Error accessing container: {str(e)}"
    
    def cleanup(self):
        """Stop and remove all running containers."""
        for process_id, container in list(self.containers.items()):
            try:
                # Get logs before stopping
                try:
                    logs = container.logs().decode('utf-8')
                    print(f"Container {process_id} logs before cleanup: {logs}")
                except Exception as log_e:
                    print(f"Error getting logs during cleanup: {str(log_e)}")
                    
                # Stop the container
                container.stop(timeout=1)
                
                # Remove the container
                try:
                    container.remove()
                except Exception as rm_e:
                    print(f"Error removing container during cleanup: {str(rm_e)}")
            except Exception as e:
                print(f"Error during container cleanup: {str(e)}")
        
        self.containers = {}