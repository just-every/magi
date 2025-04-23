# Ensemble Approach in MAGI

This document explains the implementation of a two-part ensemble approach in MAGI, inspired by the paper "Confidence Improves Self-Consistency in LLMs" (arXiv:2502.06233v1).

## Overview

The ensemble approach consists of two complementary techniques:

1. **Multi-Model Ensemble + LLM-as-Judge** (Approach 1): Improves individual reasoning steps by sampling multiple models and using an LLM to judge the responses.

2. **Enhanced Inter-Agent Validation** (Approach 2): Improves coordination and synthesis of results from multiple worker agents through confidence signaling and structured review.

These techniques can be used independently or together to boost the performance and reliability of agents in complex tasks.

## 1. Multi-Model Ensemble + LLM-as-Judge

### How It Works

1. When enabled for an agent, instead of using a single model to generate a response, the system:

    - Samples responses from multiple diverse models in parallel
    - Uses an LLM (the "judge") to score each response
    - Applies Softmax normalization to the scores
    - Selects the winning response through weighted voting

2. Conceptually, this is similar to the paper's CISC mechanism but uses multiple models instead of multiple samples from the same model, and uses explicit LLM judgment rather than token probabilities.

### Configuration Options

The following options can be set in an agent's `modelSettings`:

- `enableDiverseEnsemble`: Boolean to turn the feature on/off
- `ensembleSamples`: Number of models to sample (default: 3)
- `ensembleTemperature`: Temperature for Softmax normalization (default: 1.0)
- `ensembleJudgeClass`: Specific model class to use as the judge (defaults to a reasoning-class model)
- `ensembleJudgePrompt`: Custom prompt template for the judge
- `ensembleModelPool`: Optional explicit list of models to sample from

### Benefits

- **Higher Quality Responses**: By leveraging the strengths of multiple models and selecting the best response
- **Reduced Variability**: Less dependence on the quality of a single model's generation
- **Robustness**: More consistent performance across different types of questions

## 2. Enhanced Inter-Agent Validation

### How It Works

1. Worker agents (like CodeAgent, ReasoningAgent) include confidence scores in their responses when configured.
2. The OperatorAgent evaluates these confidence scores when making decisions.
3. For complex tasks or when conflicting information is received, the OperatorAgent performs a structured "reflective synthesis" process, potentially calling a ReasoningAgent for validation.

### Configuration Options

- `enableConfidenceSignaling`: Boolean to enable structured reflective synthesis of workers. Automatically sets enableConfidenceMonitoring on workers.
- `enableConfidenceMonitoring`: Boolean to enable output of confidence scores in agent responses.

### Benefits

- **Better Coordination**: The OperatorAgent can make more informed decisions based on confidence levels
- **Critical Oversight**: Adds an explicit reflective step for important decisions
- **Quality Control**: Helps identify and address low-confidence or conflicting results

## Usage Example

```typescript
// Create an OperatorAgent with confidence signaling and review
const operator = createOperatorAgent();

// Enable multi-model ensemble for the operator
operator.modelSettings = {
    ...operator.modelSettings,
    enableConfidenceMonitoring: true,
    enableConfidenceSignaling: true,
    enableDiverseEnsemble: true,
    ensembleSamples: 3,
    ensembleTemperature: 0.5,
};
```

See `magi/src/examples/ensemble_example.ts` for a complete example.

## Implementation Details

- The Multi-Model Ensemble is implemented in `Runner.runDiverseEnsemble` and is triggered from `Runner.runStreamed` when enabled.
- Enhanced Inter-Agent Validation is implemented through modified prompts for agents and enhanced instructions for the OperatorAgent.
- Confidence signaling follows a standardized format: `Confidence [0-100]: X` to enable consistent parsing.

## Performance Considerations

- The Multi-Model Ensemble approach increases compute costs and latency for each step where it's enabled, as it requires multiple model calls plus judging.
- The benefit comes from potentially higher quality individual steps, which might reduce the total number of steps needed for complex tasks.
- Consider limiting the ensemble approach to critical agents (like the OperatorAgent) or specific complex tasks where quality outweighs speed considerations.
