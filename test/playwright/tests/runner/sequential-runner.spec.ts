/**
 * Tests for the Runner's sequential execution mechanism
 */
import { test, expect } from '../../utils/test-utils';
import { Agent } from '../../../../magi/src/utils/agent.js';
import { Runner } from '../../../../magi/src/utils/runner.js';
import { RunnerConfig, ResponseInput } from '../../../../magi/src/types.js';
import { testProviderConfig } from '../../../../magi/src/model_providers/test_provider.js';

test.describe('Sequential Runner', () => {
  test('should run a sequence of agents', async ({ configureTestProvider }) => {
    // Configure test provider
    configureTestProvider({
      fixedResponse: 'First step output',
      streamingDelay: 10
    });
    
    // Create an array to track execution
    const executionSequence = [];
    
    // Create test agent definitions
    const createFirstAgent = () => new Agent({
      agent_id: 'first-step-agent',
      name: 'First Step Agent',
      description: 'Agent for the first step in a sequence',
      instructions: 'You are the first agent in a test sequence',
      model: 'test-standard'
    });
    
    const createSecondAgent = () => new Agent({
      agent_id: 'second-step-agent',
      name: 'Second Step Agent',
      description: 'Agent for the second step in a sequence',
      instructions: 'You are the second agent in a test sequence',
      model: 'test-standard'
    });
    
    const createThirdAgent = () => new Agent({
      agent_id: 'third-step-agent',
      name: 'Third Step Agent',
      description: 'Agent for the third step in a sequence',
      instructions: 'You are the third agent in a test sequence',
      model: 'test-standard'
    });
    
    // Define the sequence configuration
    const runnerConfig: RunnerConfig = {
      'first-step': {
        agent: () => {
          executionSequence.push('first-step');
          
          // Configure provider for this step
          testProviderConfig.fixedResponse = 'First step completed successfully. Proceed to second step.';
          
          return createFirstAgent();
        },
        input: (history: ResponseInput) => {
          // Just use the existing history
          return history;
        },
        next: (output: string) => {
          // Always proceed to the second step
          return 'second-step';
        }
      },
      'second-step': {
        agent: () => {
          executionSequence.push('second-step');
          
          // Configure provider for this step
          testProviderConfig.fixedResponse = 'Second step completed successfully. Proceed to final step.';
          
          return createSecondAgent();
        },
        input: (history: ResponseInput) => {
          // Take output from the first step and use it as input
          const firstStepOutput = history.find(
            msg => 'content' in msg && typeof msg.content === 'string' && msg.content.includes('First step')
          );
          
          return [...history, { 
            role: 'user', 
            content: `Process the first step output: ${firstStepOutput?.content || 'No output from first step'}`
          }];
        },
        next: (output: string) => {
          // Always proceed to the third step
          return 'third-step';
        }
      },
      'third-step': {
        agent: () => {
          executionSequence.push('third-step');
          
          // Configure provider for this step
          testProviderConfig.fixedResponse = 'Final step completed. All steps executed successfully.';
          
          return createThirdAgent();
        },
        input: (history: ResponseInput, lastOutput: Record<string, string>) => {
          // Take output from previous steps
          return [...history, { 
            role: 'user', 
            content: `Finalize with outputs from previous steps: ${JSON.stringify(lastOutput)}`
          }];
        },
        next: (output: string) => {
          // End the sequence
          return null;
        }
      }
    };
    
    // Run the sequence
    const finalOutput = await Runner.runSequential(
      runnerConfig,
      'Start the test sequence',
      3, // maxRetries per stage
      10 // maxTotalRetries
    );
    
    // Verify the execution sequence
    expect(executionSequence).toEqual(['first-step', 'second-step', 'third-step']);
    
    // Verify the final output contains all step outputs
    expect(finalOutput).toContain('First Step Output');
    expect(finalOutput).toContain('Second Step Output');
    expect(finalOutput).toContain('Third Step Output');
    expect(finalOutput).toContain('All steps executed successfully');
  });
  
  test('should handle retries when a step fails', async ({ configureTestProvider }) => {
    // Configure test provider to fail on first attempt
    configureTestProvider({
      shouldError: true,
      errorMessage: 'First attempt failed'
    });
    
    // Create an array to track execution and retries
    const executionSequence = [];
    
    // Define the sequence configuration with steps that will retry
    const runnerConfig: RunnerConfig = {
      'first-step': {
        agent: () => {
          executionSequence.push('first-step');
          
          return new Agent({
            agent_id: 'retry-step-agent',
            name: 'Retry Step Agent',
            description: 'Agent for testing retries',
            instructions: 'You are an agent that tests the retry mechanism',
            model: 'test-standard'
          });
        },
        input: (history: ResponseInput) => history,
        next: (output: string) => {
          // On success, go to the success step
          if (output.includes('success')) {
            return 'success-step';
          }
          
          // On failure or error, go back to the first step (will cause a retry)
          return 'first-step';
        }
      },
      'success-step': {
        agent: () => {
          executionSequence.push('success-step');
          
          // Configure provider for this step
          testProviderConfig.fixedResponse = 'Success step completed.';
          
          return new Agent({
            agent_id: 'success-agent',
            name: 'Success Agent',
            description: 'Agent for the success step',
            instructions: 'You are the success agent',
            model: 'test-standard'
          });
        },
        input: (history: ResponseInput) => history,
        next: () => null // End the sequence
      }
    };
    
    // Start a timer to allow the test to set up a delayed fix
    setTimeout(() => {
      // After first attempt fails, fix the config to succeed on next attempt
      testProviderConfig.shouldError = false;
      testProviderConfig.fixedResponse = 'Retry succeeded, this attempt was successful.';
    }, 500);
    
    // Run the sequence
    const finalOutput = await Runner.runSequential(
      runnerConfig,
      'Test the retry mechanism',
      3, // maxRetries per stage
      10 // maxTotalRetries
    );
    
    // Verify the execution sequence (first-step should appear twice due to retry)
    expect(executionSequence.length).toBeGreaterThan(2);
    expect(executionSequence).toContain('success-step');
    
    // Count retries
    const firstStepCount = executionSequence.filter(step => step === 'first-step').length;
    expect(firstStepCount).toBeGreaterThanOrEqual(2); // At least one retry
    
    // Verify the final output indicates success
    expect(finalOutput).toContain('succeeded');
    expect(finalOutput).toContain('Success step completed');
  });
});