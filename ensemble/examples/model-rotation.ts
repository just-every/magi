/**
 * Model Rotation Example
 * 
 * This example demonstrates ensemble's automatic model rotation
 * based on scores and availability.
 */

import { getModelFromClass, listAvailableModels, findModel } from '../index.js';
import type { ModelClassID } from '../types.js';

async function demonstrateModelRotation() {
    console.log('🎯 Model Rotation Example\n');
    
    // List all available models
    const models = listAvailableModels();
    console.log(`Found ${models.length} available models\n`);
    
    // Show model selection for different classes
    const classes: ModelClassID[] = ['standard', 'code', 'reasoning', 'monologue'];
    
    for (const modelClass of classes) {
        console.log(`\n📊 Class: ${modelClass}`);
        console.log('-'.repeat(40));
        
        // Get the best model for this class multiple times
        // to show rotation behavior
        for (let i = 0; i < 3; i++) {
            const selected = await getModelFromClass(modelClass);
            const modelInfo = findModel(selected);
            
            console.log(`  Attempt ${i + 1}: ${selected}`);
            if (modelInfo) {
                // Show the score for this class
                const score = modelInfo[modelClass] || modelInfo.score || 0;
                console.log(`    Score: ${score}`);
                console.log(`    Provider: ${modelInfo.provider}`);
                
                if (modelInfo.rate_limit_fallback) {
                    console.log(`    Rate limit fallback: ${modelInfo.rate_limit_fallback}`);
                }
            }
        }
    }
    
    // Demonstrate specific model info
    console.log('\n\n🔍 Specific Model Information');
    console.log('-'.repeat(40));
    
    const exampleModels = ['claude-3-5-sonnet-latest', 'gpt-4o', 'gemini-2.0-flash-exp'];
    
    for (const modelId of exampleModels) {
        const model = findModel(modelId);
        if (model) {
            console.log(`\n${modelId}:`);
            console.log(`  Provider: ${model.provider}`);
            console.log(`  Overall score: ${model.score}`);
            console.log(`  Code score: ${model.code || 'N/A'}`);
            console.log(`  Reasoning score: ${model.reasoning || 'N/A'}`);
            console.log(`  Monologue score: ${model.monologue || 'N/A'}`);
            console.log(`  Context window: ${model.context_window?.toLocaleString() || 'Unknown'}`);
        }
    }
}

async function demonstrateFailover() {
    console.log('\n\n🔄 Failover Demonstration');
    console.log('-'.repeat(40));
    
    // Find models with rate limit fallbacks
    const models = listAvailableModels();
    const modelsWithFallback = models.filter(m => m.rate_limit_fallback);
    
    console.log(`\nModels with rate limit fallbacks:`);
    for (const model of modelsWithFallback) {
        console.log(`  ${model.model_id} → ${model.rate_limit_fallback}`);
    }
}

async function main() {
    await demonstrateModelRotation();
    await demonstrateFailover();
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}