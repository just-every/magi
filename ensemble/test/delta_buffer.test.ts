import { describe, it, expect } from 'vitest';
import { DeltaBuffer } from '../utils/delta_buffer.js';

describe.skip('DeltaBuffer - Legacy Tests (needs update)', () => {
    it('should accumulate text deltas', () => {
        const buffer = new DeltaBuffer();
        
        buffer.append('Hello');
        expect(buffer.getContent()).toBe('Hello');
        
        buffer.append(' ');
        expect(buffer.getContent()).toBe('Hello ');
        
        buffer.append('World');
        expect(buffer.getContent()).toBe('Hello World');
    });

    it('should handle empty appends', () => {
        const buffer = new DeltaBuffer();
        
        buffer.append('');
        expect(buffer.getContent()).toBe('');
        
        buffer.append('Test');
        buffer.append('');
        expect(buffer.getContent()).toBe('Test');
    });

    it('should handle null/undefined gracefully', () => {
        const buffer = new DeltaBuffer();
        
        buffer.append(null as any);
        expect(buffer.getContent()).toBe('');
        
        buffer.append(undefined as any);
        expect(buffer.getContent()).toBe('');
        
        buffer.append('Valid');
        expect(buffer.getContent()).toBe('Valid');
    });

    it('should clear content', () => {
        const buffer = new DeltaBuffer();
        
        buffer.append('Some content');
        expect(buffer.getContent()).toBe('Some content');
        
        buffer.clear();
        expect(buffer.getContent()).toBe('');
        
        buffer.append('New content');
        expect(buffer.getContent()).toBe('New content');
    });

    it('should handle special characters', () => {
        const buffer = new DeltaBuffer();
        
        buffer.append('Line 1\n');
        buffer.append('Line 2\t');
        buffer.append('Special: 🎉');
        
        expect(buffer.getContent()).toBe('Line 1\nLine 2\tSpecial: 🎉');
    });

    it('should handle large content', () => {
        const buffer = new DeltaBuffer();
        const largeText = 'x'.repeat(10000);
        
        buffer.append(largeText);
        expect(buffer.getContent()).toBe(largeText);
        expect(buffer.getContent().length).toBe(10000);
    });

    it('should maintain content after multiple operations', () => {
        const buffer = new DeltaBuffer();
        
        // Build a sentence word by word
        const words = ['The', ' quick', ' brown', ' fox'];
        words.forEach(word => buffer.append(word));
        
        expect(buffer.getContent()).toBe('The quick brown fox');
        
        // Clear and rebuild
        buffer.clear();
        buffer.append('New sentence');
        expect(buffer.getContent()).toBe('New sentence');
    });

    it('should handle rapid sequential appends', () => {
        const buffer = new DeltaBuffer();
        const parts: string[] = [];
        
        // Simulate streaming text
        for (let i = 0; i < 100; i++) {
            const part = `Part${i} `;
            parts.push(part);
            buffer.append(part);
        }
        
        expect(buffer.getContent()).toBe(parts.join(''));
    });
});