#!/usr/bin/env python3
"""
Build the Docker image for MAGI System.
"""
import sys
import os
import subprocess

# Keep the function here for backward compatibility
def build_docker_image():
    """Build the Docker image for MAGI System."""
    try:
        # Get the project root directory
        project_root = os.path.dirname(os.path.abspath(__file__))
        dockerfile_path = os.path.join(project_root, "magi", "Dockerfile")
        
        # Check if Dockerfile exists
        if not os.path.exists(dockerfile_path):
            print(f"Error: Dockerfile not found at {dockerfile_path}")
            return False
            
        # Build the Docker image
        print(f"Building Docker image from {dockerfile_path}...")
        result = subprocess.run(
            ["docker", "build", "-t", "magi-system:latest", "-f", dockerfile_path, project_root],
            check=False,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"Docker build failed: {result.stderr}")
            return False
            
        print("Docker image 'magi-system:latest' built successfully")
        return True
        
    except Exception as e:
        print(f"Error building Docker image: {str(e)}")
        return False

if __name__ == "__main__":
    success = build_docker_image()
    sys.exit(0 if success else 1)