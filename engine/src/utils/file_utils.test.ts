import { describe, it, expect } from 'vitest';
import { truncateLargeValues } from './file_utils.js';

// Test long string truncation

describe('truncateLargeValues', () => {
    it('truncates long strings over 2000 characters', () => {
        const longStr = 'x'.repeat(2100);
        const result = truncateLargeValues(longStr);
        expect(result.length).toBeLessThan(longStr.length);
        expect(result).toContain('[100 characters removed]');
        expect(result.startsWith(longStr.slice(0, 1000))).toBe(true);
        expect(result.endsWith(longStr.slice(-1000))).toBe(true);
    });

    it('truncates base64 image data strings', () => {
        const prefix = 'data:image/png;base64,';
        const base64 = prefix + 'A'.repeat(200);
        const result = truncateLargeValues(base64);
        expect(result.startsWith(prefix)).toBe(true);
        expect(result.length).toBeLessThan(base64.length);
        expect(result).toContain('characters removed');
    });
});
