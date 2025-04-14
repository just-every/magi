/**
 * Type definitions for the MAGI browser extension.
 */

// State type for agent tabs
export interface AgentTabInfo {
  chromeTabId: number;
  lastActive: number; // timestamp
  groupId?: number;
}

// Response type for structured messaging
export interface ResponseMessage {
  status: 'ok' | 'error';
  result?: any;
  error?: string;
  details?: string;
  tabId?: string;
}

// Element info from DOM processing
export interface ElementInfo {
  id: number;
  tagName: string;
  description: string;
  selector: string;
  isInteractive: boolean;
  isVisible: boolean;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  childElements?: Array<{
    description: string;
    tagName: string;
    isVisible: boolean;
  }>;
}

// DOM processing options
export interface DomProcessingOptions {
  includeAllContent?: boolean;
}

// DOM processing result
export interface DomProcessingResult {
  simplifiedText: string;
  idMapArray: [number, ElementInfo][];
  warnings: string[];
}

// Error result for DOM processing
export interface DomProcessingError {
  error: boolean;
  message: string;
  stack?: string;
}

// Command parameter types
export interface NavigateParams {
  url: string;
  takeFocus?: boolean;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
}

export interface GetPageContentParams {
  allContent?: boolean;
}

export interface ScreenshotParams {
  type?: 'viewport' | 'page' | 'element';
  elementId?: number;
  preserveFocus?: boolean;
}

export interface JsEvaluateParams {
  code: string;
}

export interface TypeParams {
  text: string;
}

export interface PressParams {
  keys: string;
}

export interface InteractElementParams {
  elementId: number;
  action: 'click' | 'fill' | 'check' | 'hover' | 'focus' | 'scroll' | 'select_option';
  value?: string;
  checked?: boolean;
}

export interface SwitchTabParams {
  type: 'active' | 'new' | 'id';
  tabId?: string;
}

export interface FocusTabParams {
  chromeTabId: number;
}

// Native message types
export interface NativeMessage {
  requestId: number;
  command: string;
  params?: any;
  tabId?: string;
}

// Map from command to parameter type
export interface CommandParamMap {
  'initialize_agent': Record<string, never>;
  'list_open_tabs': Record<string, never>;
  'focus_tab': FocusTabParams;
  'navigate': NavigateParams;
  'get_page_content': GetPageContentParams;
  'get_url': Record<string, never>;
  'screenshot': ScreenshotParams;
  'js_evaluate': JsEvaluateParams;
  'type': TypeParams;
  'press': PressParams;
  'interact_element': InteractElementParams;
  'switch_tab': SwitchTabParams;
  'close_agent_session': Record<string, never>;
}

// Command handler function type
export type CommandHandler<T extends keyof CommandParamMap> = 
  (tabId: string, params: CommandParamMap[T]) => Promise<ResponseMessage>;
