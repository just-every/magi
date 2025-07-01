/**
 * Slack OAuth Setup Helper
 * 
 * This module provides utilities for setting up Slack OAuth
 * to connect workspaces and obtain bot tokens.
 */

import { WebClient } from '@slack/web-api';

export interface SlackOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  port?: number;
}

export interface SlackOAuthResult {
  botToken: string;
  teamId: string;
  teamName: string;
  userId: string;
  botUserId: string;
}

/**
 * Utility for Slack OAuth setup
 */
export class SlackOAuthSetup {
  private config: SlackOAuthConfig;

  constructor(config: SlackOAuthConfig) {
    this.config = config;
  }

  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: this.config.scopes.join(','),
      redirect_uri: this.config.redirectUri,
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<SlackOAuthResult> {
    const client = new WebClient();
    
    const result = await client.oauth.v2.access({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
    });

    if (!result.ok || !result.access_token || !result.team || !result.authed_user) {
      throw new Error('Invalid OAuth response');
    }

    return {
      botToken: result.access_token,
      teamId: result.team.id || '',
      teamName: result.team.name || 'Unknown',
      userId: result.authed_user.id || '',
      botUserId: result.bot_user_id || '',
    };
  }
}

/**
 * Display OAuth setup instructions
 */
export function setupSlackOAuth(): void {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.log(`
❌ Missing Slack OAuth credentials!

To set up OAuth, you need to:
1. Create a Slack app at https://api.slack.com/apps
2. Add OAuth redirect URL: http://localhost:3000/slack/oauth/callback
3. Add these to your .env file:
   SLACK_CLIENT_ID=your-client-id
   SLACK_CLIENT_SECRET=your-client-secret

4. Add the required bot token scopes:
   - chat:write
   - channels:read
   - channels:join
   - files:write
   - im:write
   - users:read
    `);
    return;
  }

  const oauth = new SlackOAuthSetup({
    clientId,
    clientSecret,
    redirectUri: 'http://localhost:3000/slack/oauth/callback',
    scopes: [
      'chat:write',
      'channels:read',
      'channels:join',
      'files:write',
      'im:write',
      'users:read',
      'app_mentions:read',
      'channels:history',
    ],
  });

  const authUrl = oauth.getAuthorizationUrl();
  
  console.log(`
🔐 Slack OAuth Setup

Visit this URL to connect your workspace:
${authUrl}

After authorization, you'll get a code. Use it with:
  oauth.exchangeCodeForToken(code)
  `);
}