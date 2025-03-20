"""Module for managing code repositories for MAGI self-optimization."""

import os
import shutil
import subprocess
import tempfile
import logging
import uuid
from pathlib import Path
from typing import Optional, List, Tuple, Dict, Any

logger = logging.getLogger(__name__)

class CodeRepository:
    """Manages a code repository for self-optimization.
    
    Handles copying the MAGI codebase to a temporary directory,
    making modifications, and executing the modified code.
    """
    
    def __init__(self, source_dir: Optional[str] = None):
        """Initialize the repository manager.
        
        Args:
            source_dir: Source directory of the MAGI codebase (defaults to current)
        """
        # Get the source directory (MAGI root directory)
        if source_dir is None:
            # Go up two levels: utils -> magi -> magi-system
            current_file = Path(__file__).resolve()
            self.source_dir = str(current_file.parent.parent.parent)
        else:
            self.source_dir = source_dir
            
        # Create a unique ID for this optimization session
        self.session_id = str(uuid.uuid4())[:8]
        
        # Initialize directory paths
        self._target_dir = None
        self._working_dir = None
        
    @property
    def target_dir(self) -> Optional[str]:
        """Get the target directory where the code is copied."""
        return self._target_dir
        
    @property
    def working_dir(self) -> Optional[str]:
        """Get the working directory within the target directory."""
        return self._working_dir
        
    def copy_repository(self) -> str:
        """Copy the MAGI repository to a temporary directory.
        
        Returns:
            Path to the copied repository
        """
        # Create temporary directory
        temp_dir = tempfile.mkdtemp(prefix=f"magi-self-optimize-{self.session_id}-")
        self._target_dir = temp_dir
        
        logger.info(f"Copying repository from {self.source_dir} to {temp_dir}")
        
        # Exclude large/unnecessary directories
        exclude_dirs = ['.git', 'node_modules', '__pycache__', 'venv', 'dist']
        
        # Create working directory
        working_dir = os.path.join(temp_dir, "magi-system")
        os.makedirs(working_dir, exist_ok=True)
        self._working_dir = working_dir
        
        # Copy only relevant files
        for item in os.listdir(self.source_dir):
            src_path = os.path.join(self.source_dir, item)
            dst_path = os.path.join(working_dir, item)
            
            # Skip excluded directories
            if item in exclude_dirs:
                continue
                
            # Copy directories or files
            if os.path.isdir(src_path):
                shutil.copytree(
                    src_path, 
                    dst_path, 
                    symlinks=False, 
                    ignore=shutil.ignore_patterns(
                        '__pycache__', '*.pyc', '*.pyo', '*.pyd', 
                        'node_modules', '.git'
                    )
                )
            else:
                shutil.copy2(src_path, dst_path)
                
        logger.info(f"Repository copied successfully to {working_dir}")
        return working_dir
        
    def run_command(self, command: List[str], cwd: Optional[str] = None) -> Tuple[int, str, str]:
        """Run a command in the repository directory.
        
        Args:
            command: Command as list of strings
            cwd: Directory to run the command in (default: working_dir)
            
        Returns:
            Tuple of (return_code, stdout, stderr)
        """
        if cwd is None:
            if self._working_dir is None:
                raise ValueError("Repository not copied yet. Call copy_repository first.")
            cwd = self._working_dir
            
        # Execute the command
        process = subprocess.Popen(
            command, 
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        stdout, stderr = process.communicate()
        return process.returncode, stdout, stderr
        
    def cleanup(self):
        """Clean up temporary directories."""
        if self._target_dir and os.path.exists(self._target_dir):
            logger.info(f"Cleaning up temporary directory: {self._target_dir}")
            shutil.rmtree(self._target_dir, ignore_errors=True)
        
    def edit_file(self, file_path: str, old_content: str, new_content: str) -> bool:
        """Edit a file in the repository.
        
        Args:
            file_path: Path to the file relative to working directory
            old_content: Content to replace
            new_content: New content to insert
            
        Returns:
            True if successful, False otherwise
        """
        if self._working_dir is None:
            raise ValueError("Repository not copied yet. Call copy_repository first.")
            
        abs_file_path = os.path.join(self._working_dir, file_path)
        
        try:
            # Read the current content
            with open(abs_file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Make the replacement
            if old_content not in content:
                logger.warning(f"Content to replace not found in {file_path}")
                return False
                
            new_file_content = content.replace(old_content, new_content)
            
            # Write the new content
            with open(abs_file_path, 'w', encoding='utf-8') as f:
                f.write(new_file_content)
                
            logger.info(f"Successfully edited {file_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error editing {file_path}: {str(e)}")
            return False
            
    def create_file(self, file_path: str, content: str) -> bool:
        """Create a new file in the repository.
        
        Args:
            file_path: Path to the file relative to working directory
            content: Content of the file
            
        Returns:
            True if successful, False otherwise
        """
        if self._working_dir is None:
            raise ValueError("Repository not copied yet. Call copy_repository first.")
            
        abs_file_path = os.path.join(self._working_dir, file_path)
        
        try:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(abs_file_path), exist_ok=True)
            
            # Write the content
            with open(abs_file_path, 'w', encoding='utf-8') as f:
                f.write(content)
                
            logger.info(f"Successfully created {file_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error creating {file_path}: {str(e)}")
            return False
            
    def get_file_content(self, file_path: str) -> Optional[str]:
        """Get the content of a file in the repository.
        
        Args:
            file_path: Path to the file relative to working directory
            
        Returns:
            Content of the file, or None if file doesn't exist
        """
        if self._working_dir is None:
            raise ValueError("Repository not copied yet. Call copy_repository first.")
            
        abs_file_path = os.path.join(self._working_dir, file_path)
        
        try:
            with open(abs_file_path, 'r', encoding='utf-8') as f:
                return f.read()
                
        except Exception as e:
            logger.error(f"Error reading {file_path}: {str(e)}")
            return None