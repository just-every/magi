"""
self_optimization_agent.py - Specialized agent for optimizing the MAGI codebase

This agent is responsible for analyzing a task, planning code modifications,
implementing those modifications, and testing the modifications.
"""

import os
import sys
import logging
from typing import Dict, List, Any, Optional

from agents import Agent, ModelSettings, function_tool, RunContextWrapper
from magi.utils.file_utils import write_file, read_file
from magi.utils.code_repository import CodeRepository

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Repository manager - will be initialized in the create_agent function
code_repo = None

@function_tool
async def analyze_task(context: RunContextWrapper, task: str) -> Dict[str, Any]:
    """
    Analyze a task to determine what code optimizations are needed.
    
    Args:
        task: The task description to analyze
        
    Returns:
        Dictionary containing analysis results:
        - task_type: The type of task (e.g., "coding", "data_analysis", "web_browsing")
        - key_capabilities: List of capabilities needed for the task
        - optimization_targets: Files that should be optimized
        - suggested_changes: High-level changes that should be made
    """
    # This is a placeholder - the actual analysis will be done by the LLM
    return {
        "task_type": "determined by LLM",
        "key_capabilities": ["determined by LLM"],
        "optimization_targets": ["determined by LLM"],
        "suggested_changes": ["determined by LLM"]
    }

@function_tool
async def plan_code_modifications(context: RunContextWrapper, 
                                 task: str, 
                                 analysis: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a detailed plan for code modifications based on task analysis.
    
    Args:
        task: The original task description
        analysis: The analysis results from analyze_task
        
    Returns:
        Dictionary containing the modification plan:
        - file_changes: List of files to modify with specific changes
        - new_files: List of new files to create
        - dependencies: Any new dependencies required
        - test_plan: How to test the changes
    """
    # This is a placeholder - the actual planning will be done by the LLM
    return {
        "file_changes": ["determined by LLM"],
        "new_files": ["determined by LLM"],
        "dependencies": ["determined by LLM"],
        "test_plan": ["determined by LLM"]
    }

@function_tool
async def get_file_content(context: RunContextWrapper, file_path: str) -> str:
    """
    Get the content of a file in the repository.
    
    Args:
        file_path: Path to the file, relative to the repository root
        
    Returns:
        Content of the file
    """
    global code_repo
    if code_repo is None:
        raise ValueError("Repository not initialized")
        
    content = code_repo.get_file_content(file_path)
    if content is None:
        return f"Error: File {file_path} not found"
    
    return content

@function_tool
async def modify_file(context: RunContextWrapper, 
                     file_path: str, 
                     old_content: str, 
                     new_content: str) -> str:
    """
    Modify a file in the repository.
    
    Args:
        file_path: Path to the file, relative to the repository root
        old_content: Content to replace
        new_content: New content to insert
        
    Returns:
        Result of the operation
    """
    global code_repo
    if code_repo is None:
        raise ValueError("Repository not initialized")
        
    success = code_repo.edit_file(file_path, old_content, new_content)
    if success:
        return f"Successfully modified {file_path}"
    else:
        return f"Error: Failed to modify {file_path}"

@function_tool
async def create_new_file(context: RunContextWrapper, 
                         file_path: str, 
                         content: str) -> str:
    """
    Create a new file in the repository.
    
    Args:
        file_path: Path to the file, relative to the repository root
        content: Content of the file
        
    Returns:
        Result of the operation
    """
    global code_repo
    if code_repo is None:
        raise ValueError("Repository not initialized")
        
    success = code_repo.create_file(file_path, content)
    if success:
        return f"Successfully created {file_path}"
    else:
        return f"Error: Failed to create {file_path}"

@function_tool
async def run_tests(context: RunContextWrapper, test_commands: List[str]) -> str:
    """
    Run test commands to verify the code changes.
    
    Args:
        test_commands: List of commands to run
        
    Returns:
        Test results
    """
    global code_repo
    if code_repo is None:
        raise ValueError("Repository not initialized")
        
    results = []
    for cmd in test_commands:
        cmd_parts = cmd.split()
        return_code, stdout, stderr = code_repo.run_command(cmd_parts)
        
        results.append({
            "command": cmd,
            "return_code": return_code,
            "stdout": stdout,
            "stderr": stderr
        })
        
    # Format results as a string
    result_str = "Test Results:\n\n"
    for i, res in enumerate(results):
        result_str += f"Command {i+1}: {res['command']}\n"
        result_str += f"Return Code: {res['return_code']}\n"
        result_str += f"Standard Output:\n{res['stdout']}\n"
        result_str += f"Standard Error:\n{res['stderr']}\n\n"
        
    return result_str

@function_tool
async def initialize_repository(context: RunContextWrapper) -> str:
    """
    Initialize the code repository.
    
    Returns:
        Path to the working directory
    """
    global code_repo
    
    if code_repo is None:
        code_repo = CodeRepository()
        
    try:
        working_dir = code_repo.copy_repository()
        return f"Repository initialized at {working_dir}"
    except Exception as e:
        return f"Error initializing repository: {str(e)}"

@function_tool
async def cleanup_repository(context: RunContextWrapper) -> str:
    """
    Clean up the code repository.
    
    Returns:
        Result of the cleanup operation
    """
    global code_repo
    if code_repo is None:
        return "Repository not initialized"
        
    try:
        code_repo.cleanup()
        return "Repository cleaned up successfully"
    except Exception as e:
        return f"Error cleaning up repository: {str(e)}"

@function_tool
async def execute_modified_code(context: RunContextWrapper, command: List[str]) -> str:
    """
    Execute the modified code with the given command.
    
    Args:
        command: Command to execute as a list of strings
        
    Returns:
        Execution results
    """
    global code_repo
    if code_repo is None:
        raise ValueError("Repository not initialized")
        
    try:
        return_code, stdout, stderr = code_repo.run_command(command)
        
        result = f"Command: {' '.join(command)}\n\n"
        result += f"Return Code: {return_code}\n\n"
        result += f"Standard Output:\n{stdout}\n\n"
        result += f"Standard Error:\n{stderr}\n\n"
        
        return result
    except Exception as e:
        return f"Error executing command: {str(e)}"

def create_self_optimization_agent() -> Agent:
    """Creates and returns the self-optimization agent with appropriate tools and instructions."""
    global code_repo
    
    # Initialize the code repository if not already done
    if code_repo is None:
        code_repo = CodeRepository()
    
    return Agent(
        name="SelfOptimizationAgent",
        instructions="""You are a Self-Optimization Agent for the MAGI system.

Your primary purpose is to analyze tasks given to MAGI, modify the MAGI codebase to better handle those tasks, and then execute the modified code. You are an expert software engineer with deep knowledge of Python, TypeScript, and LLM systems.

WORKFLOW:
1. Analyze the task to understand its requirements
2. Plan code modifications that would improve MAGI's ability to handle this task
3. Initialize a fresh copy of the repository
4. Implement the planned modifications
5. Test the modified code
6. Execute the modified code to handle the task

KEY PRINCIPLES:
- Make targeted, minimal changes to achieve the goal
- Focus on optimizing the agent selection and capabilities first
- When creating or modifying agents, follow the patterns in existing code
- Always test changes thoroughly before execution
- Keep track of all modified files for documentation

TOOLS:
- analyze_task: Analyze a task to determine optimization opportunities
- plan_code_modifications: Create a detailed modification plan
- initialize_repository: Create a fresh copy of the repository
- get_file_content: Read file content from the repository
- modify_file: Make changes to existing files
- create_new_file: Create new files in the repository
- run_tests: Run test commands to verify changes
- execute_modified_code: Run the modified code with the task
- cleanup_repository: Clean up temporary resources
- write_file & read_file: For sharing information with other agents

USE THE PYTHON VIRTUAL ENVIRONMENT:
When testing and executing code, you must use the Python virtual environment that's already set up in the repository. Use '../../venv/bin/python' instead of just 'python' for commands.

CODE ORGANIZATION:
The MAGI codebase is organized as follows:
- magi/magi_agents/: Agent implementations
- magi/magi_agents/workers/: Specialized agent implementations
- magi/utils/: Utility modules
- magi/magi.py: Main entry point

Start with simple, targeted changes and only make more significant modifications if necessary. Focus on agent selection, instructions, and workflows before making architectural changes.

When modifying the code, make sure to understand the existing architecture and follow the same patterns. Don't break any existing functionality.
""",
        handoff_description="A specialized agent for optimizing the MAGI codebase to better handle specific tasks",
        tools=[
            analyze_task,
            plan_code_modifications,
            initialize_repository,
            get_file_content,
            modify_file,
            create_new_file,
            run_tests,
            execute_modified_code,
            cleanup_repository,
            write_file,
            read_file
        ],
        model=os.environ.get("MAGI_REASONING_MODEL", "claude-3-7-sonnet-latest"),  # Use high-capability model
        model_settings=ModelSettings(truncation="auto", parallel_tool_calls=True),
    )