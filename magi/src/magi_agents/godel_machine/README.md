# TDD-Based Gödel Machine

## Overview

The TDD-based Gödel Machine is an extension of the MAGI agent system that implements Test-Driven Development (TDD) workflow. It combines the structured approach of the Task Force orchestrator with the Gödel Machine's specialized agents to create a rigorous, test-first development process.

## Key Components

The TDD-based Gödel Machine consists of:

1. **TddGodelOrchestrator**: The main orchestrator that manages the TDD workflow.
2. **TestRunner**: A utility class that executes tests and manages test files.
3. **Integration with Existing Agents**: Uses Planning, Testing, and Writing agents from the Gödel Machine.

## TDD Workflow

The workflow follows the classic Red-Green-Refactor cycle:

```
┌───────────────┐
│  Planning     │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  Feature 1    │◄───────────────┐
└───────┬───────┘                │
        │                        │
        ▼                        │
┌───────────────┐                │
│  Write Tests  │                │
└───────┬───────┘                │
        │                        │
        ▼                        │
┌───────────────┐                │
│  Run Tests    │                │
│    (RED)      │                │
└───────┬───────┘                │
        │                        │
        ▼                        │
┌───────────────┐                │
│    Write      │                │
│Implementation │                │
└───────┬───────┘                │
        │                        │
        ▼                        │
┌───────────────┐                │
│  Run Tests    │                │
│   (GREEN)     │                │
└───────┬───────┘                │
        │                        │
        ▼                        │
┌───────────────┐                │
│   Refactor    │                │
│ (if needed)   │                │
└───────┬───────┘                │
        │                        │
        ▼                        │
┌───────────────┐                │
│ Next Feature  ├───────────────►│
└───────────────┘
```

## Usage Examples

### Option 1: Using the `runGodelMachine` function with TDD flag

```typescript
import { runGodelMachine } from '../magi_agents/godel_machine/index.js';

// Define your development goal
const goal = 'Create a utility function that can format timestamps in different formats';

// Run the TDD workflow (true enables TDD mode)
await runGodelMachine(goal, true);
```

### Option 2: Using the TddGodelOrchestrator directly

```typescript
import { createTddOrchestrator } from '../magi_agents/godel_machine/index.js';

// Define your development goal
const goal = 'Implement a string utility that can reverse and capitalize strings';

// Create the TDD orchestrator
const orchestrator = createTddOrchestrator(goal);

// Execute the TDD workflow
const report = await orchestrator.execute();

// Display the results
console.log(report);
```

## Features

### 1. Planning Phase

The orchestrator breaks down a high-level goal into testable features using the PlanningAgent.

### 2. Test-First Development

For each feature:
- Write tests before implementation
- Run tests to verify they fail (RED phase)
- Implement code to make tests pass (GREEN phase)
- Optionally refactor while maintaining passing tests

### 3. Automatic Test Detection

The system automatically detects and uses the appropriate test framework (Jest, Mocha, etc.) based on the project configuration.

### 4. Dependency Management

Features with dependencies are processed in the correct order, ensuring dependent features are implemented first.

### 5. Comprehensive Reporting

The orchestrator generates detailed reports on the TDD process, including:
- Overall progress and statistics
- Status of each feature
- Test results for each phase
- Refactoring notes

## Benefits Over Standard Gödel Machine

1. **Test-First Approach**: Ensures all code is testable and tested
2. **Incremental Development**: Works through features one at a time
3. **Lower Technical Debt**: Refactoring phase encourages clean code
4. **Clear Acceptance Criteria**: Tests define when a feature is "done"
5. **Self-Documenting**: Tests serve as documentation for functionality

