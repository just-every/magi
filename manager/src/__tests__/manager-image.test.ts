/**
 * Tests for manager image generation functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { manager_image, getManagerImageTools } from '../manager-image.js';

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

vi.mock('../interfaces/mech.js', () => ({
    quick_llm_call: vi.fn().mockResolvedValue(JSON.stringify({
        run_id: 'test_run',
        context: 'Test manager context',
        aspect: 'square',
        background: 'transparent',
        inspiration_search: [],
        inspiration_judge: 'Test judge criteria',
        manager_prompts: {
            draft: ['Draft prompt 1', 'Draft prompt 2', 'Draft prompt 3'],
            medium: 'Medium prompt',
            high: 'High prompt'
        },
        manager_judge: {
            draft: 'Draft judge criteria',
            medium: 'Medium judge criteria', 
            high: 'High judge criteria'
        }
    })),
    Agent: vi.fn(),
    runMECH: vi.fn(),
    runMECHStreaming: vi.fn()
}));

vi.mock('../manager-search.js', () => ({
    smart_manager_raw: vi.fn().mockResolvedValue([]),
    createNumberedGrid: vi.fn().mockResolvedValue('data:image/png;base64,mockGridData'),
    selectBestFromGrid: vi.fn().mockResolvedValue([1, 2])
}));

vi.mock('../utils/grid-judge.js', () => ({
    judgeImageSet: vi.fn().mockResolvedValue(['mock-image-1.png'])
}));

vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn()
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn()
}));

describe('manager_image', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should generate a manager image successfully', async () => {
        const result = await manager_image(
            'primary_logo',
            'A modern tech startup logo',
            false, // Skip inspiration to simplify test
            []
        );

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
    });

    it('should use the correct manager specifications', async () => {
        await manager_image(
            'primary_logo',
            'A minimalist logo manager',
            false,
            []
        );

        // Verify that the manager spec was requested
        const { quick_llm_call } = await import('@just-every/mech');
        expect(quick_llm_call).toHaveBeenCalled();
    });

    it('should handle brand assets parameter', async () => {
        const brandAssets = ['/path/to/existing/logo.png'];
        
        await manager_image(
            'primary_logo', 
            'Updated company logo',
            false,
            brandAssets
        );

        // Should complete without errors when brand assets are provided
        expect(true).toBe(true);
    });
});

describe('getManagerImageTools', () => {
    it('should return tool function definitions', () => {
        const tools = getManagerImageTools();
        
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(0);
        
        const managerTool = tools[0];
        expect(managerTool).toHaveProperty('name');
        expect(managerTool).toHaveProperty('description');
        expect(managerTool).toHaveProperty('parameters');
        expect(managerTool).toHaveProperty('handler');
    });

    it('should have correct parameter schema', () => {
        const tools = getManagerImageTools();
        const managerTool = tools[0];
        
        expect(managerTool.parameters).toHaveProperty('type', 'object');
        expect(managerTool.parameters).toHaveProperty('properties');
        expect(managerTool.parameters.properties).toHaveProperty('type');
        expect(managerTool.parameters.properties).toHaveProperty('prompt');
    });
});