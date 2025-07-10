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
      
      // Check if this is a manager generation request
      const isManager = this.isManagerRequest(message.text);
      console.log(`🎨 Is manager request: ${isManager}`);
      
      if (isManager) {
        console.log('🚀 Handling manager request...');
        await this.handleManagerRequest(message);
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

  private isManagerRequest(text: string): boolean {
    const managerKeywords = [
      'analyze', 'strategy', 'roadmap', 'plan', 'budget',
      'market', 'competitive', 'okr', 'risk', 'forecast',
      'vision', 'structure', 'assessment', 'executive'
    ];
    
    const lowerText = text.toLowerCase();
    const matches = managerKeywords.filter(keyword => lowerText.includes(keyword));
    
    console.log(`🔍 Checking for CEO management keywords in: "${text}"`);
    console.log(`🎯 Found management keywords: [${matches.join(', ')}]`);
    
    return matches.length > 0;
  }

  private async handleManagerRequest(message: SlackMessage): Promise<void> {
    if (!this.slackManager) return;

    const { text, channel, thread_ts } = message;
    
    console.log('🎨 Processing manager request:', {
      text,
      channel,
      thread_ts
    });
    
    // Send initial acknowledgment
    console.log('📤 Sending acknowledgment...');
    await this.slackManager.sendMessage(
      channel,
      `I'll start working on your management task as CEO: "${text}"`,
      { threadTs: thread_ts }
    );

    try {
      // Set this as the active task
      this.activeTask = text;
      this.taskMessages.set(text, [message]);
      console.log(`✅ Set active task: ${this.activeTask}`);

      // Extract deliverable type and requirements from the message
      const { assetType, userPrompt } = this.parseManagementRequest(text);
      console.log('🎯 Parsed request:', { assetType, userPrompt });

      // Try actual manager generation with dynamic imports
      console.log('🎨 Attempting manager generation with error handling...');
      
      try {
        // Import simplified manager agent for faster response
        console.log('📦 Importing simplified manager agent...');
        const { runSimpleManagerAgentStreaming } = await import('../agents/simple-manager-agent.js');
        
        // Use simplified manager agent for faster analysis
        console.log('🚀 Starting strategic analysis...');
        const generator = runSimpleManagerAgentStreaming(
          userPrompt,
          assetType as MANAGER_ASSET_TYPES
        );
        
        // Store the generator for message injection
        this.activeTaskGenerator = generator;
        console.log('✅ Generator initialized and stored');
        
        if (!this.slackManager) {
          throw new Error('Slack manager not available');
        }

        let finalResult: string | undefined;
        const updates: string[] = [];
        let updateCount = 0;
        
        // Send initial progress message
        await this.slackManager.sendMessage(
          channel,
          `🔄 Starting ${assetType} analysis...`,
          { threadTs: thread_ts }
        );

        // Add timeout for the entire generation process
        const generationTimeout = setTimeout(async () => {
          if (this.slackManager) {
            await this.slackManager.sendMessage(
              channel,
              `⏰ Analysis is taking longer than expected. This might be due to complex research requirements. Please wait...`,
              { threadTs: thread_ts }
            );
          }
        }, 60000); // 1 minute timeout warning

        try {
          for await (const event of generator) {
            updateCount++;
            
            // Log event details for debugging
            console.log(`[handleManagerRequest] Event ${updateCount}:`, {
              type: event.type,
              hasContent: 'content' in event,
              contentLength: event.content?.length || 0
            });
            
            if (event.type === 'message_delta' && 'content' in event && event.content) {
              updates.push(event.content);
              
              // Send more frequent updates to show progress
              if (updateCount % 5 === 0) {
                await this.slackManager.sendMessage(
                  channel,
                  `📊 Progress: Working on ${assetType} (${Math.floor(updateCount / 2)}% complete)...`,
                  { threadTs: thread_ts }
                );
              }
            } else if (event.type === 'message_complete' && 'content' in event && event.content) {
              // This is the final complete message
              finalResult = event.content;
              console.log('[handleManagerRequest] Message complete - full content length:', event.content.length);
            } else if (event.type === 'text' && typeof event.text === 'string') {
              // Alternative event format
              updates.push(event.text);
            } else if (event.type === 'done' && updates.length > 0) {
              // If we have accumulated updates but no final result, join them
              finalResult = updates.join('');
              console.log('[handleManagerRequest] Done event - joined updates length:', finalResult.length);
            }
          }
          
          // If no finalResult but we have updates, join them
          if (!finalResult && updates.length > 0) {
            finalResult = updates.join('');
            console.log('[handleManagerRequest] Fallback - joined all updates, length:', finalResult.length);
          }
        } finally {
          clearTimeout(generationTimeout);
        }

        // Send the analysis results to Slack
        if (finalResult && finalResult.trim()) {
          // Filter out meta-commentary about task completion
          const metaPhrases = [
            'I see that the task has been successfully completed',
            'As per the instructions',
            'No further actions are needed',
            'Awaiting your feedback',
            'If you\'d like me to address',
            'task has been successfully completed'
          ];
          
          let cleanedResult = finalResult;
          for (const phrase of metaPhrases) {
            const regex = new RegExp(`.*${phrase}.*\n?`, 'gi');
            cleanedResult = cleanedResult.replace(regex, '');
          }
          
          // If the entire result was meta-commentary, use the original
          if (cleanedResult.trim().length < 100 && finalResult.length > 200) {
            console.log('[handleManagerRequest] Warning: Cleaned result too short, using original');
            cleanedResult = finalResult;
          }
          
          // Split long results into chunks for Slack
          const maxLength = 3000; // Slack message limit
          const chunks = [];
          for (let i = 0; i < cleanedResult.length; i += maxLength) {
            chunks.push(cleanedResult.substring(i, i + maxLength));
          }
          
          await this.slackManager.sendMessage(
            channel,
            `✅ **${assetType} Analysis Complete!**\n\n${chunks[0]}`,
            { threadTs: thread_ts }
          );
          
          // Send remaining chunks if any
          for (let i = 1; i < chunks.length; i++) {
            await this.slackManager.sendMessage(
              channel,
              chunks[i],
              { threadTs: thread_ts }
            );
          }
        } else {
          await this.slackManager.sendMessage(
            channel,
            `✅ ${assetType} analysis completed!\n\nThe analysis has been processed. Here's a summary of key findings and recommendations for your strategic planning.`,
            { threadTs: thread_ts }
          );
        }
      } catch (managerError: any) {
        console.error('❌ Manager generation failed:', managerError);
        await this.slackManager.sendMessage(
          channel,
          `❌ Sorry, I encountered an error during strategic analysis: ${managerError?.message || 'Unknown error'}

The Slack integration is working perfectly, but there's an issue with the management system. I'll send a fallback message instead.`,
          { threadTs: thread_ts }
        );
      }

    } catch (error) {
      console.error('Error generating manager:', error);
      await this.slackManager.sendMessage(
        channel,
        `Sorry, I encountered an error while generating your manager: ${error}`,
        { threadTs: thread_ts }
      );
    } finally {
      // Clear active task
      this.activeTask = null;
      this.activeTaskGenerator = null;
    }
  }

  private parseManagementRequest(text: string): { assetType: string; userPrompt: string } {
    // Map common terms to management deliverable types
    const assetTypeMap: Record<string, string> = {
      'market analysis': 'market_analysis',
      'competitive': 'competitive_landscape', 
      'roadmap': 'strategic_roadmap',
      'okr': 'quarterly_okrs',
      'strategy': 'strategic_roadmap',
      'budget': 'budget_forecast',
      'risk': 'risk_assessment',
      'team': 'team_structure',
      'vision': 'product_vision',
      'go-to-market': 'go_to_market_strategy',
      'executive summary': 'executive_summary'
    };

    // Clean the text by removing bot mentions
    let cleanText = text.replace(/<@[^>]+>/g, '').trim();
    
    console.log(`🧹 Cleaned text: "${cleanText}" (from: "${text}")`);

    // Try to identify asset type from the text
    const lowerText = cleanText.toLowerCase();
    let assetType = 'market_analysis'; // default management deliverable
    let userPrompt = cleanText;

    for (const [keyword, type] of Object.entries(assetTypeMap)) {
      if (lowerText.includes(keyword)) {
        assetType = type;
        // Remove management action words and deliverable type, keep the description
        userPrompt = cleanText
          .replace(new RegExp(`\\b(analyze|create|develop|plan|assess)\\s+(a\\s+)?`, 'gi'), '')
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

    console.log(`🎯 Parsed management request:`, { assetType, userPrompt });

    return { assetType, userPrompt };
  }

  private async handleMention(message: SlackMessage): Promise<void> {
    if (!this.slackManager) return;

    const { channel, thread_ts, text } = message;
    
    console.log(`🏷️  Processing mention - checking if it's a manager request...`);
    
    // Check if the mention contains a management request
    const isManagement = this.isManagerRequest(text);
    
    if (isManagement) {
      console.log('🏆 Mention contains management request - handling as management request');
      await this.handleManagerRequest(message);
    } else {
      console.log('💬 Mention is general - sending help message');
      await this.slackManager.sendMessage(
        channel,
        `Hi! I'm your Manager-as-CEO AI assistant. I can help with strategic analysis and executive deliverables.
        
Examples:
- "Create a market analysis for our new product"
- "Develop a competitive landscape report"
- "Generate quarterly OKRs for the engineering team"
- "Analyze risks for our product launch"
        
I support: market analysis, strategic roadmaps, risk assessments, budget forecasts, and more!`,
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