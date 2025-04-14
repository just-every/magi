/**
 * Mock browser session for testing purposes (TypeScript version)
 */
import { vi } from 'vitest';

// Define the type for the mock session based on observed methods in tests
// Note: This might need refinement if the actual AgentBrowserSession has more methods
interface MockAgentBrowserSession {
  initialize: ReturnType<typeof vi.fn>;
  listOpenTabs: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  get_page_content: ReturnType<typeof vi.fn>;
  get_page_url: ReturnType<typeof vi.fn>;
  screenshot: ReturnType<typeof vi.fn>;
  js_evaluate: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
  press: ReturnType<typeof vi.fn>;
  focusTab: ReturnType<typeof vi.fn>;
  interactElement: ReturnType<typeof vi.fn>;
  switchTab: ReturnType<typeof vi.fn>;
  closeSession: ReturnType<typeof vi.fn>;
  clickElement: ReturnType<typeof vi.fn>;
  fillField: ReturnType<typeof vi.fn>;
  checkElement: ReturnType<typeof vi.fn>;
  hoverElement: ReturnType<typeof vi.fn>;
  focusElement: ReturnType<typeof vi.fn>;
  scrollElement: ReturnType<typeof vi.fn>;
  selectOption: ReturnType<typeof vi.fn>;
}

// Mock session object
export const mockSession: MockAgentBrowserSession = {
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

// Create the mock for getAgentBrowserSession
// This function will be automatically used by Vitest when ./browser_session is imported
export const getAgentBrowserSession = vi.fn().mockReturnValue(mockSession);

// Mock the class constructor as well if needed
export const AgentBrowserSession = vi.fn().mockImplementation(() => mockSession);

// Default export might not be strictly necessary with auto-mocking, but can be included
export default {
  getAgentBrowserSession,
  AgentBrowserSession,
  mockSession
};
