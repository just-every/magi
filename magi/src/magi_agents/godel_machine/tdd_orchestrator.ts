/**
 * TDD Gödel Orchestrator for the MAGI Gödel Machine system.
 *
 * This orchestrator implements a Test-Driven Development workflow:
 * 1. Planning - Break down the goal into features
 * 2. For each feature:
 *    a. Write tests first (Red phase)
 *    b. Write implementation code (Green phase)
 *    c. Optionally refactor (Refactor phase)
 * 3. Ensure all tests pass
 *
 * It follows TDD principles while leveraging the Gödel Machine's agent structure
 * and the TaskOrchestrator's approach to managing task execution.
 */

import { Agent } from '../../utils/agent.js';
import { getFileTools } from '../../utils/file_utils.js';
import { Runner } from '../../utils/runner.js';
import { ResponseInput } from '../../types.js';
import { createPlanningAgent } from './planning_agent.js';
import { createTestingAgent } from './testing_agent.js';
import { createWritingAgent } from './writing_agent.js';
import { createShellAgent } from '../common_agents/shell_agent.js';
import { createBrowserAgent } from '../common_agents/browser_agent.js';
import { createSearchAgent } from '../common_agents/search_agent.js';
import { createReasoningAgent } from '../common_agents/reasoning_agent.js';

// --- Type Definitions ---

// Test Runner Class for executing tests and managing test files
export class TestRunner {
  // ShellAgent for running commands - initialized lazily if needed
  private shellAgent?: Agent;
  
  constructor() {
    // Initialization will be done lazily
  }

  /**
   * Get or initialize the shell agent
   */
  private getShellAgent(): Agent {
    if (!this.shellAgent) {
      this.shellAgent = createShellAgent();
    }
    return this.shellAgent;
  }

  /**
   * Write content to a file, creating directories if needed
   */
  async writeFile(path: string, content: string): Promise<void> {
    console.log(`Writing file: ${path}`);
    
    try {
      // Extract directory from path
      const lastSlashIndex = path.lastIndexOf('/');
      if (lastSlashIndex > 0) {
        const directory = path.substring(0, lastSlashIndex);
        // Create directory if it doesn't exist
        await this.runCommand(`mkdir -p ${directory}`);
      }
      
      // Write content to file
      // Use echo with base64 encoding to handle special characters properly
      const base64Content = Buffer.from(content).toString('base64');
      await this.runCommand(`echo "${base64Content}" | base64 -d > ${path}`);
      
      console.log(`Successfully wrote to ${path}`);
    } catch (error) {
      console.error(`Error writing file ${path}:`, error);
      throw error;
    }
  }

  /**
   * Read content from a file
   */
  async readFile(path: string): Promise<string> {
    console.log(`Reading file: ${path}`);
    
    try {
      const result = await this.runCommand(`cat ${path}`);
      return result;
    } catch (error) {
      console.error(`Error reading file ${path}:`, error);
      throw error;
    }
  }

  /**
   * Run a single test file
   */
  async runTests(testPath: string): Promise<TestResult> {
    console.log(`Running tests: ${testPath}`);
    
    try {
      // Determine the test runner based on the project
      const testRunner = await this.detectTestRunner();
      
      // Run the tests
      const command = this.buildTestCommand(testRunner, [testPath]);
      const output = await this.runCommand(command);
      
      // Parse the result
      return this.parseTestResult(output);
    } catch (error) {
      console.error(`Error running tests ${testPath}:`, error);
      
      // If the error is due to test failure, return formatted result
      if (error instanceof Error) {
        return {
          passed: false,
          output: error.message,
          error: error.stack
        };
      }
      
      // Otherwise return a generic error
      return {
        passed: false,
        output: `Error running tests: ${error}`,
        error: String(error)
      };
    }
  }

  /**
   * Run multiple test files
   */
  async runAllTests(testPaths: string[]): Promise<TestResult> {
    console.log(`Running all tests: ${testPaths.join(', ')}`);
    
    try {
      // Determine the test runner based on the project
      const testRunner = await this.detectTestRunner();
      
      // Run the tests
      const command = this.buildTestCommand(testRunner, testPaths);
      const output = await this.runCommand(command);
      
      // Parse the result
      return this.parseTestResult(output);
    } catch (error) {
      console.error(`Error running all tests:`, error);
      
      // If the error is due to test failure, return formatted result
      if (error instanceof Error) {
        return {
          passed: false,
          output: error.message,
          error: error.stack
        };
      }
      
      // Otherwise return a generic error
      return {
        passed: false,
        output: `Error running tests: ${error}`,
        error: String(error)
      };
    }
  }

  /**
   * Run a shell command
   */
  private async runCommand(command: string): Promise<string> {
    const shellAgent = this.getShellAgent();
    
    const result = await Runner.runStreamedWithTools(
      shellAgent,
      undefined,
      [{
        role: 'user',
        content: `Execute this command and return ONLY the command output: ${command}`
      }],
      {}
    );
    
    return result;
  }

  /**
   * Detect the test runner used by the project
   */
  private async detectTestRunner(): Promise<string> {
    try {
      // Check for package.json to detect test framework
      const packageJson = await this.runCommand('cat package.json 2>/dev/null || echo "{}"');
      const pkg = JSON.parse(packageJson);
      
      // Check for test script or dependencies
      if (pkg.scripts && pkg.scripts.test) {
        if (pkg.scripts.test.includes('jest')) {
          return 'jest';
        } else if (pkg.scripts.test.includes('mocha')) {
          return 'mocha';
        } else if (pkg.scripts.test.includes('vitest')) {
          return 'vitest';
        }
      }
      
      // Check dependencies
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {})
      };
      
      if (allDeps.jest) return 'jest';
      if (allDeps.mocha) return 'mocha';
      if (allDeps.vitest) return 'vitest';
      
      // Check for config files
      const hasJestConfig = await this.runCommand('find . -maxdepth 1 -name "jest.config.*" -o -name "jest.config.json" | wc -l');
      if (parseInt(hasJestConfig.trim()) > 0) return 'jest';
      
      const hasMochaConfig = await this.runCommand('find . -maxdepth 1 -name ".mocharc.*" -o -name ".mocharc.json" | wc -l');
      if (parseInt(hasMochaConfig.trim()) > 0) return 'mocha';
      
      const hasVitestConfig = await this.runCommand('find . -maxdepth 1 -name "vitest.config.*" -o -name "vitest.config.json" | wc -l');
      if (parseInt(hasVitestConfig.trim()) > 0) return 'vitest';
      
      // Default to Jest if we can't determine
      console.log("Could not determine test runner, defaulting to Jest");
      return 'jest';
    } catch (error) {
      console.warn(`Error detecting test runner:`, error);
      return 'jest'; // Default to Jest
    }
  }

  /**
   * Build a test command based on the test runner and paths
   */
  private buildTestCommand(testRunner: string, testPaths: string[]): string {
    switch (testRunner) {
      case 'jest':
        return `npx jest ${testPaths.join(' ')} --passWithNoTests`;
      case 'mocha':
        return `npx mocha ${testPaths.join(' ')}`;
      case 'vitest':
        return `npx vitest run ${testPaths.join(' ')}`;
      default:
        return `npx ${testRunner} ${testPaths.join(' ')}`;
    }
  }

  /**
   * Parse test output to determine success/failure
   */
  private parseTestResult(output: string): TestResult {
    // Check for common test failure indicators
    const hasFailed = 
      output.includes('FAIL') || 
      output.includes('failed') || 
      output.includes(' not ok ') ||
      output.includes('AssertionError') ||
      output.includes('Error:') || 
      output.includes('FAILURES');
    
    const hasSucceeded = 
      output.includes('PASS') || 
      output.includes('passing') || 
      output.includes('ok ') ||
      output.includes('SUCCESS') ||
      output.includes('All tests passed');
    
    // If both indicators are present (complex output), check more carefully
    if (hasFailed && hasSucceeded) {
      // Look for summary indicators that would appear at the end of output
      const lines = output.split('\n').reverse();
      for (const line of lines) {
        if (line.includes('FAIL') || line.includes('failed')) {
          return { passed: false, output };
        }
        if (line.includes('PASS') || line.includes('passing')) {
          return { passed: true, output };
        }
      }
    }
    
    return {
      passed: !hasFailed && hasSucceeded, // Either no failures and explicit success, or just no failures
      output
    };
  }
}

export type FeatureStatus = 'pending' | 'writing_tests' | 'running_tests_red' | 'writing_code' | 'running_tests_green' | 'refactoring' | 'completed' | 'failed';

export interface Feature {
  id: number;
  description: string;
  test_file_path?: string;
  implementation_file_path?: string;
  depends_on: number[];
  status: FeatureStatus;
}

export interface TddPlan {
  goal: string;
  features: Feature[];
}

export interface TestResult {
  passed: boolean;
  output: string;
  error?: string;
}

// --- TDD Orchestrator Class ---

export class TddGodelOrchestrator {
  private plan: TddPlan;
  private agents: {
    planning?: Agent;
    testing?: Agent;
    writing?: Agent;
    shell?: Agent;
    reasoning?: Agent;
    search?: Agent;
    browser?: Agent;
  };
  private testRunner: TestRunner;
  private featureResults: Map<number, { 
    test_content?: string;
    test_result_red?: TestResult;
    implementation_content?: string;
    test_result_green?: TestResult;
    refactored_content?: string;
  }>;
  private maxRetries: number;

  constructor(goal: string, maxRetries: number = 3) {
    this.plan = {
      goal,
      features: []
    };
    this.agents = {};
    this.testRunner = new TestRunner();
    this.featureResults = new Map();
    this.maxRetries = maxRetries;
  }

  /**
   * Initialize all agents
   */
  private initializeAgents(): void {
    this.agents.planning = createPlanningAgent(this.plan.goal);
    this.agents.testing = createTestingAgent();
    this.agents.writing = createWritingAgent(''); // Will be updated later with feature details
    this.agents.shell = createShellAgent();
    this.agents.reasoning = createReasoningAgent();
    this.agents.search = createSearchAgent();
    this.agents.browser = createBrowserAgent();
  }

  /**
   * Execute the full TDD workflow
   * @returns A final report of all features and their test results
   */
  async execute(): Promise<string> {
    console.log(`Starting TDD workflow for goal: ${this.plan.goal}`);
    
    // Initialize all agents
    this.initializeAgents();

    // 1. Planning Phase: Break down the goal into features
    await this.planningPhase();

    // 2. TDD Phase: Implement each feature using TDD workflow
    await this.implementFeatures();

    // 3. Final Integration: Run all tests to ensure everything works together
    const finalResults = await this.runFinalTests();

    // 4. Generate report
    return this.generateReport(finalResults);
  }

  /**
   * Planning phase: Break down the goal into features using the PlanningAgent
   */
  private async planningPhase(): Promise<void> {
    console.log("Starting Planning Phase...");
    
    if (!this.agents.planning) {
      throw new Error("Planning agent not initialized");
    }

    // Construct planning context
    const planningContext = `
You are going to break down the following goal into testable features for a Test-Driven Development workflow:

GOAL: ${this.plan.goal}

Your task is to:

1. Analyze what's needed to achieve this goal
2. Identify distinct, testable features or components
3. For each feature, determine:
   - A clear description of what it should do
   - What test file path would be appropriate (e.g., tests/feature_name.test.ts)
   - What implementation file path would be appropriate (e.g., src/feature_name.ts)
   - Any dependencies between features (which features need to be completed first)

Format your response as a JSON object with this structure:

\`\`\`json
{
  "features": [
    {
      "id": 1,
      "description": "Feature description here",
      "test_file_path": "Path to test file",
      "implementation_file_path": "Path to implementation file",
      "depends_on": [] // Array of feature IDs this feature depends on
    },
    // more features...
  ]
}
\`\`\`

Remember:
- Features should be small and focused
- Follow TDD best practices - each feature should be independently testable
- Consider the logical dependencies between features
- File paths should follow project conventions
`;

    try {
      // Run planning agent to get feature breakdown
      const result = await Runner.runStreamedWithTools(
        this.agents.planning,
        undefined,
        [{ role: 'user', content: planningContext }],
        {}
      );

      // Extract JSON from the planning result
      const planJson = this.extractJsonFromText(result);
      
      if (!planJson || !planJson.features || !Array.isArray(planJson.features)) {
        throw new Error("Invalid planning result format. Expected JSON with a features array.");
      }

      // Validate and process features
      this.plan.features = planJson.features.map((feature: any, index: number) => {
        const id = feature.id || index + 1;
        
        if (!feature.description) {
          throw new Error(`Feature ${id} is missing a description`);
        }

        if (!feature.test_file_path) {
          console.warn(`Feature ${id} is missing a test file path, will be determined during test writing`);
        }

        if (!feature.implementation_file_path) {
          console.warn(`Feature ${id} is missing an implementation file path, will be determined during implementation`);
        }

        if (!Array.isArray(feature.depends_on)) {
          feature.depends_on = [];
        }

        return {
          id,
          description: feature.description,
          test_file_path: feature.test_file_path,
          implementation_file_path: feature.implementation_file_path,
          depends_on: feature.depends_on,
          status: 'pending' as FeatureStatus,
        };
      });

      console.log(`Planning complete. Identified ${this.plan.features.length} features.`);
    } catch (error) {
      console.error("Error in planning phase:", error);
      throw new Error(`Failed to plan features: ${error}`);
    }
  }

  /**
   * Extract JSON from a text string which might contain markdown and other content
   */
  private extractJsonFromText(text: string): any {
    // Try to find JSON in markdown code blocks
    const jsonMatches = text.match(/```(?:json)?\s*(\{[\s\S]*?\})```/) || 
                        text.match(/\{[\s\S]*?"features"[\s\S]*?\}/);
    
    if (jsonMatches && jsonMatches[1]) {
      try {
        return JSON.parse(jsonMatches[1]);
      } catch (e) {
        console.warn("Found JSON-like content but failed to parse:", e);
      }
    }

    // Try to find JSON directly in the text
    try {
      // Find the first { and last } in the text
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonText = text.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonText);
      }
    } catch (e) {
      console.warn("Failed to extract JSON directly from text:", e);
    }

    return null;
  }

  /**
   * Process all features using the TDD workflow
   */
  private async implementFeatures(): Promise<void> {
    // Sort features by dependencies to ensure correct order
    const sortedFeatures = this.sortFeaturesByDependencies();
    
    for (const feature of sortedFeatures) {
      console.log(`Processing feature ${feature.id}: ${feature.description}`);
      
      try {
        // Update feature status
        feature.status = 'writing_tests';
        
        // 1. RED Phase: Write tests first
        const testContent = await this.writeTests(feature);
        this.featureResults.set(feature.id, { test_content: testContent });
        
        // 2. Verify RED: Run tests (they should fail)
        feature.status = 'running_tests_red';
        const redResult = await this.testRunner.runTests(feature.test_file_path!);
        this.featureResults.get(feature.id)!.test_result_red = redResult;
        
        // If tests pass on first try, something's wrong - either the tests aren't testing anything
        // or the functionality already exists. Log a warning but continue.
        if (redResult.passed) {
          console.warn(`WARNING: Tests for feature ${feature.id} passed on first run, but we expected them to fail. This might indicate insufficient testing.`);
        }
        
        // 3. GREEN Phase: Write implementation code to make tests pass
        feature.status = 'writing_code';
        const implementationContent = await this.writeImplementation(feature, testContent, redResult);
        this.featureResults.get(feature.id)!.implementation_content = implementationContent;
        
        // 4. Verify GREEN: Run tests (they should pass now)
        feature.status = 'running_tests_green';
        const greenResult = await this.testRunner.runTests(feature.test_file_path!);
        this.featureResults.get(feature.id)!.test_result_green = greenResult;
        
        // If tests still fail, try to fix them
        if (!greenResult.passed) {
          let retry = 0;
          while (!greenResult.passed && retry < this.maxRetries) {
            retry++;
            console.log(`Tests still failing for feature ${feature.id}. Retry ${retry}/${this.maxRetries}...`);
            
            // Try to fix the implementation based on test failures
            const fixedImplementation = await this.fixImplementation(
              feature, 
              testContent, 
              implementationContent, 
              greenResult
            );
            
            this.featureResults.get(feature.id)!.implementation_content = fixedImplementation;
            
            // Run tests again
            const retryResult = await this.testRunner.runTests(feature.test_file_path!);
            this.featureResults.get(feature.id)!.test_result_green = retryResult;
            
            if (retryResult.passed) {
              console.log(`Tests passing after retry ${retry} for feature ${feature.id}`);
              break;
            }
          }
          
          // If tests still fail after all retries, mark feature as failed
          if (!this.featureResults.get(feature.id)!.test_result_green!.passed) {
            feature.status = 'failed';
            console.error(`Failed to implement feature ${feature.id} after ${this.maxRetries} retries`);
            continue;
          }
        }
        
        // 5. Optional REFACTOR Phase: Improve the code while keeping tests green
        feature.status = 'refactoring';
        const refactoredContent = await this.refactorImplementation(
          feature, 
          this.featureResults.get(feature.id)!.implementation_content!
        );
        
        if (refactoredContent !== this.featureResults.get(feature.id)!.implementation_content) {
          this.featureResults.get(feature.id)!.refactored_content = refactoredContent;
          
          // Verify refactored code still passes tests
          const refactorResult = await this.testRunner.runTests(feature.test_file_path!);
          if (!refactorResult.passed) {
            // Revert to pre-refactored implementation if tests fail
            console.warn(`Refactored code for feature ${feature.id} failed tests. Reverting to previous implementation.`);
            
            // Write original implementation back
            await this.testRunner.writeFile(
              feature.implementation_file_path!,
              this.featureResults.get(feature.id)!.implementation_content!
            );
          }
        }
        
        // Mark feature as completed
        feature.status = 'completed';
        console.log(`Completed feature ${feature.id}`);
        
      } catch (error) {
        console.error(`Error processing feature ${feature.id}:`, error);
        feature.status = 'failed';
      }
    }
  }

  /**
   * Sort features by their dependencies to ensure they're processed in the correct order
   */
  private sortFeaturesByDependencies(): Feature[] {
    const result: Feature[] = [];
    const visited = new Set<number>();
    const temp = new Set<number>();

    // A recursive depth-first search to topologically sort features
    const visit = (featureId: number) => {
      // Already processed this feature
      if (visited.has(featureId)) return;
      
      // Detect cycles
      if (temp.has(featureId)) {
        throw new Error(`Circular dependency detected involving feature ${featureId}`);
      }
      
      // Mark as being processed
      temp.add(featureId);
      
      // Get the feature
      const feature = this.plan.features.find(f => f.id === featureId);
      if (!feature) throw new Error(`Feature ${featureId} not found`);
      
      // Visit all dependencies first
      for (const depId of feature.depends_on) {
        visit(depId);
      }
      
      // Mark as processed and add to result
      temp.delete(featureId);
      visited.add(featureId);
      result.push(feature);
    };
    
    // Visit all features
    for (const feature of this.plan.features) {
      if (!visited.has(feature.id)) {
        visit(feature.id);
      }
    }
    
    return result;
  }

  /**
   * Write tests for a feature using the TestingAgent
   */
  private async writeTests(feature: Feature): Promise<string> {
    console.log(`Writing tests for feature ${feature.id}...`);
    
    if (!this.agents.testing) {
      throw new Error("Testing agent not initialized");
    }
    
    const testingContext = `
You are going to write tests for the following feature following Test-Driven Development principles:

FEATURE: ${feature.description}

TEST FILE PATH: ${feature.test_file_path || "(to be determined)"}
IMPLEMENTATION FILE PATH: ${feature.implementation_file_path || "(to be determined)"}

GOAL: ${this.plan.goal}

Your task is to:

1. Write comprehensive tests for this feature BEFORE any implementation exists
2. Follow these TDD principles:
   - Tests should be specific and focused
   - Tests should verify behavior, not implementation
   - Tests should be deterministic and repeatable
   - Tests should provide clear failure messages
3. Use an appropriate testing framework (Jest or similar)
4. If the test file path is not specified, suggest an appropriate one
5. If the implementation file path is not specified, suggest an appropriate one

Remember:
- Focus on WHAT the feature should do, not HOW it should do it
- Include tests for edge cases and error conditions
- Tests should fail initially (RED phase) because no implementation exists yet
- Your tests will guide the implementation

Write the complete test file content.
`;

    // Run testing agent to write tests
    const result = await Runner.runStreamedWithTools(
      this.agents.testing,
      undefined,
      [{ role: 'user', content: testingContext }],
      {}
    );

    // Extract the test file path if it was suggested
    if (!feature.test_file_path) {
      const pathMatch = result.match(/TEST FILE PATH: ([^\n]+)/);
      if (pathMatch && pathMatch[1]) {
        feature.test_file_path = pathMatch[1].trim();
      }
    }

    // Extract the implementation file path if it was suggested
    if (!feature.implementation_file_path) {
      const pathMatch = result.match(/IMPLEMENTATION FILE PATH: ([^\n]+)/);
      if (pathMatch && pathMatch[1]) {
        feature.implementation_file_path = pathMatch[1].trim();
      }
    }

    // If paths are still missing, use reasonable defaults
    if (!feature.test_file_path) {
      const featureName = feature.description.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      feature.test_file_path = `test/${featureName}.test.ts`;
      console.warn(`No test file path specified for feature ${feature.id}, using default: ${feature.test_file_path}`);
    }

    if (!feature.implementation_file_path) {
      const featureName = feature.description.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      feature.implementation_file_path = `src/${featureName}.ts`;
      console.warn(`No implementation file path specified for feature ${feature.id}, using default: ${feature.implementation_file_path}`);
    }

    // Extract the test code from the result
    const codeBlocks = result.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/g);
    let testCode = "";
    
    if (codeBlocks && codeBlocks.length > 0) {
      // Extract the content from the first code block
      const match = codeBlocks[0].match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/);
      if (match && match[1]) {
        testCode = match[1];
      }
    } else {
      // If no code blocks found, try to find test code directly
      const lines = result.split('\n');
      const codeLines = [];
      let inCode = false;
      
      for (const line of lines) {
        // Skip explanatory text but include actual code
        if (line.includes('import ') || line.includes('describe(') || 
            line.includes('test(') || line.includes('it(') || 
            line.includes('expect(') || line.includes('class ') || 
            line.includes('function ') || inCode) {
          inCode = true;
          codeLines.push(line);
        }
      }
      
      if (codeLines.length > 0) {
        testCode = codeLines.join('\n');
      } else {
        throw new Error(`Could not extract test code for feature ${feature.id}`);
      }
    }

    // Write test code to file
    await this.testRunner.writeFile(feature.test_file_path, testCode);
    
    console.log(`Tests written for feature ${feature.id}`);
    return testCode;
  }

  /**
   * Write implementation code for a feature using the WritingAgent
   */
  private async writeImplementation(feature: Feature, testCode: string, testResult: TestResult): Promise<string> {
    console.log(`Writing implementation for feature ${feature.id}...`);
    
    if (!this.agents.writing) {
      throw new Error("Writing agent not initialized");
    }
    
    // Check for any existing code at the implementation path
    let existingCode = "";
    try {
      existingCode = await this.testRunner.readFile(feature.implementation_file_path!);
    } catch (error) {
      // File doesn't exist yet, which is expected
      existingCode = "";
    }
    
    const writingContext = `
You are going to implement code to make the following tests pass following Test-Driven Development principles:

FEATURE: ${feature.description}

GOAL: ${this.plan.goal}

TEST FILE PATH: ${feature.test_file_path}
IMPLEMENTATION FILE PATH: ${feature.implementation_file_path}

EXISTING IMPLEMENTATION:
${existingCode ? "```typescript\n" + existingCode + "\n```" : "No existing implementation."}

TEST CODE:
\`\`\`typescript
${testCode}
\`\`\`

TEST RESULT (failing tests):
\`\`\`
${testResult.output}
${testResult.error || ""}
\`\`\`

Your task is to:

1. Implement just enough code to make the tests pass (GREEN phase)
2. Focus on making the tests pass, not on perfect code yet (refactoring comes later)
3. Implement only what the tests require - don't add features not covered by tests
4. Create the implementation file at the specified path

Remember:
- This is the GREEN phase of TDD (make tests pass with minimal implementation)
- Your code should satisfy all test cases
- Consider edge cases the tests might be checking for
- If the tests import from other modules, maintain those import paths

Write the complete implementation file content.
`;

    // Run writing agent to implement code
    const result = await Runner.runStreamedWithTools(
      this.agents.writing,
      undefined,
      [{ role: 'user', content: writingContext }],
      {}
    );

    // Extract the implementation code from the result
    const codeBlocks = result.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/g);
    let implementationCode = "";
    
    if (codeBlocks && codeBlocks.length > 0) {
      // Extract the content from the first code block
      const match = codeBlocks[0].match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/);
      if (match && match[1]) {
        implementationCode = match[1];
      }
    } else {
      // If no code blocks found, try to find implementation code directly
      const lines = result.split('\n');
      const codeLines = [];
      let inCode = false;
      
      for (const line of lines) {
        // Skip explanatory text but include actual code
        if (line.includes('import ') || line.includes('export ') || 
            line.includes('class ') || line.includes('function ') || 
            line.includes('interface ') || line.includes('const ') || 
            line.includes('let ') || inCode) {
          inCode = true;
          codeLines.push(line);
        }
      }
      
      if (codeLines.length > 0) {
        implementationCode = codeLines.join('\n');
      } else {
        throw new Error(`Could not extract implementation code for feature ${feature.id}`);
      }
    }

    // Write implementation code to file
    await this.testRunner.writeFile(feature.implementation_file_path!, implementationCode);
    
    console.log(`Implementation written for feature ${feature.id}`);
    return implementationCode;
  }

  /**
   * Fix failing implementation
   */
  private async fixImplementation(
    feature: Feature, 
    testCode: string, 
    implementationCode: string, 
    testResult: TestResult
  ): Promise<string> {
    console.log(`Fixing implementation for feature ${feature.id}...`);
    
    if (!this.agents.writing) {
      throw new Error("Writing agent not initialized");
    }
    
    const fixContext = `
You are going to fix an implementation that is failing its tests:

FEATURE: ${feature.description}

TEST FILE PATH: ${feature.test_file_path}
IMPLEMENTATION FILE PATH: ${feature.implementation_file_path}

TEST CODE:
\`\`\`typescript
${testCode}
\`\`\`

CURRENT IMPLEMENTATION:
\`\`\`typescript
${implementationCode}
\`\`\`

FAILING TEST RESULT:
\`\`\`
${testResult.output}
${testResult.error || ""}
\`\`\`

Your task is to:

1. Analyze the test failures carefully
2. Fix the implementation to make all tests pass
3. Make minimal changes to address the specific failures

Focus on addressing the specific issues in the test failures. Write the complete fixed implementation file content.
`;

    // Run writing agent to fix implementation
    const result = await Runner.runStreamedWithTools(
      this.agents.writing,
      undefined,
      [{ role: 'user', content: fixContext }],
      {}
    );

    // Extract the fixed implementation code
    const codeBlocks = result.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/g);
    let fixedCode = "";
    
    if (codeBlocks && codeBlocks.length > 0) {
      // Extract the content from the first code block
      const match = codeBlocks[0].match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/);
      if (match && match[1]) {
        fixedCode = match[1];
      }
    } else {
      // If no code blocks found, attempt to identify the code directly
      const lines = result.split('\n');
      const codeLines = [];
      let inCode = false;
      
      for (const line of lines) {
        if (line.includes('import ') || line.includes('export ') || 
            line.includes('class ') || line.includes('function ') || 
            line.includes('interface ') || line.includes('const ') || 
            line.includes('let ') || inCode) {
          inCode = true;
          codeLines.push(line);
        }
      }
      
      if (codeLines.length > 0) {
        fixedCode = codeLines.join('\n');
      } else {
        throw new Error(`Could not extract fixed implementation code for feature ${feature.id}`);
      }
    }

    // Write fixed code to file
    await this.testRunner.writeFile(feature.implementation_file_path!, fixedCode);
    
    console.log(`Fixed implementation written for feature ${feature.id}`);
    return fixedCode;
  }

  /**
   * Refactor implementation while maintaining test passes
   */
  private async refactorImplementation(feature: Feature, implementationCode: string): Promise<string> {
    console.log(`Refactoring implementation for feature ${feature.id}...`);
    
    if (!this.agents.writing) {
      throw new Error("Writing agent not initialized");
    }
    
    const refactorContext = `
You are going to refactor code following Test-Driven Development principles:

FEATURE: ${feature.description}

IMPLEMENTATION FILE PATH: ${feature.implementation_file_path}

CURRENT IMPLEMENTATION (passes all tests):
\`\`\`typescript
${implementationCode}
\`\`\`

Your task is to:

1. Refactor the code to improve its quality, maintainability, and performance
2. Ensure the refactored code still passes all tests
3. Focus on code structure, naming, and efficiency
4. Apply appropriate design patterns or best practices

Remember:
- This is the REFACTOR phase of TDD (improve code while keeping tests green)
- Do not change the external behavior (API) of the code
- Keep the same exports, function signatures, etc.
- Do not compromise correctness for elegance

If you believe the code is already well-structured and doesn't need refactoring, explain why.
Otherwise, write the complete refactored implementation file content.
`;

    // Run writing agent to refactor implementation
    const result = await Runner.runStreamedWithTools(
      this.agents.writing,
      undefined,
      [{ role: 'user', content: refactorContext }],
      {}
    );

    // Check if the agent decided not to refactor
    if (result.includes("The code is already well-structured") || 
        result.includes("doesn't need refactoring") ||
        result.includes("no refactoring needed")) {
      console.log(`No refactoring needed for feature ${feature.id}`);
      return implementationCode;
    }

    // Extract the refactored implementation code
    const codeBlocks = result.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/g);
    let refactoredCode = "";
    
    if (codeBlocks && codeBlocks.length > 0) {
      // Extract the content from the first code block
      const match = codeBlocks[0].match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/);
      if (match && match[1]) {
        refactoredCode = match[1];
      }
    } else {
      // If no clear refactored code found, return original
      console.log(`Could not extract refactored code for feature ${feature.id}, keeping original`);
      return implementationCode;
    }

    // Write refactored code to file
    await this.testRunner.writeFile(feature.implementation_file_path!, refactoredCode);
    
    console.log(`Refactored implementation written for feature ${feature.id}`);
    return refactoredCode;
  }

  /**
   * Run final tests on all features to ensure everything works together
   */
  private async runFinalTests(): Promise<TestResult> {
    console.log("Running final integration tests...");
    
    // Collect all test file paths
    const testPaths = this.plan.features
      .filter(feature => feature.status === 'completed')
      .map(feature => feature.test_file_path!)
      .filter(Boolean);
    
    if (testPaths.length === 0) {
      return {
        passed: false,
        output: "No tests to run - all features failed or were skipped",
      };
    }
    
    // Run all tests
    return await this.testRunner.runAllTests(testPaths);
  }

  /**
   * Generate a comprehensive report of the TDD process
   */
  private generateReport(finalTestResult: TestResult): string {
    let report = `# TDD Gödel Machine Execution Report\n\n`;
    
    // Goal and overview
    report += `## Goal\n\n${this.plan.goal}\n\n`;
    
    // Summary
    const completedFeatures = this.plan.features.filter(f => f.status === 'completed').length;
    const failedFeatures = this.plan.features.filter(f => f.status === 'failed').length;
    const totalFeatures = this.plan.features.length;
    
    report += `## Summary\n\n`;
    report += `- Total features: ${totalFeatures}\n`;
    report += `- Completed: ${completedFeatures} (${Math.round(completedFeatures/totalFeatures*100)}%)\n`;
    report += `- Failed: ${failedFeatures} (${Math.round(failedFeatures/totalFeatures*100)}%)\n`;
    report += `- Final integration tests: ${finalTestResult.passed ? 'PASSED' : 'FAILED'}\n\n`;
    
    // Feature details
    report += `## Feature Details\n\n`;
    
    this.plan.features.forEach(feature => {
      report += `### Feature ${feature.id}: ${feature.description}\n\n`;
      report += `- Status: ${feature.status}\n`;
      report += `- Test file: \`${feature.test_file_path}\`\n`;
      report += `- Implementation file: \`${feature.implementation_file_path}\`\n`;
      
      const results = this.featureResults.get(feature.id);
      
      if (!results) {
        report += `- No execution results available\n\n`;
        return;
      }
      
      // Red phase results
      if (results.test_result_red) {
        report += `- Red phase: ${results.test_result_red.passed ? 'PASSED (unexpected!)' : 'FAILED (expected)'}\n`;
      }
      
      // Green phase results
      if (results.test_result_green) {
        report += `- Green phase: ${results.test_result_green.passed ? 'PASSED' : 'FAILED'}\n`;
      }
      
      // Refactoring
      if (results.refactored_content) {
        report += `- Refactoring: Performed\n`;
      } else {
        report += `- Refactoring: Not needed\n`;
      }
      
      report += `\n`;
    });
    
    // Final test output
    if (finalTestResult.output) {
      report += `## Final Integration Test Output\n\n`;
      report += "```\n";
      report += finalTestResult.output;
      report += "\n```\n\n";
    }
    
    return report;
  }
}
