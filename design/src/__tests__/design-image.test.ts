/**
 * Tests for design image generation functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { design_image, getDesignImageTools } from '../design-image.js';

// Mock the dependencies
vi.mock('@just-every/ensemble', () => ({
    ensembleImage: vi.fn().mockResolvedValue(['data:image/png;base64,mockBase64Data']),
    createToolFunction: vi.fn((fn, description, parameters) => ({
        definition: {
            type: 'function',
            function: {
                name: fn.name,
                description,
                parameters: {
                    type: 'object',
                    properties: parameters,
                    required: Object.keys(parameters).filter(key => !parameters[key].optional)
                }
            }
        },
        handler: fn
    }))
}));

vi.mock('@just-every/mind', () => ({
    quick_llm_call: vi.fn().mockResolvedValue(JSON.stringify({
        run_id: 'test_run',
        context: 'Test design context',
        aspect: 'square',
        background: 'transparent',
        inspiration_search: [],
        inspiration_judge: 'Test judge criteria',
        design_prompts: {
            draft: ['Draft prompt 1', 'Draft prompt 2', 'Draft prompt 3'],
            medium: 'Medium prompt',
            high: 'High prompt'
        },
        design_judge: {
            draft: 'Draft judge criteria',
            medium: 'Medium judge criteria', 
            high: 'High judge criteria'
        }
    }))
}));

vi.mock('../design-search.js', () => ({
    smart_design_raw: vi.fn().mockResolvedValue([]),
    createNumberedGrid: vi.fn().mockResolvedValue('data:image/png;base64,mockGridData'),
    selectBestFromGrid: vi.fn().mockResolvedValue([1, 2])
}));

vi.mock('../utils/grid-judge.js', () => ({
    judgeImageSet: vi.fn().mockResolvedValue(['mock-image-1.png'])
}));

vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn()
}));

describe('design_image', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should generate a design image successfully', async () => {
        const result = await design_image(
            'primary_logo',
            'A modern tech startup logo',
            false, // Skip inspiration to simplify test
            []
        );

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
    });

    it('should use the correct design specifications', async () => {
        await design_image(
            'primary_logo',
            'A minimalist logo design',
            false,
            []
        );

        // Verify that the design spec was requested
        const { quick_llm_call } = await import('@just-every/mech');
        expect(quick_llm_call).toHaveBeenCalled();
    });

    it('should handle brand assets parameter', async () => {
        const brandAssets = ['/path/to/existing/logo.png'];
        
        await design_image(
            'primary_logo', 
            'Updated company logo',
            false,
            brandAssets
        );

        // Should complete without errors when brand assets are provided
        expect(true).toBe(true);
    });
});

describe('getDesignImageTools', () => {
    it('should return tool function definitions', () => {
        const tools = getDesignImageTools();
        
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(0);
        
        const designTool = tools[0];
        expect(designTool).toHaveProperty('name');
        expect(designTool).toHaveProperty('description');
        expect(designTool).toHaveProperty('parameters');
        expect(designTool).toHaveProperty('handler');
    });

    it('should have correct parameter schema', () => {
        const tools = getDesignImageTools();
        const designTool = tools[0];
        
        expect(designTool.parameters).toHaveProperty('type', 'object');
        expect(designTool.parameters).toHaveProperty('properties');
        expect(designTool.parameters.properties).toHaveProperty('type');
        expect(designTool.parameters.properties).toHaveProperty('prompt');
    });
});