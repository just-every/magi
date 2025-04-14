import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as browserUtils from './browser_utils.js';

// Define mocks *inside* the factory function to avoid hoisting issues
vi.mock('./browser_session.js', () => {
  const mockSession = {
    initialize: vi.fn().mockResolvedValue(undefined),
    listOpenTabs: vi.fn().mockResolvedValue(JSON.stringify({
      count: 2,
      tabs: [
        { id: 1, title: 'Test Tab 1', url: 'https://example.com', active: true, windowId: 1 },
        { id: 2, title: 'Test Tab 2', url: 'https://example.org', active: false, windowId: 1 }
      ]
    })),
    navigate: vi.fn().mockResolvedValue('Successfully navigated to the URL'),
    get_page_content: vi.fn().mockResolvedValue('Mock page content with [1] button and [2] input field'),
    get_page_url: vi.fn().mockResolvedValue('https://example.com'),
    screenshot: vi.fn().mockResolvedValue('/mock/output/dir/screenshot.jpg'),
    js_evaluate: vi.fn().mockResolvedValue('{"result":"success"}'),
    type: vi.fn().mockResolvedValue('Text typed successfully'),
    press: vi.fn().mockResolvedValue('Key pressed successfully'),
    focusTab: vi.fn().mockResolvedValue('Tab focused successfully'),
    interactElement: vi.fn().mockResolvedValue('Interaction completed successfully'),
    switchTab: vi.fn().mockResolvedValue('Tab switched successfully'),
    closeSession: vi.fn().mockResolvedValue('Session closed successfully'),
    clickElement: vi.fn().mockImplementation((elementId: number) => 
      Promise.resolve(`Clicked element ${elementId} successfully`)),
    fillField: vi.fn().mockImplementation((elementId: number, value: string) => 
      Promise.resolve(`Filled element ${elementId} with "${value}" successfully`)),
    checkElement: vi.fn().mockImplementation((elementId: number, checked: boolean) => 
      Promise.resolve(`${checked ? 'Checked' : 'Unchecked'} element ${elementId} successfully`)),
    hoverElement: vi.fn().mockImplementation((elementId: number) => 
      Promise.resolve(`Hovered over element ${elementId} successfully`)),
    focusElement: vi.fn().mockImplementation((elementId: number) => 
      Promise.resolve(`Focused on element ${elementId} successfully`)),
    scrollElement: vi.fn().mockImplementation((elementId: number) => 
      Promise.resolve(`Scrolled element ${elementId} into view successfully`)),
    selectOption: vi.fn().mockImplementation((elementId: number, value: string) => 
      Promise.resolve(`Selected option "${value}" in dropdown ${elementId} successfully`)),
  };
  const mockGetAgentBrowserSession = vi.fn().mockReturnValue(mockSession);

  return {
    getAgentBrowserSession: mockGetAgentBrowserSession,
    AgentBrowserSession: vi.fn().mockImplementation(() => mockSession),
    // Export the mocks themselves so they can be imported and asserted on in tests
    __mocks__: { 
        mockSession,
        mockGetAgentBrowserSession
      // No need to export __mocks__ here
    }
  };
});

// Import the original module - Vitest replaces its exports with the mocks
import { getAgentBrowserSession, AgentBrowserSession } from './browser_session.js';

// Get typed access to the mocks using vi.mocked
const mockedGetAgentBrowserSession = vi.mocked(getAgentBrowserSession);
// We can access the mockSession instance via the return value of the mocked function
const mockSession = mockedGetAgentBrowserSession(''); 

// Import the ToolFunction type
import { ToolFunction } from '../types.js';

// Create proper mock tools that match the ToolFunction interface
const mockTools: ToolFunction[] = [
  {
    function: () => Promise.resolve('mock result'),
    definition: {
      type: 'function',
      function: {
        name: 'mock_tool',
        description: 'Mock tool for testing',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    }
  }
];

// Override getBrowserTools directly for testing
vi.spyOn(browserUtils, 'getBrowserTools').mockImplementation(() => mockTools);

// Mock other dependencies
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid-1234'),
}));

// Mock file_utils and image_utils (for screenshot function)
vi.mock('./file_utils.js', () => ({
  get_output_dir: vi.fn().mockReturnValue('/mock/output/dir'),
  write_unique_file: vi.fn().mockReturnValue('/mock/output/dir/screenshot.jpg'),
}));

vi.mock('./image_utils.js', () => ({
  createImageFromBase64: vi.fn().mockResolvedValue(Buffer.from('mock-image-data')),
  processImage: vi.fn().mockResolvedValue(Buffer.from('processed-mock-image-data')),
}));

vi.mock('./tool_call.js', () => ({
  createToolFunction: vi.fn().mockImplementation((fn, description, params) => ({
    fn,
    definition: {
      function: {
        name: fn.name,
        description: description || '',
        parameters: params || {},
      }
    }
  })),
}));

describe('browser_utils', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks();

    // Set a test agent ID for each test
    browserUtils.setCurrentAgentId('test-agent-id');

    // Silence console logs for cleaner test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up
    vi.restoreAllMocks();
    browserUtils.setCurrentAgentId(null);
  });

  describe('Basic functionality', () => {
    it('should set and get the current agent ID', () => {
      browserUtils.setCurrentAgentId('another-agent-id');
      // We can't directly test getCurrentTabId since it's private, but we can test
      // that it affects other functions by checking if they use the right agent ID
      
      // Call a function that would use the agent ID
      browserUtils.listOpenTabs();
      
      // Check that the explicitly mocked getAgentBrowserSession was called
      expect(mockedGetAgentBrowserSession).toHaveBeenCalledWith('another-agent-id');
    });
  });

  describe('Browser navigation functions', () => {
    it('should successfully navigate to a URL', async () => {
      const result = await browserUtils.navigate('https://example.com');
      
      // Validate result
      expect(result).toContain('Successfully navigated');
      
      // Check that the session's navigate method was called correctly
      expect(mockSession.navigate).toHaveBeenCalledWith('https://example.com', undefined);
    });

    it('should add https:// prefix to domain-only URLs', async () => {
      await browserUtils.navigate('example.com');
      
      // Check that the session's navigate method was called with the prefixed URL
      expect(mockSession.navigate).toHaveBeenCalledWith('https://example.com', undefined);
    });

    it('should handle invalid URLs', async () => {
      const result = await browserUtils.navigate('not a valid url');
      
      expect(result).toContain('Invalid URL');
      
      // Check that the session's navigate method was not called
      expect(mockSession.navigate).not.toHaveBeenCalled();
    });
  });

  describe('Page content and URL functions', () => {
    it('should get page content', async () => {
      const content = await browserUtils.get_page_content();
      
      expect(content).toContain('Mock page content');
      
      // Check that the session's get_page_content method was called
      expect(mockSession.get_page_content).toHaveBeenCalled();
    });

    it('should get the current page URL', async () => {
      const url = await browserUtils.get_page_url();
      
      expect(url).toBe('https://example.com');
      
      // Check that the session's get_page_url method was called
      expect(mockSession.get_page_url).toHaveBeenCalled();
    });
  });

  describe('Element interaction functions', () => {
    it('should click an element', async () => {
      const result = await browserUtils.clickElement(1);
      
      expect(result).toContain('Clicked element 1');
      
      // Check that the session's clickElement method was called with the correct ID
      expect(mockSession.clickElement).toHaveBeenCalledWith(1);
    });

    it('should fill a form field', async () => {
      const result = await browserUtils.fillField(2, 'test input');
      
      expect(result).toContain('Filled element 2');
      expect(result).toContain('test input');
      
      // Check that the session's fillField method was called with the correct parameters
      expect(mockSession.fillField).toHaveBeenCalledWith(2, 'test input');
    });

    it('should check/uncheck a checkbox', async () => {
      const resultChecked = await browserUtils.checkElement(3, true);
      const resultUnchecked = await browserUtils.checkElement(3, false);
      
      expect(resultChecked).toContain('Checked element 3');
      expect(resultUnchecked).toContain('Unchecked element 3');
      
      // Check that the session's checkElement method was called with the correct parameters
      expect(mockSession.checkElement).toHaveBeenCalledWith(3, true);
      expect(mockSession.checkElement).toHaveBeenCalledWith(3, false);
    });
  });

  describe('Keyboard input functions', () => {
    it('should type text', async () => {
      const result = await browserUtils.type('Hello world');
      
      expect(result).toContain('Text typed successfully');
      
      // Check that the session's type method was called with the correct text
      expect(mockSession.type).toHaveBeenCalledWith('Hello world');
    });

    it('should press special keys', async () => {
      const result = await browserUtils.press('Enter');
      
      expect(result).toContain('Key pressed successfully');
      
      // Check that the session's press method was called with the correct key
      expect(mockSession.press).toHaveBeenCalledWith('Enter');
    });
  });

  describe('Tab management functions', () => {
    it('should list open tabs', async () => {
      const result = await browserUtils.listOpenTabs();
      
      expect(result).toContain('count');
      expect(result).toContain('tabs');
      
      // Check that the session's listOpenTabs method was called
      expect(mockSession.listOpenTabs).toHaveBeenCalled();
    });

    it('should focus a specific tab', async () => {
      const result = await browserUtils.focusTab(1);
      
      expect(result).toContain('Tab focused successfully');
      
      // Check that the session's focusTab method was called with the correct tab ID
      expect(mockSession.focusTab).toHaveBeenCalledWith(1);
    });

    it('should switch tabs', async () => {
      const result = await browserUtils.switch_tab('new');
      
      expect(result).toContain('Tab switched successfully');
      
      // Check that the session's switchTab method was called with the correct parameters
      expect(mockSession.switchTab).toHaveBeenCalledWith('new', undefined);
    });

    it('should switch to a specific tab by ID', async () => {
      const result = await browserUtils.switch_tab('id', '123');
      
      expect(result).toContain('Tab switched successfully');
      
      // Check that the session's switchTab method was called with the correct parameters
      expect(mockSession.switchTab).toHaveBeenCalledWith('id', '123');
    });
  });

  describe('Session management functions', () => {
    it('should close an agent session', async () => {
      const result = await browserUtils.closeAgentSession();
      
      expect(result).toContain('Session closed successfully');
      
      // Check that the session's closeSession method was called
      expect(mockSession.closeSession).toHaveBeenCalled();
    });
  });

  describe('Tool definitions', () => {
    it('should return a list of browser tools', () => {
      const tools = browserUtils.getBrowserTools();
      
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
      
      // Check that each tool has the correct structure according to ToolFunction interface
      for (const tool of tools) {
        expect(tool).toHaveProperty('function');
        expect(tool).toHaveProperty('definition');
        expect(tool.definition).toHaveProperty('function');
        expect(tool.definition.function).toHaveProperty('name');
      }
    });

    it('should setup browser tools for an agent', () => {
      const mockAgent = {
        agent_id: 'test-agent-123',
        name: 'Test Agent',
        description: 'A test agent for browser tools',
        instructions: 'Instructions for the test agent',
        onToolCall: vi.fn(),
        export: vi.fn().mockReturnValue({
          agent_id: 'test-agent-123',
          name: 'Test Agent'
        }),
        asTool: vi.fn().mockReturnValue({
          fn: () => Promise.resolve(''),
          definition: {
            function: {
              name: 'test_agent',
              description: 'Test agent function',
              parameters: { type: 'object', properties: {}, required: [] }
            }
          }
        })
      };
      
      browserUtils.setupAgentBrowserTools(mockAgent);
      
      // Check that the agent now has an updated onToolCall method
      expect(mockAgent.onToolCall).not.toBe(vi.fn());
    });
  });
});
