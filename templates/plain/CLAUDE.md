# Plain Template

This is an empty template that serves as a starting point for creating projects from scratch without any predefined structure or opinions. Use this template when you want complete freedom to define your project architecture, dependencies, and structure.

## Getting Started

Since this is a completely empty template, you'll need to define your own project structure. Here are some common first steps:

1. Initialize a version control system (e.g., Git)
2. Create a README.md file to describe your project
3. Set up a build system or package manager if needed
4. Define your directory structure based on your project's needs

## Common Initialization Commands

```bash
# Git initialization
git init

# Package manager initialization
npm init -y       # For Node.js projects
yarn init         # Alternative for Node.js projects
pip install -e .  # For Python projects
```

## Project Organization Tips

Consider organizing your project with these common patterns:

- Source code in a `src/` or `lib/` directory
- Tests in a `tests/` or `__tests__/` directory
- Documentation in a `docs/` directory
- Build scripts in a `scripts/` directory
- Configuration files at the root level

## Recommended Documentation

- Create a thorough README.md with:
  - Project description
  - Installation instructions
  - Usage examples
  - Contributing guidelines
  - License information

## `project_map.json`

As you develop your project, consider maintaining the `project_map.json` file to provide a helpful overview of your project structure for AI assistants and new team members.