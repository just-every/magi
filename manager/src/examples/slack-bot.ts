#!/usr/bin/env node

import { config } from 'dotenv';
import { initializeSlackIntegration } from '../slack/index.js';

// Load environment variables
config();

// Explicitly set environment variables to ensure they're available to all packages
const envVars = {
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  XAI_API_KEY: process.env.XAI_API_KEY,
  BRAVE_API_KEY: process.env.BRAVE_API_KEY
};

// Force set them again to ensure they're available
Object.entries(envVars).forEach(([key, value]) => {
  if (value) {
    process.env[key] = value;
    console.log(`🔧 Explicitly set ${key}`);
  }
});

// Disable Gemini to avoid quota issues - ensemble will use other providers
console.log('🔧 Disabling Gemini due to quota exhaustion...');
delete process.env.GOOGLE_API_KEY;

// Debug: Check if all API keys are loaded
console.log('🔍 API Keys check:');
console.log(`  GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log('');

async function main() {
  console.log('🤖 Starting AI Manager Slack Bot...\n');

  // Check environment variables
  const botToken = process.env.SLACK_BOT_TOKEN;
  const defaultChannel = process.env.SLACK_DEFAULT_CHANNEL;
  const enableSocketMode = process.env.SLACK_ENABLE_SOCKET_MODE;
  
  console.log('🔍 Environment check:');
  console.log(`  SLACK_BOT_TOKEN: ${botToken ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SLACK_DEFAULT_CHANNEL: ${defaultChannel || 'general'}`);
  console.log(`  SLACK_ENABLE_SOCKET_MODE: ${enableSocketMode}`);
  console.log('');

  // Initialize Slack integration
  console.log('🚀 Initializing Slack integration...');
  const integration = await initializeSlackIntegration({
    enableTaskMessages: true,
    autoConnect: true
  });

  if (!integration) {
    console.error('❌ Failed to initialize Slack integration. Check your SLACK_BOT_TOKEN in .env');
    process.exit(1);
  }

  const slackManager = integration.getSlackManager();
  if (!slackManager) {
    console.error('❌ Slack manager not available');
    process.exit(1);
  }

  console.log('✅ Connected to Slack!');
  console.log('📢 Bot is now listening for design requests...\n');
  console.log('Try these commands in Slack:');
  console.log('  - "Generate a logo for TechStartup"');
  console.log('  - "Create a mockup for a fitness app"');
  console.log('  - "@yourbot help" for more info\n');

  // Send welcome message to default channel
  await slackManager.sendMessage(
    defaultChannel || 'general',
    `👋 AI Manager Bot is online! I can help you generate design assets.
    
Try asking me to:
• Generate logos
• Create mockups
• Design icons and banners
• Make color palettes
    
Just describe what you need and I'll create it for you!`
  );

  // Keep the process running
  process.on('SIGINT', async () => {
    console.log('\n\n👋 Shutting down Slack bot...');
    await integration.disconnect();
    process.exit(0);
  });

  // Log memory usage periodically
  setInterval(() => {
    const usage = process.memoryUsage();
    console.log(`📊 Memory: ${Math.round(usage.heapUsed / 1024 / 1024)}MB / ${Math.round(usage.heapTotal / 1024 / 1024)}MB`);
  }, 60000); // Every minute
}

// Run the bot
main().catch(console.error);