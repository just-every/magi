/**
 * Tests for manager search functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { manager_search, createNumberedGrid, smart_manager_raw } from '../manager-search.js';
import type { ManagerSearchResult } from '../constants.js';

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

describe('manager_search', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should search dribbble successfully', async () => {
        const result = await manager_search('dribbble', 'tech logo', 5);
        
        expect(result).toBeDefined();
        const parsed = JSON.parse(result) as ManagerSearchResult[];
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBeGreaterThan(0);
        expect(parsed.length).toBeLessThanOrEqual(5);
    });

    it('should return properly formatted manager search results', async () => {
        const result = await manager_search('web_search', 'logo manager', 3);
        const parsed = JSON.parse(result) as ManagerSearchResult[];
        
        parsed.forEach(item => {
            expect(item).toHaveProperty('url');
            expect(item).toHaveProperty('title');
            expect(typeof item.url).toBe('string');
            expect(typeof item.title).toBe('string');
        });
    });

    it('should limit results correctly', async () => {
        const limit = 2;
        const result = await manager_search('dribbble', 'manager', limit);
        const parsed = JSON.parse(result) as ManagerSearchResult[];
        
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

describe('smart_manager_raw', () => {
    it('should process multiple search configurations', async () => {
        const searchConfigs = [
            { engine: 'dribbble' as const, query: 'logo manager', limit: 3 },
            { engine: 'behance' as const, query: 'brand identity', limit: 2 }
        ];

        const results = await smart_manager_raw('Test context', searchConfigs, 3, 'primary_logo');
        
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for empty configurations', async () => {
        const results = await smart_manager_raw('Test context', [], 5, 'primary_logo');
        
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(0);
    });
});