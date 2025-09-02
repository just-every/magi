# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript source. Key areas: `cli.ts` (entry), `manager-*.ts` (core logic), `services/`, `utils/`, `types/`, `interfaces/`, `slack/`, `agents/`, `examples/`.
- `src/__tests__/`: Unit tests (`*.test.ts`).
- `dist/`: Compiled output from `tsc`.
- `.output/`: Image and run artifacts (override with `MANAGER_OUTPUT_DIR`).
- `.env` / `.env.example`: Runtime configuration (LLM and Slack keys).

## Build, Test, and Development Commands
- `npm run build`: Compile TypeScript to `dist/` using `tsc`.
- `npm test`: Run Vitest in Node environment.
- `npm run test:ui`: Vitest UI runner (interactive debug).
- `npm run lint`: Lint TypeScript sources via ESLint.
- `npm run clean`: Remove `dist/`.
- `npm run manager -- …`: Execute the CLI (loads `.env`). Example: `npm run manager -- generate primary_logo "Modern SaaS logo"`.
- `npm run slack-bot`: Build then launch `dist/examples/slack-bot.js`.

## Coding Style & Naming Conventions
- Language: TypeScript `ES2022`, strict mode; ESM modules.
- Indentation: 2 spaces; prefer `camelCase` for functions/vars, `PascalCase` for types/interfaces, file names `kebab-case.ts`.
- Linting: `@typescript-eslint` recommended rules, `prefer-const` enforced, `no-unused-vars` (ignore `_`-prefixed), `no-explicit-any` warned. Run `npm run lint` before PRs.

## Testing Guidelines
- Framework: Vitest; tests live in `src/__tests__/` and match `**/*.{test,spec}.{ts,js}`.
- Naming: `<unit>.test.ts` (e.g., `manager-image.test.ts`).
- Run: `npm test` (CLI), `npm run test:ui` (UI). Coverage reports are emitted (`text`, `json`, `html`). Add/adjust tests when changing logic.

## Commit & Pull Request Guidelines
- Commits: Follow Conventional Commits (e.g., `feat:`, `fix:`, `build:`, `ci:`, `docs:`, `refactor:`, `test:`). Recent history uses `fix:`, `build:`, `ci:`.
- PRs: Include clear description, rationale, and screenshots or sample outputs (e.g., grid PNGs in `.output/`) when relevant. Link issues, note breaking changes, and list test coverage/commands executed (`build`, `lint`, `test`).

## Security & Configuration Tips
- Copy `.env.example` → `.env`; never commit secrets. Common vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, Slack tokens (`SLACK_BOT_TOKEN`, etc.).
- The `manager.sh` helper loads `.env` then runs `src/cli.ts` via `tsx`.

## Architecture Overview
- Library API is exported from `src/index.ts`; CLI routes through `src/cli.ts` into `manager-*.ts` modules. Images and intermediate artifacts default to `.output/`.
