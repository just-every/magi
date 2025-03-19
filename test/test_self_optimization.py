"""
Test script for the self-optimization agent.

This script tests the code repository manager and the self-optimization agent's
ability to analyze tasks, modify code, and execute the modified code.
"""

import os
import sys
import unittest
import tempfile
import shutil
from pathlib import Path

# Add magi to the Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from magi.utils.code_repository import CodeRepository
from magi.magi_agents.self_optimization_agent import (
    create_self_optimization_agent,
    analyze_task,
    plan_code_modifications,
    initialize_repository,
    get_file_content,
    modify_file,
    create_new_file,
    run_tests,
    cleanup_repository
)

class TestCodeRepository(unittest.TestCase):
    """Test the CodeRepository class."""
    
    def setUp(self):
        """Set up the test environment."""
        # Create a temporary directory for test files
        self.test_dir = tempfile.mkdtemp(prefix="magi-test-")
        
        # Create a sample file structure
        os.makedirs(os.path.join(self.test_dir, "magi"), exist_ok=True)
        os.makedirs(os.path.join(self.test_dir, "magi/utils"), exist_ok=True)
        
        # Create a sample file
        with open(os.path.join(self.test_dir, "magi/utils/test_file.py"), "w") as f:
            f.write("# This is a test file\n\ndef test_function():\n    return 'test'\n")
        
        # Initialize the repository with the test directory
        self.repo = CodeRepository(source_dir=self.test_dir)
        
    def tearDown(self):
        """Clean up the test environment."""
        # Clean up the repository
        if hasattr(self, 'repo') and self.repo._target_dir:
            self.repo.cleanup()
            
        # Clean up the test directory
        if hasattr(self, 'test_dir') and os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_copy_repository(self):
        """Test copying the repository."""
        working_dir = self.repo.copy_repository()
        
        # Check that the working directory exists
        self.assertTrue(os.path.exists(working_dir))
        
        # Check that the sample file was copied
        self.assertTrue(os.path.exists(os.path.join(working_dir, "magi/utils/test_file.py")))
        
        # Check that the content of the sample file is correct
        with open(os.path.join(working_dir, "magi/utils/test_file.py"), "r") as f:
            content = f.read()
            self.assertIn("def test_function():", content)
    
    def test_edit_file(self):
        """Test editing a file in the repository."""
        # Copy the repository
        self.repo.copy_repository()
        
        # Edit the sample file
        old_content = "def test_function():\n    return 'test'\n"
        new_content = "def test_function():\n    return 'modified'\n"
        
        success = self.repo.edit_file("magi/utils/test_file.py", old_content, new_content)
        self.assertTrue(success)
        
        # Check that the file was edited
        content = self.repo.get_file_content("magi/utils/test_file.py")
        self.assertIn("return 'modified'", content)
    
    def test_create_file(self):
        """Test creating a new file in the repository."""
        # Copy the repository
        self.repo.copy_repository()
        
        # Create a new file
        file_content = "# This is a new file\n\ndef new_function():\n    return 'new'\n"
        
        success = self.repo.create_file("magi/utils/new_file.py", file_content)
        self.assertTrue(success)
        
        # Check that the file was created
        content = self.repo.get_file_content("magi/utils/new_file.py")
        self.assertIn("def new_function():", content)
    
    def test_run_command(self):
        """Test running a command in the repository."""
        # Copy the repository
        working_dir = self.repo.copy_repository()
        
        # Run a simple command
        return_code, stdout, stderr = self.repo.run_command(["ls", "-la"])
        
        # Check that the command was executed successfully
        self.assertEqual(return_code, 0)
        self.assertIn("magi", stdout)  # Directory should be listed

class TestSelfOptimizationAgent(unittest.TestCase):
    """
    Test the self-optimization agent.
    
    Note: This class only tests basic functionality without running the LLM.
    """
    
    def test_agent_creation(self):
        """Test creating the self-optimization agent."""
        agent = create_self_optimization_agent()
        
        # Check that the agent was created with the correct name
        self.assertEqual(agent.name, "SelfOptimizationAgent")
        
        # Check that the agent has the correct tools
        tool_names = [tool.name for tool in agent.tools]
        required_tools = [
            "analyze_task",
            "plan_code_modifications",
            "initialize_repository",
            "get_file_content",
            "modify_file",
            "create_new_file",
            "run_tests",
            "execute_modified_code",
            "cleanup_repository",
            "write_file",
            "read_file"
        ]
        
        for tool in required_tools:
            self.assertIn(tool, tool_names)

# If executed directly, run the tests
if __name__ == "__main__":
    unittest.main()