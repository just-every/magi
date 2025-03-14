#!/usr/bin/env python3
"""
Build the Docker image for MAGI System.
"""
import subprocess
import os
import sys

def build_docker_image():
    """Build the Docker image."""
    print("Building MAGI System Docker image...")
    
    # Get the current directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Run docker build command
    try:
        result = subprocess.run(
            ["docker", "build", "-t", "magi-system:latest", current_dir],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        print(result.stdout)
        print("Docker image built successfully!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error building Docker image: {e}")
        print(e.stderr)
        return False

if __name__ == "__main__":
    success = build_docker_image()
    sys.exit(0 if success else 1)