# Magi-Run-Tool Test Examples

This directory contains example tools for testing the `magi-run-tool` execution environment. These tools verify that the shared executor works correctly across both custom tools and scripts.

## Usage

Run individual tools using:

```bash
npm run test:tool test/tools/hello-world.ts '{"name":"Your Name","verbose":true}'
```

Or run all tools at once:

```bash
npm run test:tools
```

## Available Test Tools

### Hello World (`hello-world.ts`)

A simple tool that outputs a greeting in different languages and verifies basic environment access.

**Options:**
- `name`: Name to use in greeting (default: "World")
- `language`: Language for greeting - 'en', 'es', or 'fr' (default: "en")
- `verbose`: Enable detailed output (default: false)

**Example:**
```bash
npm run test:tool test/tools/hello-world.ts '{"name":"Claude","language":"fr","verbose":true}'
```

### File Operations (`file-operations.ts`) 

Tests file system operations within the tool execution environment, including reading and writing files.

**Options:**
- `readPath`: Path of file to read (default: "./package.json")
- `writePath`: Path where test file will be written (default: "./tmp-test-file.txt")
- `writeContent`: Custom content to write (default: timestamp + random number)
- `verbose`: Enable detailed output (default: false)

**Example:**
```bash
npm run test:tool test/tools/file-operations.ts '{"verbose":true}'
```

### Tool Chaining (`tool-chaining.ts`)

Tests the ability of tools to execute other tools, verifying that the execution environment properly supports tool-to-tool interactions.

**Options:**
- `subToolName`: Name of tool to execute (default: "hello-world")
- `subToolArgs`: Arguments to pass to the sub-tool (default: `{name:"Sub-tool",verbose:false}`)
- `addTimestamp`: Whether to add execution timestamps (default: true)
- `verbose`: Enable detailed output (default: false)

**Example:**
```bash
npm run test:tool test/tools/tool-chaining.ts '{"verbose":true}'
```

## Adding New Tests

To create a new test tool:

1. Create a TypeScript file in this directory
2. Implement a default export function 
3. Return a structured result object

The tool will be automatically picked up by the test runner.

Example template:

```typescript
interface MyToolOptions {
  // Your tool's options
  verbose?: boolean;
}

interface MyToolResult {
  success: boolean;
  // Your tool's result fields
}

export default async function myTool(options: MyToolOptions = {}): Promise<MyToolResult> {
  // Your tool implementation
  return { success: true };
}
