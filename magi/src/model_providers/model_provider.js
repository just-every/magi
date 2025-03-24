"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModelFromClass = getModelFromClass;
exports.getModelProvider = getModelProvider;
const openai_js_1 = require("./openai.js");
const claude_js_1 = require("./claude.js");
const gemini_js_1 = require("./gemini.js");
const grok_js_1 = require("./grok.js");
const constants_js_1 = require("../magi_agents/constants.js");
const MODEL_PROVIDER_MAP = {
    'gpt-': openai_js_1.openaiProvider,
    'o3-': openai_js_1.openaiProvider,
    'computer-use-preview': openai_js_1.openaiProvider,
    'claude-': claude_js_1.claudeProvider,
    'gemini-': gemini_js_1.geminiProvider,
    'grok': grok_js_1.grokProvider,
    'grok-': grok_js_1.grokProvider,
};
function isProviderKeyValid(provider) {
    switch (provider) {
        case 'openai':
            return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-');
        case 'anthropic':
            return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-');
        case 'google':
            return !!process.env.GOOGLE_API_KEY;
        case 'xai':
            return !!process.env.XAI_API_KEY;
        default:
            return false;
    }
}
function getProviderFromModel(model) {
    if (model.startsWith('gpt-') || model.startsWith('o3-') || model.startsWith('computer-use-preview')) {
        return 'openai';
    }
    else if (model.startsWith('claude-')) {
        return 'anthropic';
    }
    else if (model.startsWith('gemini-')) {
        return 'google';
    }
    else if (model.startsWith('grok')) {
        return 'xai';
    }
    return 'unknown';
}
function getModelFromClass(modelClass) {
    const modelGroup = modelClass && constants_js_1.MODEL_GROUPS[modelClass] ? modelClass : 'standard';
    if (constants_js_1.MODEL_GROUPS[modelGroup]) {
        for (const model of constants_js_1.MODEL_GROUPS[modelGroup]) {
            const provider = getProviderFromModel(model);
            if (isProviderKeyValid(provider)) {
                return model;
            }
        }
    }
    if (modelGroup !== 'standard' && constants_js_1.MODEL_GROUPS['standard']) {
        for (const model of constants_js_1.MODEL_GROUPS['standard']) {
            const provider = getProviderFromModel(model);
            if (isProviderKeyValid(provider)) {
                return model;
            }
        }
    }
    const defaultModel = constants_js_1.MODEL_GROUPS[modelGroup]?.[0] || 'gpt-4o';
    console.log(`No valid API key found for any model in class ${modelGroup}, using default: ${defaultModel}`);
    return defaultModel;
}
function getModelProvider(model) {
    if (!model) {
        return openai_js_1.openaiProvider;
    }
    for (const [prefix, provider] of Object.entries(MODEL_PROVIDER_MAP)) {
        if (model.startsWith(prefix)) {
            return provider;
        }
    }
    console.warn(`No specific provider found for model "${model}", defaulting to OpenAI`);
    return openai_js_1.openaiProvider;
}
//# sourceMappingURL=model_provider.js.map