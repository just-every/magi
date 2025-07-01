// Load environment variables FIRST, before any other imports
import { config } from 'dotenv';
config();

import { SlackCommunicationManager, createSlackManager } from './slack-communication-manager.js';
import { SlackMessage } from './types.js';
import type { MANAGER_ASSET_TYPES } from '../constants.js';
import type { ProviderStreamEvent } from '@just-every/ensemble';
import path from 'path';
import fs from 'fs';

export interface SlackManagerOptions {
  enableTaskMessages?: boolean;
  autoConnect?: boolean;
  responseChannel?: string;
}

export class SlackManagerIntegration {
  private slackManager: SlackCommunicationManager | null;
  private activeTask: string | null = null;
  private activeTaskGenerator: AsyncGenerator<ProviderStreamEvent> | null = null;
  private taskMessages: Map<string, SlackMessage[]> = new Map();
  private options: SlackManagerOptions;

  constructor(options: SlackManagerOptions = {}) {
    this.options = {
      enableTaskMessages: true,
      autoConnect: true,
      ...options
    };
    
    this.slackManager = createSlackManager();
    
    if (this.slackManager && this.options.autoConnect) {
      this.connect().catch(console.error);
    }
  }

  async connect(): Promise<void> {
    if (!this.slackManager) {
      throw new Error('Slack manager not configured');
    }

    await this.slackManager.connect();
    
    // Set up message handlers
    this.setupMessageHandlers();
  }

  private setupMessageHandlers(): void {
    if (!this.slackManager) return;

    console.log('🎯 Setting up Slack message handlers...');

    // Listen for messages in all channels
    this.slackManager.onMessage('*', async (message: SlackMessage) => {
      console.log(`📨 Received Slack message from ${message.user} in ${message.channel}:`);
      console.log(`💬 Text: "${message.text}"`);
      
      // Check if this is a design generation request
      const isDesign = this.isDesignRequest(message.text);
      console.log(`🎨 Is design request: ${isDesign}`);
      
      if (isDesign) {
        console.log('🚀 Handling design request...');
        await this.handleDesignRequest(message);
      }
      
      // If we have an active task and task messages are enabled, add to task
      if (this.activeTask && this.options.enableTaskMessages) {
        console.log(`📝 Adding message to active task: ${this.activeTask}`);
        await this.addMessageToActiveTask(message);
      } else if (this.activeTask) {
        console.log('⚠️  Active task exists but task messages disabled');
      } else {
        console.log('ℹ️  No active task - message not added to task');
      }
    });

    // Listen for direct mentions
    this.slackManager.onMessage('@mention', async (message: SlackMessage) => {
      console.log(`🏷️  Received mention from ${message.user}: ${message.text}`);
      await this.handleMention(message);
    });

    console.log('✅ Message handlers configured');
  }

  private isDesignRequest(text: string): boolean {
    const designKeywords = [
      'generate', 'create', 'design', 'make',
      'logo', 'mockup', 'icon', 'banner', 'card',
      'screenshot', 'illustration', 'palette'
    ];
    
    const lowerText = text.toLowerCase();
    const matches = designKeywords.filter(keyword => lowerText.includes(keyword));
    
    console.log(`🔍 Checking for design keywords in: "${text}"`);
    console.log(`🎯 Found keywords: [${matches.join(', ')}]`);
    
    return matches.length > 0;
  }

  private async handleDesignRequest(message: SlackMessage): Promise<void> {
    if (!this.slackManager) return;

    const { text, channel, thread_ts } = message;
    
    console.log('🎨 Processing design request:', {
      text,
      channel,
      thread_ts
    });
    
    // Send initial acknowledgment
    console.log('📤 Sending acknowledgment...');
    await this.slackManager.sendMessage(
      channel,
      `I'll start working on your design request: "${text}"`,
      { threadTs: thread_ts }
    );

    try {
      // Set this as the active task
      this.activeTask = text;
      this.taskMessages.set(text, [message]);
      console.log(`✅ Set active task: ${this.activeTask}`);

      // Extract asset type and description from the message
      const { assetType, userPrompt } = this.parseDesignRequest(text);
      console.log('🎯 Parsed request:', { assetType, userPrompt });

      // Try actual design generation with dynamic imports
      console.log('🎨 Attempting design generation with error handling...');
      
      try {
        // Import design modules at runtime to ensure env vars are loaded first
        console.log('📦 Importing design modules...');
        const { runDesignAgentStreaming } = await import('../agents/manager-agent.js');
        const { addMessageToTask } = await import('@just-every/task');
        
        // Use runDesignAgentStreaming to generate the design
        console.log('🚀 Starting design generation...');
        const generator = runDesignAgentStreaming(
          assetType as MANAGER_ASSET_TYPES,
          userPrompt,
          true, // withInspiration
          [] // brandAssets
        );
        
        // Store the generator for message injection
        this.activeTaskGenerator = generator;
        console.log('✅ Generator initialized and stored');

        let finalImagePath: string | undefined;
        const updates: string[] = [];

        for await (const event of generator) {
          if (event.type === 'message_delta' && 'content' in event && event.content) {
            updates.push(event.content);
            
            // Send periodic updates to Slack
            if (updates.length % 10 === 0) {
              await this.slackManager.sendMessage(
                channel,
                `Progress update: Working on your ${assetType} design...`,
                { threadTs: thread_ts }
              );
            }
          } else if (event.type === 'message_complete' && 'content' in event && event.content) {
            // Try to extract the final image path from the content
            const pathMatch = event.content.match(/([^\s]+\.(png|jpg|jpeg|gif|svg))/i);
            if (pathMatch) {
              finalImagePath = pathMatch[1];
            }
          }
        }

        // Upload the final image to Slack
        if (finalImagePath && fs.existsSync(finalImagePath)) {
          const imageBuffer = fs.readFileSync(finalImagePath);
          const filename = path.basename(finalImagePath);
          
          await this.slackManager.uploadFile(
            [channel],
            {
              file: imageBuffer,
              filename,
              title: `Generated ${assetType}`,
              initial_comment: `Here's your ${assetType} design! 🎨`,
            }
          );
        } else {
          await this.slackManager.sendMessage(
            channel,
            `Design generation completed, but I couldn't locate the output file.`,
            { threadTs: thread_ts }
          );
        }
      } catch (designError: any) {
        console.error('❌ Design generation failed:', designError);
        await this.slackManager.sendMessage(
          channel,
          `❌ Sorry, I encountered an error during design generation: ${designError?.message || 'Unknown error'}

The Slack integration is working perfectly, but there's an issue with the design model. I'll send a fallback message instead.`,
          { threadTs: thread_ts }
        );
      }

    } catch (error) {
      console.error('Error generating design:', error);
      await this.slackManager.sendMessage(
        channel,
        `Sorry, I encountered an error while generating your design: ${error}`,
        { threadTs: thread_ts }
      );
    } finally {
      // Clear active task
      this.activeTask = null;
      this.activeTaskGenerator = null;
    }
  }

  private parseDesignRequest(text: string): { assetType: string; userPrompt: string } {
    // Map common terms to asset types
    const assetTypeMap: Record<string, string> = {
      'logo': 'primary_logo',
      'mockup': 'homepage_mockup',
      'icon': 'system_icon_library',
      'favicon': 'favicon',
      'banner': 'email_banner',
      'social card': 'open_graph_card',
      'screenshot': 'product_screenshots',
      'illustration': 'spot_illustrations',
      'palette': 'color_pallet',
      'ui component': 'component_sheet'
    };

    // Clean the text by removing bot mentions
    let cleanText = text.replace(/<@[^>]+>/g, '').trim();
    
    console.log(`🧹 Cleaned text: "${cleanText}" (from: "${text}")`);

    // Try to identify asset type from the text
    const lowerText = cleanText.toLowerCase();
    let assetType = 'primary_logo'; // default
    let userPrompt = cleanText;

    for (const [keyword, type] of Object.entries(assetTypeMap)) {
      if (lowerText.includes(keyword)) {
        assetType = type;
        // Remove design action words and asset type, keep the description
        userPrompt = cleanText
          .replace(new RegExp(`\\b(generate|create|design|make)\\s+(a\\s+)?`, 'gi'), '')
          .replace(new RegExp(`\\b(a\\s+)?${keyword}(\\s+for)?`, 'gi'), '')
          .replace(/\s+/g, ' ')
          .trim();
        break;
      }
    }

    // If userPrompt is empty or too short, use the cleaned text
    if (!userPrompt || userPrompt.length < 3) {
      userPrompt = cleanText;
    }

    console.log(`🎯 Parsed design request:`, { assetType, userPrompt });

    return { assetType, userPrompt };
  }

  private async handleMention(message: SlackMessage): Promise<void> {
    if (!this.slackManager) return;

    const { channel, thread_ts, text } = message;
    
    console.log(`🏷️  Processing mention - checking if it's a design request...`);
    
    // Check if the mention contains a design request
    const isDesign = this.isDesignRequest(text);
    
    if (isDesign) {
      console.log('🎨 Mention contains design request - handling as design request');
      await this.handleDesignRequest(message);
    } else {
      console.log('💬 Mention is general - sending help message');
      await this.slackManager.sendMessage(
        channel,
        `Hi! I can help you generate various design assets. Just tell me what you need!
        
Examples:
- "Generate a modern logo for a tech startup called TechFlow"
- "Create a mockup for a mobile banking app"
- "Design a social media card for our product launch"
        
I support: logos, mockups, icons, banners, color palettes, and more!`,
        { threadTs: thread_ts }
      );
    }
  }

  private async addMessageToActiveTask(message: SlackMessage): Promise<void> {
    if (!this.activeTask || !this.activeTaskGenerator) return;

    // Add the message to task messages
    const messages = this.taskMessages.get(this.activeTask) || [];
    messages.push(message);
    this.taskMessages.set(this.activeTask, messages);

    // Use addMessageToTask to inject the message into the active task generator
    try {
      const { addMessageToTask } = await import('@just-every/task');
      addMessageToTask(this.activeTaskGenerator, {
        type: 'message',
        role: 'user',
        content: `[${message.user || 'User'}]: ${message.text}`
      });
      
      console.log(`Added Slack message to active task: ${this.activeTask}`);
    } catch (error) {
      console.error('Failed to add message to task:', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.slackManager) {
      await this.slackManager.disconnect();
    }
  }

  getSlackManager(): SlackCommunicationManager | null {
    return this.slackManager;
  }

  setActiveTask(task: string | null): void {
    this.activeTask = task;
    if (task && !this.taskMessages.has(task)) {
      this.taskMessages.set(task, []);
    }
  }

  getTaskMessages(task: string): SlackMessage[] {
    return this.taskMessages.get(task) || [];
  }
}

// Export convenience function to create and initialize integration
export async function initializeSlackIntegration(
  options?: SlackManagerOptions
): Promise<SlackManagerIntegration | null> {
  const integration = new SlackManagerIntegration(options);
  
  if (integration.getSlackManager()) {
    return integration;
  }
  
  return null;
}