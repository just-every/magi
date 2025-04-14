import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getProviderFromModel, getModelProvider, getModelFromClass } from './model_provider.js';
import { openaiProvider } from './openai.js';
import { claudeProvider } from './claude.js';
import { geminiProvider } from './gemini.js';
import { grokProvider } from './grok.js';
import { deepSeekProvider } from './deepseek.js';
import { testProvider } from './test_provider.js';
import { openRouterProvider, OpenRouterProvider } from './openrouter.js';
import { MODEL_CLASSES, ModelClassID, ModelProviderID } from './model_data.js';
import { setupFileMocks, setupModelProviderTestEnv } from '../utils/test_mocks.js';

// Save the original process.env
const originalEnv = { ...process.env };

// Mock file system operations
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    statSync: vi.fn().mockReturnValue({
      isDirectory: () => true
    }),
    readdirSync: vi.fn().mockReturnValue([]),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    dirname: vi.fn(),
    extname: vi.fn(),
    basename: vi.fn(),
  },
}));

// Mock all external modules
vi.mock('../utils/quota_manager.js', async () => {
  const mockedQuotaManager = {
    hasQuota: vi.fn().mockReturnValue(true),
  };
  
  return {
    quotaManager: mockedQuotaManager,
  };
});

// Mock file_utils
vi.mock('../utils/file_utils.js', () => ({
  set_file_test_mode: vi.fn(),
  get_output_dir: vi.fn().mockReturnValue('/mock/output/dir'),
  log_llm_request: vi.fn(),
}));

// Mock cost_tracker
vi.mock('../utils/cost_tracker.js', () => ({
  costTracker: {
    addUsage: vi.fn(),
  },
}));

// Mock OpenAI providers
vi.mock('./openai.js', () => ({
  openaiProvider: {
    createResponseStream: vi.fn().mockImplementation(async function*() {
      yield { type: 'message_delta', content: 'Hello', message_id: 'msg1', order: 0 };
      yield { type: 'message_complete', content: 'Hello world', message_id: 'msg1' };
    }),
  },
}));

// Mock Claude provider
vi.mock('./claude.js', () => ({
  claudeProvider: {
    createResponseStream: vi.fn().mockImplementation(async function*() {
      yield { type: 'message_delta', content: 'Hello', message_id: 'msg1', order: 0 };
      yield { type: 'message_complete', content: 'Hello world', message_id: 'msg1' };
    }),
  },
}));

// Mock Claude Code provider
vi.mock('./claude_code.js', () => ({
  claudeCodeProvider: {
    createResponseStream: vi.fn().mockImplementation(async function*() {
      yield { type: 'message_delta', content: 'Hello', message_id: 'msg1', order: 0 };
      yield { type: 'message_complete', content: 'Hello world', message_id: 'msg1' };
    }),
  },
}));

// Mock Gemini provider
vi.mock('./gemini.js', () => ({
  geminiProvider: {
    createResponseStream: vi.fn().mockImplementation(async function*() {
      yield { type: 'message_delta', content: 'Hello', message_id: 'msg1', order: 0 };
      yield { type: 'message_complete', content: 'Hello world', message_id: 'msg1' };
    }),
  },
}));

// Mock Grok provider
vi.mock('./grok.js', () => ({
  grokProvider: {
    createResponseStream: vi.fn().mockImplementation(async function*() {
      yield { type: 'message_delta', content: 'Hello', message_id: 'msg1', order: 0 };
      yield { type: 'message_complete', content: 'Hello world', message_id: 'msg1' };
    }),
  },
}));

// Mock DeepSeek provider
vi.mock('./deepseek.js', () => ({
  deepSeekProvider: {
    createResponseStream: vi.fn().mockImplementation(async function*() {
      yield { type: 'message_delta', content: 'Hello', message_id: 'msg1', order: 0 };
      yield { type: 'message_complete', content: 'Hello world', message_id: 'msg1' };
    }),
  },
}));

// Mock Test provider
vi.mock('./test_provider.js', () => ({
  testProvider: {
    createResponseStream: vi.fn().mockImplementation(async function*() {
      yield { type: 'message_delta', content: 'Hello', message_id: 'msg1', order: 0 };
      yield { type: 'message_complete', content: 'Hello world', message_id: 'msg1' };
    }),
  },
}));

// Mock OpenRouter provider
vi.mock('./openrouter.js', () => {
  const MockOpenRouterProvider = vi.fn().mockImplementation(() => ({
    createResponseStream: vi.fn().mockImplementation(async function*() {
      yield { type: 'message_delta', content: 'Hello', message_id: 'msg1', order: 0 };
      yield { type: 'message_complete', content: 'Hello world', message_id: 'msg1' };
    }),
  }));

  return {
    openRouterProvider: {
      createResponseStream: vi.fn().mockImplementation(async function*() {
        yield { type: 'message_delta', content: 'Hello', message_id: 'msg1', order: 0 };
        yield { type: 'message_complete', content: 'Hello world', message_id: 'msg1' };
      }),
    },
    OpenRouterProvider: MockOpenRouterProvider,
  };
});

describe('model_provider', () => {
  // Reset environment variables and mocks before each test
  beforeEach(() => {
    // Reset process.env to a known state
    process.env = { ...originalEnv };
    
    // Mock console methods to avoid cluttering test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // Restore environment variables and mocks after each test
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('getProviderFromModel', () => {
    it('should return openai for GPT models', () => {
      expect(getProviderFromModel('gpt-4o')).toBe('openai');
      expect(getProviderFromModel('gpt-3.5-turbo')).toBe('openai');
      expect(getProviderFromModel('o3-mini')).toBe('openai');
      expect(getProviderFromModel('computer-use-preview')).toBe('openai');
    });

    it('should return anthropic for Claude models', () => {
      expect(getProviderFromModel('claude-3-opus')).toBe('anthropic');
      expect(getProviderFromModel('claude-3-sonnet')).toBe('anthropic');
      expect(getProviderFromModel('claude-3-haiku')).toBe('anthropic');
    });

    it('should return google for Gemini models', () => {
      expect(getProviderFromModel('gemini-2.0-flash')).toBe('google');
      expect(getProviderFromModel('gemini-1.5-pro')).toBe('google');
    });

    it('should return xai for Grok models', () => {
      expect(getProviderFromModel('grok-3')).toBe('xai');
      expect(getProviderFromModel('grok-2-vision')).toBe('xai');
    });

    it('should return deepseek for DeepSeek models', () => {
      expect(getProviderFromModel('deepseek-chat')).toBe('deepseek');
      expect(getProviderFromModel('deepseek-reasoner')).toBe('deepseek');
    });

    it('should return openrouter for OpenRouter models', () => {
      expect(getProviderFromModel('openrouter/quasar-alpha')).toBe('openrouter');
    });

    it('should return test for test models', () => {
      expect(getProviderFromModel('test-standard')).toBe('test');
    });

    it('should throw an error for unknown model prefixes', () => {
      expect(() => getProviderFromModel('unknown-model')).toThrow('Unknown model prefix');
    });
  });

  describe('getModelProvider', () => {
    it('should return the openaiProvider for OpenAI models when API key is valid', () => {
      // Setup valid OpenAI API key
      process.env.OPENAI_API_KEY = 'sk-test123456';
      
      const provider = getModelProvider('gpt-4o');
      expect(provider).toBe(openaiProvider);
    });

    it('should return the claudeProvider for Claude models when API key is valid', () => {
      // Setup valid Anthropic API key
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test123456';
      
      const provider = getModelProvider('claude-3-opus');
      expect(provider).toBe(claudeProvider);
    });

    it('should return the geminiProvider for Gemini models when API key is valid', () => {
      // Setup valid Google API key
      process.env.GOOGLE_API_KEY = 'test-google-key';
      
      const provider = getModelProvider('gemini-2.0-flash');
      expect(provider).toBe(geminiProvider);
    });

    it('should return the openaiProvider when no model is specified', () => {
      const provider = getModelProvider();
      expect(provider).toBe(openaiProvider);
    });

    it('should return the testProvider for test models', () => {
      const provider = getModelProvider('test-standard');
      expect(provider).toBe(testProvider);
    });

    it('should return openaiProvider as default when no matching provider is found', () => {
      // This should trigger the console.warn fallback path
      const provider = getModelProvider('unknown-model-prefix-xyz');
      expect(provider).toBe(openaiProvider);
      expect(console.warn).toHaveBeenCalled();
    });

    it('should fall back to OpenRouter when direct provider API key is not available', () => {
      // Clear API keys for direct providers
      process.env.ANTHROPIC_API_KEY = '';
      // Set OpenRouter API key
      process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
      
      const provider = getModelProvider('claude-3-opus');
      
      // Should be an instance of OpenRouterProvider
      expect(provider).toBeInstanceOf(OpenRouterProvider);
    });
  });

  describe('getModelFromClass', () => {
    it('should return a model from the specified class when API key is valid', async () => {
      // Setup valid API keys
      process.env.OPENAI_API_KEY = 'sk-test123456';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test123456';
      process.env.GOOGLE_API_KEY = 'test-google-key';
      
      // Import the actual quota manager to mock
      const QuotaModule = await import('../utils/quota_manager.js');
      vi.mocked(QuotaModule.quotaManager.hasQuota).mockReturnValue(true);
      
      const model = await getModelFromClass('standard');
      
      // Model should be one of the standard class models
      expect(MODEL_CLASSES.standard.models).toContain(model);
    });

    it('should fall back to standard class when specified class is not found', async () => {
      // Setup valid API key for at least one model in standard class
      process.env.OPENAI_API_KEY = 'sk-test123456';
      
      // Import the actual quota manager to mock
      const QuotaModule = await import('../utils/quota_manager.js');
      vi.mocked(QuotaModule.quotaManager.hasQuota).mockReturnValue(true);
      
      // @ts-ignore - intentionally passing an invalid class
      const model = await getModelFromClass('invalid-class');
      
      // Model should be one of the standard class models
      expect(MODEL_CLASSES.standard.models).toContain(model);
    });

    it('should fall back to models without quota check when no models with quota are available', async () => {
      // Setup valid API key
      process.env.OPENAI_API_KEY = 'sk-test123456';
      
      // Import the actual quota manager to mock
      const QuotaModule = await import('../utils/quota_manager.js');
      // Mock hasQuota to return false to simulate no quota available
      vi.mocked(QuotaModule.quotaManager.hasQuota).mockReturnValue(false);
      
      const model = await getModelFromClass('standard');
      
      // Model should still be from the standard class despite quota issue
      expect(MODEL_CLASSES.standard.models).toContain(model);
    });

    it('should return default model when no API keys are valid', async () => {
      // Clear all API keys
      process.env.OPENAI_API_KEY = '';
      process.env.ANTHROPIC_API_KEY = '';
      process.env.GOOGLE_API_KEY = '';
      process.env.XAI_API_KEY = '';
      process.env.OPENROUTER_API_KEY = '';
      
      const model = await getModelFromClass('standard');
      
      // Should return the first model in the class as default
      expect(model).toBe(MODEL_CLASSES.standard.models[0]);
    });
  });
});
