/**
 * Tests for design search functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { design_search, createNumberedGrid, smart_design_raw } from '../design-search.js';
import type { DesignSearchResult } from '../constants.js';

// Mock dependencies
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        readFileSync: vi.fn()
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn()
}));

vi.mock('@napi-rs/canvas', () => ({
    createCanvas: vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue({
            fillStyle: '',
            fillRect: vi.fn(),
            font: '',
            textAlign: '',
            fillText: vi.fn(),
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
            drawImage: vi.fn()
        }),
        width: 400,
        height: 300,
        toBuffer: vi.fn().mockReturnValue(Buffer.from('mock-image-data'))
    }),
    loadImage: vi.fn().mockResolvedValue({
        width: 200,
        height: 150
    })
}));

describe('design_search', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should search dribbble successfully', async () => {
        const result = await design_search('dribbble', 'tech logo', 5);
        
        expect(result).toBeDefined();
        const parsed = JSON.parse(result) as DesignSearchResult[];
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBeGreaterThan(0);
        expect(parsed.length).toBeLessThanOrEqual(5);
    });

    it('should return properly formatted design search results', async () => {
        const result = await design_search('web_search', 'logo design', 3);
        const parsed = JSON.parse(result) as DesignSearchResult[];
        
        parsed.forEach(item => {
            expect(item).toHaveProperty('url');
            expect(item).toHaveProperty('title');
            expect(typeof item.url).toBe('string');
            expect(typeof item.title).toBe('string');
        });
    });

    it('should limit results correctly', async () => {
        const limit = 2;
        const result = await design_search('dribbble', 'design', limit);
        const parsed = JSON.parse(result) as DesignSearchResult[];
        
        expect(parsed.length).toBeLessThanOrEqual(limit);
    });
});

describe('createNumberedGrid', () => {
    it('should create a grid from image sources', async () => {
        const imagesSources = [
            { url: 'http://example.com/image1.png', title: 'Image 1' },
            { url: 'http://example.com/image2.png', title: 'Image 2' },
            { dataUrl: 'data:image/png;base64,mockData', title: 'Image 3' }
        ];

        const result = await createNumberedGrid(imagesSources, 'test-grid');
        
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('should handle different aspect ratios', async () => {
        const imagesSources = [
            { url: 'http://example.com/image1.png' }
        ];

        const landscapeResult = await createNumberedGrid(imagesSources, 'landscape-test', 'landscape');
        const portraitResult = await createNumberedGrid(imagesSources, 'portrait-test', 'portrait');
        
        expect(landscapeResult).toBeDefined();
        expect(portraitResult).toBeDefined();
    });
});

describe('smart_design_raw', () => {
    it('should process multiple search configurations', async () => {
        const searchConfigs = [
            { engine: 'dribbble' as const, query: 'logo design', limit: 3 },
            { engine: 'behance' as const, query: 'brand identity', limit: 2 }
        ];

        const results = await smart_design_raw('Test context', searchConfigs, 3, 'primary_logo');
        
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for empty configurations', async () => {
        const results = await smart_design_raw('Test context', [], 5, 'primary_logo');
        
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(0);
    });
});