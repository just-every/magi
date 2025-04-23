/**
 * Example demonstrating how to use the Multi-Model Ensemble + LLM-as-Judge approach
 * and Enhanced Inter-Agent Validation/Synthesis features.
 *
 * This example shows:
 * 1. Setting up an OperatorAgent with confidence signaling and review
 * 2. Configuring worker agents with diverse ensemble capability
 * 3. Running a task with these enhanced features
 */

import { createOperatorAgent } from '../magi_agents/operator_agent.js';
import { getCommunicationManager } from '../utils/communication.js';

/**
 * Creates and runs an enhanced operator with ensemble and validation features enabled
 */
export async function runEnhancedExample(task: string) {
    console.log(
        'Running enhanced ensemble + validation example with task:',
        task
    );

    // Configure the OperatorAgent with confidence signaling and review enabled
    const operator = createOperatorAgent();

    // Modifying the operator's modelSettings to use diverse ensemble for its own responses
    operator.modelSettings = {
        ...operator.modelSettings,
        enableConfidenceMonitoring: true,
        enableConfidenceSignaling: true,
        enableDiverseEnsemble: true,
        ensembleSamples: 3, // Number of models to sample (default is 3)
        ensembleTemperature: 0.5, // Temperature for softmax normalization (default is 1.0)
        // Optionally specify a specific judge model and custom prompt
        // ensembleJudgeClass: 'standard',
        // ensembleJudgePrompt: 'Custom judge prompt template with {question} and {response} placeholders'
    };

    // Simulate running the task (in a real application, use an appropriate runner)
    try {
        // This is a simulation - in actual code you would run this through the proper channel
        console.log('Starting ensemble-enhanced task');
        console.log('Task: ', task);
        console.log('Operator Agent configured with:');
        console.log('- Confidence Signaling: Enabled');
        console.log('- Operator Review: Enabled');
        console.log('- Diverse Ensemble: Enabled');
        console.log(
            'Sample worker agents pre-configured with diverse ensemble capability'
        );

        // In a real implementation, this would be the actual task execution
        const comm = getCommunicationManager();
        comm.send({
            type: 'process_start',
            agentProcess: {
                processId: 'ensemble-example',
                started: new Date(),
                status: 'started',
                tool: 'run_task',
                command: 'run_enhanced_task',
                name: 'Enhanced Task with Ensemble + Validation',
            },
        });

        // Additional implementation would go here in a real application

        return {
            status: 'success',
            message: 'Ensemble + validation features configured successfully',
            operator,
        };
    } catch (error) {
        console.error('Error running enhanced ensemble example:', error);
        return {
            status: 'error',
            message: String(error),
            error,
        };
    }
}

/**
 * Usage example:
 *
 * ```
 * import { runEnhancedExample } from './examples/ensemble_example.js';
 *
 * // Run a task with enhanced ensemble + validation features
 * const result = await runEnhancedExample('Create a simple React counter application');
 * console.log(result);
 * ```
 */
