import { describe, it, expect, beforeEach } from 'vitest';
import {
    createDefaultHistory,
    defaultDateFormat,
    defaultReadableTime,
    defaultCreateToolFunction,
    createDefaultCommunicationManager,
    defaultDescribeHistory,
    defaultFormatMemories,
    createFullContext
} from '../utils/internal_utils.js';

describe('Internal Utils', () => {
    describe('Default History', () => {
        it('should manage history items', () => {
            const history = createDefaultHistory();
            
            expect(history.getHistory()).toEqual([]);
            
            history.addHistory({ type: 'message', role: 'user', content: 'Hello' });
            history.addHistory({ type: 'message', role: 'assistant', content: 'Hi there!' });
            
            expect(history.getHistory()).toHaveLength(2);
            expect(history.getHistory()[0]).toEqual({
                type: 'message',
                role: 'user',
                content: 'Hello'
            });
        });

        it('should clear history', () => {
            const history = createDefaultHistory();
            
            history.addHistory({ type: 'message', role: 'user', content: 'Test' });
            expect(history.getHistory()).toHaveLength(1);
            
            history.clearHistory();
            expect(history.getHistory()).toEqual([]);
        });
    });

    describe('Date formatting', () => {
        it('should format date as ISO string', () => {
            const formatted = defaultDateFormat();
            expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            
            // Should be parseable
            const date = new Date(formatted);
            expect(date.getTime()).not.toBeNaN();
        });
    });

    describe('Readable time', () => {
        it('should format milliseconds to readable time', () => {
            expect(defaultReadableTime(500)).toBe('0s');
            expect(defaultReadableTime(1500)).toBe('1s');
            expect(defaultReadableTime(65000)).toBe('1m 5s');
            expect(defaultReadableTime(3665000)).toBe('1h 1m');
            expect(defaultReadableTime(90000000)).toBe('1d 1h');
        });

        it('should handle edge cases', () => {
            expect(defaultReadableTime(0)).toBe('0s');
            expect(defaultReadableTime(999)).toBe('0s');
            expect(defaultReadableTime(1000)).toBe('1s');
            expect(defaultReadableTime(59999)).toBe('59s');
            expect(defaultReadableTime(60000)).toBe('1m 0s');
        });
    });

    describe('Tool function creation', () => {
        it('should create a valid tool function', async () => {
            const mockFn = (x: number, y: number) => x + y;
            mockFn.name = 'add'; // Set function name
            
            const tool = defaultCreateToolFunction(
                mockFn,
                'Add two numbers',
                { x: 'First number', y: 'Second number' }
            );
            
            expect(tool.definition.type).toBe('function');
            expect(tool.definition.function.name).toBe('add');
            expect(tool.definition.function.description).toBe('Add two numbers');
            expect(tool.definition.function.parameters.properties).toEqual({
                x: { description: 'First number' },
                y: { description: 'Second number' }
            });
            
            // Test execution
            const result = await tool.function(5, 3);
            expect(result).toBe('8');
        });

        it('should handle functions returning non-strings', async () => {
            const tool = defaultCreateToolFunction(
                () => ({ key: 'value', num: 42 }),
                'Return object'
            );
            
            const result = await tool.function();
            expect(result).toBe('{"key":"value","num":42}');
        });

        it('should handle anonymous functions', () => {
            const tool = defaultCreateToolFunction(
                () => 'test',
                'Anonymous function'
            );
            
            expect(tool.definition.function.name).toBe('anonymous');
        });

        it('should handle complex parameter types', () => {
            const tool = defaultCreateToolFunction(
                () => {},
                'Complex params',
                {
                    simple: 'A string param',
                    complex: { description: 'Complex param', type: 'number' },
                    nullParam: null,
                    numParam: 123
                }
            );
            
            const props = tool.definition.function.parameters.properties;
            expect(props.simple).toEqual({ description: 'A string param' });
            expect(props.complex).toEqual({ description: 'Complex param', type: 'number' });
            expect(props.nullParam).toEqual({ description: 'null' });
            expect(props.numParam).toEqual({ description: '123' });
        });
    });

    describe('Communication Manager', () => {
        it('should create a working comm manager', () => {
            const comm = createDefaultCommunicationManager();
            
            expect(comm.isClosed()).toBe(false);
            
            // Should not throw
            comm.send({ type: 'test', data: 'message' });
            
            comm.close();
            expect(comm.isClosed()).toBe(true);
        });
    });

    describe('Memory formatting', () => {
        it('should format memories as bullet list', () => {
            const memories = [
                { text: 'First memory' },
                { text: 'Second memory', metadata: { tag: 'important' } },
                { text: 'Third memory' }
            ];
            
            const formatted = defaultFormatMemories(memories);
            expect(formatted).toBe('- First memory\n- Second memory\n- Third memory');
        });

        it('should handle empty memories', () => {
            expect(defaultFormatMemories([])).toBe('');
        });
    });

    describe('createFullContext', () => {
        it('should create a complete context from simple options', () => {
            const mockLLM = async () => ({ response: 'test', tool_calls: [] });
            const mockEmbed = async (text: string) => [1, 2, 3];
            const mockLookup = async () => [{ text: 'memory' }];
            const mockSave = async () => {};
            
            const context = createFullContext({
                runAgent: mockLLM,
                onHistory: () => {},
                onStatus: () => {},
                embed: mockEmbed,
                lookupMemories: mockLookup,
                saveMemory: mockSave
            });
            
            // Check required functions exist
            expect(context.sendComms).toBeDefined();
            expect(context.getCommunicationManager).toBeDefined();
            expect(context.addHistory).toBeDefined();
            expect(context.getHistory).toBeDefined();
            expect(context.processPendingHistoryThreads).toBeDefined();
            expect(context.describeHistory).toBeDefined();
            expect(context.costTracker).toBeDefined();
            expect(context.runStreamedWithTools).toBeDefined();
            
            // Check optional functions
            expect(context.createToolFunction).toBeDefined();
            expect(context.dateFormat).toBeDefined();
            expect(context.readableTime).toBeDefined();
            expect(context.MAGI_CONTEXT).toBe('MECH System Context');
            
            // Check memory functions
            expect(context.embed).toBe(mockEmbed);
            expect(context.lookupMemoriesEmbedding).toBe(mockLookup);
            expect(context.insertMemories).toBe(mockSave);
            expect(context.formatMemories).toBeDefined();
        });

        it('should work with minimal options', () => {
            const context = createFullContext({
                runAgent: async () => ({ response: 'test', tool_calls: [] })
            });
            
            // Should have all required functions
            expect(context.sendComms).toBeDefined();
            expect(context.runStreamedWithTools).toBeDefined();
            
            // Memory functions should be undefined
            expect(context.embed).toBeUndefined();
            expect(context.lookupMemoriesEmbedding).toBeUndefined();
            expect(context.insertMemories).toBeUndefined();
        });

        it('should handle callbacks properly', () => {
            let historyCallbackCalled = false;
            let statusCallbackCalled = false;
            
            const context = createFullContext({
                runAgent: async () => ({ response: 'test', tool_calls: [] }),
                onHistory: () => { historyCallbackCalled = true; },
                onStatus: () => { statusCallbackCalled = true; }
            });
            
            // Test history callback
            context.addHistory({ type: 'message', role: 'user', content: 'test' });
            expect(historyCallbackCalled).toBe(true);
            
            // Test status callback
            context.sendComms({ type: 'status', message: 'test' });
            expect(statusCallbackCalled).toBe(true);
        });
    });
});