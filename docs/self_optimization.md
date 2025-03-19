# MAGI Self-Optimization

The MAGI Self-Optimization system enables the MAGI codebase to modify itself to better handle specific tasks. This document explains how the system works, how to use it, and how to extend it for more advanced use cases.

## Overview

The self-optimization system has three main components:

1. **CodeRepository**: Manages a copy of the MAGI codebase, including copying, modifying, and testing it.
2. **SelfOptimizationAgent**: Analyzes tasks, plans code modifications, and implements them.
3. **Integration in magi.py**: Automatically applies self-optimization to incoming tasks.

The process works as follows:

1. When a task is received, the system first analyzes it to determine what code optimizations would help.
2. It creates a copy of the codebase in a temporary directory.
3. It modifies the code based on the task analysis.
4. It tests the modifications to ensure they work correctly.
5. It executes the original task using the modified code.

## Using Self-Optimization

### Command Line Options

To enable or disable self-optimization, use the `--self-optimization` flag:

```bash
test/magi-docker.sh -p "your prompt here" --self-optimization true
test/magi-docker.sh -p "your prompt here" --self-optimization false
```

### Environment Variables

You can also control self-optimization using the `MAGI_ENABLE_SELF_OPTIMIZATION` environment variable:

```bash
MAGI_ENABLE_SELF_OPTIMIZATION=false test/magi-docker.sh -p "your prompt here"
```

### Testing the Self-Optimization System

To test the self-optimization system, use the provided test script:

```bash
test/test_self_optimization.sh
```

This script runs:
1. Unit tests for the code repository manager
2. Tests for the self-optimization agent
3. A simple task with self-optimization enabled
4. The same task with self-optimization disabled

## Components

### CodeRepository

The `CodeRepository` class in `magi/utils/code_repository.py` handles:

- Copying the MAGI codebase to a temporary directory
- Editing files in the copied repository
- Creating new files
- Running commands in the repository directory
- Cleaning up temporary directories

### SelfOptimizationAgent

The `SelfOptimizationAgent` in `magi/magi_agents/self_optimization_agent.py` is a specialized agent that:

- Analyzes tasks to determine optimization opportunities
- Plans code modifications
- Implements the modifications
- Tests the modifications
- Executes the modified code

## Architecture

The self-optimization system is designed to be modular and extensible. The main components are:

1. **magi.py**: Entry point that decides whether to use self-optimization.
2. **run_self_optimized_command()**: Function that orchestrates the self-optimization process.
3. **SelfOptimizationAgent**: Agent that performs the optimization.
4. **CodeRepository**: Class that manages the code repository.

## Future Enhancements

The self-optimization system could be enhanced in several ways:

1. **Learning from Success**: Store successful optimizations for reuse in similar tasks.
2. **Multi-Stage Optimization**: Apply successive optimization passes for complex tasks.
3. **Optimization Library**: Create a library of common optimizations that can be applied selectively.
4. **Permanent Modifications**: Allow the system to suggest permanent modifications to the codebase.
5. **Fine-Tuning Control**: Provide more granular control over which parts of the codebase can be modified.

## Limitations

The current implementation has some limitations:

1. **Resource Intensive**: Creating a copy of the codebase for each task can be resource-intensive.
2. **Limited Testing**: The testing capability is limited to running commands and checking return codes.
3. **Temporary Changes**: Modifications are lost after the task is completed.
4. **No Caching**: Similar tasks may result in duplicate optimization work.

## Troubleshooting

### Common Issues

1. **Permission Errors**: If the system cannot create or modify files, check the permissions of the MAGI directory.
2. **Missing Dependencies**: If the optimized code requires dependencies that are not installed, the execution may fail.
3. **Excessive Modifications**: If the system is making too many modifications, you may need to tune the agent's instructions.

### Debugging

To debug the self-optimization system:

1. Set the environment variable `MAGI_DEBUG=true` to enable debug logging.
2. Check the log files for detailed information about code modifications.
3. Use the `--debug` flag to enable verbose logging for the agent framework.