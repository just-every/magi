# MAGI Work List

These are some of the higher priority tasks for the magi system.

- Simply the message passing so that a single interface is used for all message types.
  -- Should have a type, direction, and a payload.
  -- Each payload should be defined in detail.
  -- All communication (process <-> server <-> client) should use this interface
  -- Remove all other message passing code.

- Simplify tools for magi/src/magi_agents/overseer_agent.ts
  -- Maintain all the functionality, but reduce some complexity.
  -- Combine tools with additional parameters to reduce token usage.

- Complete git handling and provide get final reviews/merges working

- Add a way system that outputs code for tasks
  -- When a new task is created, first look for existing code in our code DB
  -- If it exists, use that code.
  -- If not write it, or extend the existing code.

- Complete Godel Machine
  -- Write tests before coding
  -- Ensure tests complete
  -- Ensemble coding - multiple models at once
  -- If more than one attempt is needed, once solution is found, take solution and task from fresh code and implement the solution.

- Complete Research Engine
  -- Use a recursive approach
  -- Split into multiple parallel tasks
  -- Collate results
  -- Find gaps in knowledge
  -- Repeat until no large gaps are found
  -- (inspiration: https://github.com/qx-labs/agents-deep-research)
