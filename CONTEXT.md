# Code Context

Generated: 01/07/2025, 11:34:32 am

This document provides AI agents and developers with essential context about this codebase. 
It addresses the "context deficit" problem where AI lacks architectural, historical, and implicit knowledge.

**For AI Agents:** Read this file first before making any code changes. Use `code-context search` for specific queries.

## Quick Start for AI Agents

### Project Overview
- **Main Language:** TypeScript
- **Frameworks:** None detected
- **Test Framework:** Vitest
- **Build Tools:** Docker Compose

### Development Patterns
- **Commit Convention:** Conventional Commits (feat, fix, etc.)
- **Architecture Pattern:** Standard structure
- **Active Contributors:** MAGI System, James Peter, magi
- **Code Health:** 1 high-risk files, 59 medium-risk files

### Before Making Changes
1. Review high-risk files: controller/src/server/managers/container_manager.ts
2. Follow commit convention: Use conventional commits (feat:, fix:, etc.)
3. Run tests: Check package.json for test command
4. Run formatter before committing

### Critical Information
⚠️ Recent failures: Test failures

🔒 Security-focused development detected

### Style Guide
✅ Auto-formatting available - run formatter before commit
Linters: Prettier, ESLint

## Key Constraints

### ⛔ Never Do This
- Test failures (failed in 589dab1)
- Test failures (failed in a614133)
- This file has recurring issues - consider refactoring or deeper investigation (failed in ca7e13f74a35de9dfe6c34931ddde9b004c0c167)
- This file has recurring issues - consider refactoring or deeper investigation (failed in 59a3085937bd631d3733448b51bf4270169e24a5)
- This file has recurring issues - consider refactoring or deeper investigation (failed in ca7e13f74a35de9dfe6c34931ddde9b004c0c167)

### ✅ Always Do This
- TypeScript: Strict mode: Strict type checking enabled
- Line endings: Use lf line endings
- Trailing whitespace: Trim trailing whitespace

### Security Considerations
- Never commit secrets or API keys
- Always validate user input
- Use parameterized queries for database operations

## Historical Context

### Failed Attempts (Learn from these)
1. **Revert "feat(ci): add GitHub Actions CI/CD pipeline  - Add comprehensive CI/CD ...** (589dab1)
   - Why it failed: Test failures
   - Files affected: 

2. **Revert "feat(ci): add GitHub Actions CI/CD pipeline  - Add comprehensive CI/CD ...** (a614133)
   - Why it failed: Test failures
   - Files affected: 

3. **File controller/src/client/js/components/PatchDetails.tsx has been fixed 5 times...** (ca7e13f74a35de9dfe6c34931ddde9b004c0c167)
   - Why it failed: This file has recurring issues - consider refactoring or deeper investigation
   - Files affected: controller/src/client/js/components/PatchDetails.tsx

4. **File controller/src/server/routes/patches.ts has been fixed 7 times in 13 days** (59a3085937bd631d3733448b51bf4270169e24a5)
   - Why it failed: This file has recurring issues - consider refactoring or deeper investigation
   - Files affected: controller/src/server/routes/patches.ts

5. **File engine/src/utils/project_utils.ts has been fixed 4 times in 13 days** (ca7e13f74a35de9dfe6c34931ddde9b004c0c167)
   - Why it failed: This file has recurring issues - consider refactoring or deeper investigation
   - Files affected: engine/src/utils/project_utils.ts

### Successful Patterns
**Security:**
- Security vulnerabilities and patches (3 occurrences)

**Conventional:**
- Bug fixes (66 occurrences)
- New features (44 occurrences)
- Code refactoring (12 occurrences)
- Documentation changes (11 occurrences)
- Maintenance and tooling (6 occurrences)

**Custom:**
- Custom prefix (49 occurrences)
- Custom prefix (13 occurrences)
- Custom prefix (9 occurrences)
- Custom prefix (3 occurrences)

### High-Risk Areas
These files have high change frequency and should be reviewed carefully:
- **controller/src/server/managers/container_manager.ts**: 37 changes, 0 reverts

### Key Contributors
Active maintainers who understand the codebase:
- **MAGI System** (216 commits, magi-system@hascontext.com)
- **James Peter** (72 commits, github@zemaj.com)
- **magi** (41 commits, magi+AI-z0z1ci@withmagi.com)

### Current Priorities
No high-priority TODOs

## Architectural Overview

### Project Structure


### Key Patterns
- Standard project structure

### Dependencies
Major dependencies and their usage:
- **@google/genai** (^1.4.0) - Used in: 
- **@just-every/ensemble** (^0.2.35) - Used in: common/shared-types.ts
- **@just-every/search** (^1.0.1) - Used in: test/tools/web-search.ts
- **@just-every/task** (^0.2.5) - Used in: 
- **@types/pg** (^8.15.4) - Used in: 
- **canvas** (^3.1.0) - Used in: 
- **chrome-launcher** (^1.2.0) - Used in: 
- **chrome-remote-interface** (^0.33.3) - Used in: 
- **dotenv** (^16.5.0) - Used in: 
- **esbuild** (^0.25.5) - Used in: 

### Entry Points
No clear entry points detected

## Development Patterns

### Code Style
- **TypeScript: Strict mode**: Strict type checking enabled (enforced)
- **Line endings**: Use lf line endings (enforced)
- **Trailing whitespace**: Trim trailing whitespace (enforced)

### Testing Approach
- Test Framework: Vitest
- Test files location: test

### Common Workflows
Based on commit history:
- **security**: 3 occurrences
- **conventional**: 66 occurrences
- **custom**: 49 occurrences
- **conventional**: 44 occurrences
- **custom**: 13 occurrences

### Code Review Focus Areas
High-churn files that need extra attention:
- controller/src/server/managers/container_manager.ts (37 changes, 0 reverts)

## Quick Reference

### Main Code Locations
- **Test files**: test/

### Active Work Areas
No active high-priority work

### Commands
```bash
# Search for patterns or history
code-context search "authentication"

# Validate your changes
code-context validate changes.diff

# Regenerate this context
code-context run
```

## Detailed Reports

For more detailed information, see:
- [Architecture Analysis](.code-context/context/architecture.json)
- [Historical Analysis](.code-context/context/history.json)
- [Style Guide](.code-context/context/style.json)
- [TODOs and Tech Debt](.code-context/context/necessity.json)

---

*Generated by Code Context Framework v1.0.0*