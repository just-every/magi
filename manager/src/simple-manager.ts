/**
 * Simple manager generation without MECH
 */

import { generate_image_raw } from './manager-image.js';
import { multiSourceBusinessSearch } from './manager-search-business.js';
import {
    MANAGER_ASSET_TYPES,
    MANAGER_ASSET_REFERENCE,
    MANAGER_ASSET_GUIDE,
    type ManagerSearchEngine,
} from './constants.js';

export async function simpleManagerImage(
    type: MANAGER_ASSET_TYPES,
    prompt: string,
    withInspiration: boolean = true,
    brandAssets: string[] = []
): Promise<string> {
    const reference = MANAGER_ASSET_REFERENCE[type];
    const guide = MANAGER_ASSET_GUIDE[type];
    
    console.log(`\n🎨 Generating ${type} manager...`);
    console.log(`📝 Prompt: ${prompt}`);
    console.log(`🔍 With inspiration: ${withInspiration}`);
    
    try {
        let inspirationImages: string[] = [];
        
        // Phase 1: Research (if enabled)
        if (withInspiration) {
            console.log('\n🔍 Phase 1: Gathering business intelligence...');
            const searchResults = await multiSourceBusinessSearch(
                prompt,
                ['gartner', 'mckinsey', 'hbr'],
                2
            );
            
            if (searchResults && searchResults.length > 0) {
                console.log(`✅ Found ${searchResults.length} research sources`);
                // For management tasks, we'll use the research in the analysis rather than as images
            }
        }
        
        // Phase 2: Analysis Generation
        console.log('\n📊 Phase 2: Creating strategic analysis...');
        
        const analysisPrompt = `Create a comprehensive ${reference.description} for: ${prompt}\n\nRequirements:\n- ${reference.usage_context}\n- Format: ${reference.spec.type}\n- Focus on actionable insights and strategic recommendations`;
        
        const analysisResult = await generate_image_raw(
            analysisPrompt,
            'landscape', // Default to landscape for management documents
            'opaque',
            [], // No image inspiration for text-based analysis
            undefined,
            1,
            'high', // High quality for executive deliverables
            'analysis'
        );
        
        console.log(`✅ Generated strategic analysis`);
        return Array.isArray(analysisResult) ? analysisResult[0] : analysisResult;
    } catch (error) {
        console.error('❌ Manager generation failed:', error);
        throw error;
    }
}