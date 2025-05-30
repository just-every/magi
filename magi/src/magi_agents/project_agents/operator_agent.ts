/**
 * Project Operator Agent
 *
 * Analyzes a newly created project from a template and fills in project details in the database.
 */

import { Agent } from '../../utils/agent.js';
import { getCommonTools } from '../../utils/index.js';
import { createCodeAgent } from '../common_agents/code_agent.js';
import { createReasoningAgent } from '../common_agents/reasoning_agent.js';
import { updateProject, getProject } from '../../utils/db_utils.js';
import { createToolFunction } from '../../utils/tool_call.js';
import { MAGI_CONTEXT } from '../constants.js';
import { Project } from '../../types/shared-types.js';
import { ResponseInput } from '@just-every/ensemble';
import {
    PROJECT_TYPES,
    getProjectTypeDescription,
} from '../../constants/project_types.js';
import { getProcessProjectIds } from '../../utils/project_utils.js';
import { get_output_dir } from '../../utils/file_utils.js';
import { createOperatorAgent, startTime } from '../operator_agent.js';
import { dateFormat, readableTime } from '../../utils/date_tools.js';
import { runningToolTracker } from '../../utils/running_tool_tracker.js';
import { getThoughtDelay } from '../../utils/mech_wrapper.js';
import { getRunningToolTools } from '../../utils/running_tools.js';

/**
 * Wrapper function for updateProject that accepts individual parameters
 * and returns a string confirmation message
 */
async function update_project_details(
    project_id: string,
    project_type?: (typeof PROJECT_TYPES)[number],
    simple_description?: string,
    detailed_description?: string
): Promise<string> {
    // First get the existing project
    const existingProject = await getProject(project_id);
    if (!existingProject) {
        throw new Error(`Project with ID '${project_id}' not found`);
    }

    // Create updated project by merging existing data with new updates
    const updatedProject: Project = {
        ...existingProject,
        ...(project_type !== undefined && { project_type }),
        ...(simple_description !== undefined && { simple_description }),
        ...(detailed_description !== undefined && { detailed_description }),
    };

    await updateProject(updatedProject);
    return `Project '${project_id}' successfully updated with new details.`;
}

/**
 * Format current project data to show only populated fields
 */
function formatProjectData(project: Project | null): string {
    if (!project) return 'No data found';

    const fields: string[] = [];

    if (project.project_type)
        fields.push(`project_type: ${project.project_type}`);
    if (project.simple_description)
        fields.push(`simple_description: '${project.simple_description}'`);
    if (project.detailed_description)
        fields.push(
            `detailed_description: (${project.detailed_description.length} chars)`
        );

    return fields.length > 0 ? fields.join('\n') : 'No populated fields';
}

/**
 * Creates an agent responsible for analyzing projects, updating metadata,
 * generating codebase maps, and bootstrapping context files (CLAUDE.md/AGENTS.md).
 *
 * This agent follows a structured multi-step process:
 * 1. Analyze the project to update database metadata (descriptions, type, structure, git remote).
 * 2. Generate two types of codebase maps: a minimal directory-only map and a richer project map.
 * 3. Create initial CLAUDE.md and AGENTS.md files with essential project context.
 *
 * @returns A promise resolving to the configured Agent instance.
 */
export async function createProjectOperatorAgent(): Promise<Agent> {
    const projectIds = getProcessProjectIds();
    const paths = projectIds.map(id => get_output_dir(`projects/${id}`)); // Adjust path structure if needed

    /* --------------------------- Agent Instructions ------------------------------ */
    // This large instruction block defines the agent's multi-faceted task.
    // It's broken down into clear steps, referencing concepts from the AI agent optimization report.
    const instructions = `${MAGI_CONTEXT}

---
You are **ProjectOperatorAgent**.

**Goal:** Analyze the project${paths.length > 1 ? 's' : ''} "${paths.join('", "')}", update the metadata in the database, generate codebase maps (minimal and rich), and bootstrap initial context files (\`CLAUDE.md\` for Claude Code and \`AGENTS.md\` for Codex CLI).

You have full local read/write access to the project folder${paths.length > 1 ? 's' : ''}:
${paths.map(p => `• \`${p}\``).join('\n')}

Your run involves **two main tasks** resulting in file creation and DB updates.

---
### Task 1: Generate Codebase Map and Context Files

Create a \`project_map.json\`, \`CLAUDE.md\` and \`AGENTS.md\` file at the root of each project repository.
**IMPORTANT:** Using a CodeAgent is the best choice for this task.
- Rationale: Provide foundational context for future AI assistants like Claude and Codex, based on report recommendations.
- First analyze the project structure and files, then generate the \`project_map.json\`.
- Use the *same core information* for \`CLAUDE.md\` and \`AGENTS.md\` initially, structured according to the template below.
- Codex Hint: For \`AGENTS.md\`, where natural, try phrasing descriptions or guidelines using comment-style syntax (e.g., \`# Use snake_case\`) alongside the Markdown, as this can be effective for Codex. However, maintain overall Markdown readability.
- Conciseness: Keep the total content relatively brief (aim for ≤ 150 lines). This file becomes part of the LLM prompt.
- Flexibility: Include all *relevant* sections from the template. If a standard section (e.g., 'Common Bash Commands') is clearly not applicable or information is unavailable, you may omit it.

\`project_map.json\` (Project Overview Map)
    - Purpose: Offer a detailed summary including key files, languages, and commands.
    - Schema Example (Provide this in full to the CodeAgent):
        \`\`\`json
        {
          "root": "<repository_name>", // e.g., "my-awesome-app"
          "summary": "<Brief project summary, similar to simple_description>",
          "primary_language": "<e.g., Python/TypeScript/Go>", // Detected primary language
          "frameworks": ["<e.g., FastAPI>", "<e.g., React>"], // Optional: Detected frameworks/major libraries
          "entry_points": ["src/main.ts", "scripts/run_dev.sh"], // Key files/scripts to start/run the app
          "tests": ["tests/", "package.json#scripts.test"], // Paths to test dirs or test commands
          "build_commands": ["npm run build", "docker build ."], // Common build commands
          "setup_instructions": ["npm install", "cp .env.example .env"] // Key setup steps
          "directories": [ // 1-6 of the most important directories
            {
              "path": "src/",
              "summary": "Main application source code, including core logic and API handlers.",
              "languages": ["TypeScript"], // Languages detected within this directory
              "important_files": ["main.ts", "app.module.ts", "config.ts"] // 1-4 key files
            },
            {
              "path": "tests/unit/",
              "summary": "Unit tests for application components.",
              "languages": ["TypeScript"],
              "important_files": ["auth.service.spec.ts"]
            }
            // ... other important directories
          ],
        }
        \`\`\`
    - Content: Populate with detected information. Use summaries effectively. Be selective with \`directories\` and \`important_files\`.
    - Constraint: Keep file size manageable (e.g., ≤ 35 KB).

\`CLAUDE.md\` and \`AGENTS.md\` Structure (EXAMPLE ONLY):
\`\`\`markdown
# Project Overview
<One-paragraph mission statement of the project. What does it do?>

## Core Modules & Files
<List key directories/files and their primary purpose. Be selective.>
- src/models/: Contains database models (e.g., SQLAlchemy, Prisma).
- src/api/v1/handlers.py: Logic for V1 API endpoints.
- ui/components/: Reusable frontend components (e.g., React, Vue).
...

## \`project_map.json\`
<Explain the purpose of this file and how to use it.>
- \`project_map.json\`: Detailed project overview, including key files and languages.

## Common Bash Commands
<List frequently used commands for building, testing, running.>
\`\`\`bash
# Example: Python/Flask
pytest -v             # Run all tests
flask run --debug     # Start development server
alembic upgrade head  # Apply database migrations

# Example: Node.js
npm install           # Install dependencies
npm run dev           # Start development server
npm test              # Run tests
npm run build         # Build for production
\`\`\`

## Code Style Guidelines
<Mention key style guides, linters, formatters, and important conventions.>
- Follow PEP 8 (Python) / Airbnb Style Guide (JavaScript).
- Use Prettier for automated formatting.
- Type hints are mandatory for all function signatures (Python/TypeScript).

## Testing Instructions
<How to run tests? Specific frameworks? Where to add new tests?>
- Run tests using \`npm test\` / \`pytest\`.
- New unit tests should be added in \`tests/unit\`.
- Integration tests are in \`tests/integration\` and may require a running database (use \`docker compose up db\`).

## Repository Etiquette
<Branching strategy, commit message format, PR process.>
- Branch names: \`feature/JIRA-123-short-description\`, \`fix/ISSUE-45-bug-summary\`
- Use Conventional Commits (e.g., \`feat:\`, \`fix:\`, \`chore:\`).
- Squash and merge preferred for Pull Requests. PR titles should be clear.

## Developer Environment Setup
<Brief instructions for new developers.>
- Requires Node.js v18+
- Install dependencies: \`npm install\` / \`pip install -r requirements.txt\`.
- Set up environment variables: copy \`.env.example\` to \`.env\` and fill in values.
- Database setup: Run \`docker compose up -d db\` and apply migrations (\`alembic upgrade head\`).

## Project-Specific Warnings
<Any critical warnings, known issues, or deprecated parts.>
- IMPORTANT: The legacy \`utils/old_module.py\` is deprecated and should NOT be used for new development. Use \`shared/new_utils.py\` instead.
- WARNING: The current payment gateway integration (\`src/billing/legacy_gateway.ts\`) has known rate limits.

## Key Utility Functions / APIs
<Pointers to important internal helpers or external APIs used.>
- Internal: \`src/utils/datetime_helpers.py\` contains functions like \`parse_iso_datetime()\`.
- External API: Uses AcmeCorp Payments API (Docs: https://docs.acme.example.com/payments).

## Imports & Layered Memory (Illustrative for CLAUDE.md)
# You can add imports to other Markdown files for more detailed context.
# This is particularly useful for Claude's hierarchical memory.
# Example: @docs/architecture_overview.md
# Example: @~/.claude/global_claude_preferences.md
\`\`\`

Save both Markdown files at the root of the project directory (e.g. \`${get_output_dir('projects')}/${projectIds[0]}/CLAUDE.md\`).

---
### Task 2: Update DB Metadata (Call \`update_project_details\`)

Follow these steps precisely:
1.  Use the information from the codebase maps and context files to update the database.
2.  Classify: Determine the most fitting \`project_type\`. Options:
${PROJECT_TYPES.map(t => `    – **${t}**: ${getProjectTypeDescription(t)}`).join('\n')}
3.  Describe: Provide concise and informative descriptions:
    * \`simple_description\`: A brief summary (≤ 120 characters). *Example: "Node.js/React customer portal frontend."*
    * \`detailed_description\`: 2-4 paragraphs covering the project's purpose, primary technologies (languages, frameworks, DBs), high-level architecture (e.g., microservices, monolith, serverless), main entry points, and key features.
4.  Update DB: Once you have gathered the necessary information, call the **\`update_project_details\`** tool. **IMPORTANT:** Only include fields that are *new* or *different* from the "Current Project Data" provided below (if any).

---
### Overall Plan

1. Use a CodeAgent to create the \`project_map.json\`, \`CLAUDE.md\` and \`AGENTS.md\` file in each project directory. Note you should give the CodeAgent the full Schema and Structure Examples.
2. You can run multiple CodeAgents in parallel to speed up the process - I recommend you one for each project at the same time.
3. Once the CodeAgents have completed, read the files they have generated and use it to update the database with the \`update_project_details\` tool.

Notes:
- Most CodeAgents will execute their job really well, but if any information is missing, you can use \`list_directory\`, \`read_file\`, \`grep\` for analysis.
  You can also create another CodeAgent, particularly if the first one did not complete their job satisfactorily.
- If any of the files \`project_map.json\`, \`CLAUDE.md\` or \`AGENTS.md\` already exist, use their content as a starting point, but ensure to update them with the new information. Consider that they may be completely outdated.

Error Handling: If you encounter errors using tools (e.g., permission denied, file not found), note the specific error in your reasoning. Attempt to continue with other tasks if possible, but report significant blockages. If you can't resolve an issue after several attempts, consider using \`task_fatal_error()\` to indicate a critical failure.

Final Steps:
    1.  Ensure all tasks above are completed satisfactorily.
    2.  Finally, call \`task_complete()\` to signal successful completion.`;

    return createOperatorAgent({
        name: 'ProjectOperatorAgent',
        description:
            'Analyzes project(s), updates DB metadata, generates codebase maps, and bootstraps codex/claude helper docs.',
        instructions,
        tools: [
            createToolFunction(
                update_project_details,
                'Persist analyzed project details back to the database',
                {
                    project_id: 'ID of the project being updated',
                    project_type: {
                        type: 'string',
                        description: 'Detected project type',
                        enum: PROJECT_TYPES,
                        optional: true,
                    },
                    simple_description: {
                        type: 'string',
                        description:
                            'One-line summary of the project (120 characters or less)',
                        optional: true,
                    },
                    detailed_description: {
                        type: 'string',
                        description:
                            'Multi-paragraph description of the project with technical details',
                        optional: true,
                    },
                }
            ),
            ...getRunningToolTools(),
            ...getCommonTools(),
        ],
        workers: [createCodeAgent, createReasoningAgent],
        onRequest: async (
            agent: Agent,
            messages: ResponseInput
        ): Promise<[Agent, ResponseInput]> => {
            const projectIds = getProcessProjectIds();
            const currentProjectData = [];
            for (const projectId of projectIds) {
                const project = await getProject(projectId);
                currentProjectData.push(`### Project ID: ${projectId} (${get_output_dir(`projects/${projectId}`)})
\`\`\`
${formatProjectData(project)}
\`\`\``);
            }

            // Add the system status to the messages
            messages.push({
                type: 'message',
                role: 'developer',
                content: `=== Operator Status ===

Current Time: ${dateFormat()}
Your Running Time: ${readableTime(new Date().getTime() - startTime.getTime())}
Your Thought Delay: ${getThoughtDelay()} seconds

Active Tools:
${runningToolTracker.listActive()}`,
            });

            // Add the system status to the messages
            messages.push({
                type: 'message',
                role: 'developer',
                content: `=== Current Project Data ===

${currentProjectData.join('\n\n')}

'**IMPORTANT**: Only include fields in the \`update_project_details\` call if they are *new* or *need changing* based on your analysis.`,
            });

            return [agent, messages];
        },
    });
}
