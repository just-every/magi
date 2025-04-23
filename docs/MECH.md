# MECH: Meta-cognition Ensemble Chain-of-thought Hierarchy

MECH is an advanced orchestration system for LLM agents that combines four key capabilities:

- **Meta-cognition**: The system periodically "thinks about its own thinking," analyzing recent reasoning history and adjusting its approach if needed.
- **Ensemble**: Multiple models are used in parallel or sequence, with their outputs compared, judged, or merged for higher reliability.
- **Chain-of-thought**: The agent maintains a connected thread of thoughts, allowing for multi-step reasoning and context-aware problem solving.
- **Hierarchy**: Model selection is weighted by a dynamic score, so more capable models are chosen more often, but all models can participate.

---

## Meta-cognition Frequency

- Controlled by the `meta_frequency` variable (default: every 5 LLM requests).
- Can be set to 5, 10, 20, or 40.
- After every `meta_frequency` LLM calls, the meta-cognition process is triggered.
- The meta-cognition agent can:
    - Observe the thought history and detect repeated failures or unproductive loops.
    - Suggest or inject new strategies (e.g., "Research X before continuing").
    - Adjust its own frequency and the core `thought_delay` (mirroring overseer controls).

## Model Score Weighting (Hierarchy)

- Each model in the registry has class-specific scores based on benchmark performance:
    - `monologue`: Based on **Humanity's Last Exam** (reasoning and knowledge)
    - `code`: Based on **HumanEval** (coding capability)
    - `reasoning`: Based on **GPQA Diamond** (scientific reasoning)
- Scores range from 0-100, with higher scores leading to more frequent selection in the ensemble.
- When selecting a model for a specific class, the system uses the matching score first (e.g., `code` score for code tasks).
- If a class-specific score isn't available, it falls back to the legacy overall `score` value.
- All scores are derived from public LLM leaderboards like artificialanalysis.ai.
- The meta-cognition process can dynamically adjust scores or temporarily disable models based on observed performance.

## Available Meta Tools

- `setMetaFrequency({ frequency: number })`: Change how often meta-cognition runs.
- `setThoughtDelay({ delayMs: number })`: Adjust the delay between core thoughts.
- `disableModel({ modelId: string })`: Temporarily remove a model from the rotation.
- `enableModel({ modelId: string })`: Re-enable a previously disabled model.
- The meta-cognition agent can spawn new thoughts, which are merged back into the main history thread after completion.

---

## Example Workflow

1. The system processes LLM requests, rotating models based on their scores.
2. After every N requests (`meta_frequency`), meta-cognition is triggered.
3. The meta-cognition agent reviews the recent thought chain, may adjust strategy, and can change model scores or disable/enable models.
4. The ensemble continues, now with updated weights and/or strategy.

---

## Benefits

- **Self-correcting**: Detects and adapts to repeated failures or unproductive loops.
- **Adaptive**: Dynamically prioritizes the best models for the current task.
- **Transparent**: All meta-cognitive actions and model changes are recorded in the thought history.
- **Extensible**: New meta tools and scoring strategies can be added as needed.
