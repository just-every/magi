import { WebClient } from '@slack/web-api';
import { SocketModeClient } from '@slack/socket-mode';
import { SlackConfig, SlackMessage, SlackConnectionOptions } from './types.js';
import { CommunicationManager } from '../types/communication.js';

export class SlackCommunicationManager implements CommunicationManager {
  private client: WebClient;
  private socketModeClient?: SocketModeClient;
  private config: SlackConfig;
  private messageHandlers: Map<string, (message: SlackMessage) => void> = new Map();
  private connectionReady = false;
  private botUserId?: string;
  private botUserName?: string;

  constructor(config: SlackConfig) {
    this.config = config;
    this.client = new WebClient(config.botToken);
    
    if (config.enableSocketMode && config.appToken) {
      console.log('🔧 Initializing Socket Mode client...');
      this.socketModeClient = new SocketModeClient({
        appToken: config.appToken
      });
      this.setupEventListeners();
    } else {
      console.log('⚠️  Socket Mode not enabled - missing app token or disabled in config');
    }
  }

  // Legacy send method for compatibility
  send(data: any): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    this.sendMessage(this.config.defaultChannel, message).catch(console.error);
  }

  async connect(): Promise<void> {
    try {
      console.log('🔌 Connecting to Slack...');
      console.log('📋 Config:', {
        enableSocketMode: this.config.enableSocketMode,
        hasSigningSecret: !!this.config.signingSecret,
        hasAppToken: !!this.config.appToken,
        defaultChannel: this.config.defaultChannel
      });

      // Test the connection
      const auth = await this.client.auth.test();
      this.botUserId = auth.user_id as string | undefined;
      this.botUserName = auth.user as string | undefined;
      console.log(`✅ Connected to Slack workspace as ${auth.user} (${auth.user_id})`);
      console.log(`🏢 Team: ${auth.team} (${auth.team_id})`);
      
      this.connectionReady = true;
      
      if (this.socketModeClient && this.config.enableSocketMode) {
        console.log('🚀 Starting Socket Mode client...');
        await this.socketModeClient.start();
        console.log('🎧 Socket Mode client started successfully');
      } else if (this.config.enableSocketMode) {
        console.log('⚠️  Socket mode enabled but client not configured (missing app token?)');
      } else {
        console.log('📢 Socket mode disabled - will not receive real-time events');
      }
    } catch (error) {
      console.error('❌ Failed to connect to Slack:', error);
      throw error;
    }
  }

  async sendMessage(
    channel: string, 
    message: string, 
    options?: { threadTs?: string; blocks?: any[] }
  ): Promise<void> {
    if (!this.connectionReady) {
      console.error('Slack connection not ready');
      return;
    }

    try {
      const result = await this.client.chat.postMessage({
        channel: channel || this.config.defaultChannel,
        text: message,
        thread_ts: options?.threadTs,
        blocks: options?.blocks,
        mrkdwn: true,
      });
      
      console.log(`Message sent to Slack channel ${channel}: ${result.ts}`);
    } catch (error) {
      console.error('Failed to send Slack message:', error);
    }
  }

  async sendToUser(userId: string, message: string): Promise<void> {
    try {
      // Open a direct message channel with the user
      const result = await this.client.conversations.open({
        users: userId,
      });
      
      if (result.channel?.id) {
        await this.sendMessage(result.channel.id, message);
      }
    } catch (error) {
      console.error('Failed to send direct message:', error);
    }
  }

  onMessage(channel: string, handler: (message: SlackMessage) => void): void {
    this.messageHandlers.set(channel, handler);
  }

  private setupEventListeners(): void {
    if (!this.socketModeClient) return;

    console.log('🔧 Setting up Slack Socket Mode event listeners...');

    // Listen for message events
    this.socketModeClient.on('message', async ({ event, ack }: any) => {
      await ack();
      
      console.log('📩 Received message event:', {
        type: event.type,
        subtype: event.subtype,
        channel: event.channel,
        user: event.user,
        text: event.text?.substring(0, 100) + (event.text?.length > 100 ? '...' : ''),
        ts: event.ts,
        thread_ts: event.thread_ts,
        bot_id: event.bot_id
      });

      if (event.subtype) {
        console.log(`⏭️  Ignoring message with subtype: ${event.subtype}`);
        return; // Ignore bot messages and other subtypes
      }

      if (event.bot_id) {
        console.log('🤖 Ignoring bot message');
        return;
      }

      const message: SlackMessage = {
        channel: event.channel,
        text: event.text,
        user: event.user,
        ts: event.ts,
        thread_ts: event.thread_ts,
      };

      console.log('✅ Processing user message:', {
        channel: message.channel,
        user: message.user,
        text: message.text?.substring(0, 50) + (message.text?.length > 50 ? '...' : '')
      });

      // Call registered handlers
      const handler = this.messageHandlers.get(event.channel) || 
                     this.messageHandlers.get('*'); // Wildcard handler
      
      if (handler) {
        console.log(`🎯 Found handler for channel: ${event.channel || '*'}`);
        handler(message);
      } else {
        console.log(`❌ No handler found for channel: ${event.channel}`);
        console.log('📋 Registered handlers:', Array.from(this.messageHandlers.keys()));
      }
    });

    // Listen for app mentions
    this.socketModeClient.on('app_mention', async ({ event, ack }: any) => {
      await ack();
      
      console.log('🏷️  Received app mention:', {
        channel: event.channel,
        user: event.user,
        text: event.text?.substring(0, 100) + (event.text?.length > 100 ? '...' : ''),
        ts: event.ts
      });

      const message: SlackMessage = {
        channel: event.channel,
        text: event.text,
        user: event.user,
        ts: event.ts,
        thread_ts: event.thread_ts,
      };

      // Trigger mention handler if registered
      const handler = this.messageHandlers.get('@mention');
      if (handler) {
        console.log('🎯 Processing app mention with registered handler');
        handler(message);
      } else {
        console.log('❌ No handler registered for @mention events');
      }
    });

    // Error handling
    this.socketModeClient.on('error', (error: Error) => {
      console.error('❌ Slack Socket Mode client error:', error);
    });

    console.log('✅ Slack Socket Mode event listeners configured');
  }

  async listChannels(): Promise<Array<{ id: string; name: string }>> {
    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel',
      });
      
      return result.channels?.map(channel => ({
        id: channel.id!,
        name: channel.name!,
      })) || [];
    } catch (error) {
      console.error('Failed to list channels:', error);
      return [];
    }
  }

  async joinChannel(channelName: string): Promise<void> {
    try {
      await this.client.conversations.join({
        channel: channelName,
      });
      console.log(`Joined channel: ${channelName}`);
    } catch (error) {
      console.error(`Failed to join channel ${channelName}:`, error);
    }
  }

  async getUserInfo(userId: string): Promise<any> {
    try {
      const result = await this.client.users.info({
        user: userId,
      });
      return result.user;
    } catch (error) {
      console.error('Failed to get user info:', error);
      return null;
    }
  }

  async uploadFile(
    channels: string[], 
    options: { 
      content?: string; 
      file?: Buffer; 
      filename?: string; 
      title?: string;
      initial_comment?: string;
    }
  ): Promise<void> {
    try {
      const uploadOptions: any = {
        channels: channels.join(','),
        filename: options.filename,
        title: options.title,
        initial_comment: options.initial_comment,
      };
      
      // Slack API requires either content or file, not both
      if (options.file) {
        uploadOptions.file = options.file;
      } else if (options.content) {
        uploadOptions.content = options.content;
      }
      
      await this.client.files.uploadV2(uploadOptions);
      console.log('File uploaded successfully');
    } catch (error) {
      console.error('Failed to upload file:', error);
    }
  }

  isConnected(): boolean {
    return this.connectionReady;
  }

  getBotUserId(): string | undefined {
    return this.botUserId;
  }

  getBotUserName(): string | undefined {
    return this.botUserName;
  }

  async disconnect(): Promise<void> {
    if (this.socketModeClient) {
      await this.socketModeClient.disconnect();
    }
    this.connectionReady = false;
    console.log('Disconnected from Slack');
  }
}

// Factory function to create SlackCommunicationManager from environment variables
export function createSlackManager(): SlackCommunicationManager | null {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const defaultChannel = process.env.SLACK_DEFAULT_CHANNEL || 'general';
  
  if (!botToken) {
    console.log('Slack bot token not configured');
    return null;
  }

  const config: SlackConfig = {
    botToken,
    appToken: process.env.SLACK_APP_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    defaultChannel,
    enableSocketMode: process.env.SLACK_ENABLE_SOCKET_MODE === 'true',
  };

  return new SlackCommunicationManager(config);
}
