# Slack Integration for AI Manager

This document describes how to set up and use the Slack integration for the AI Manager to enable communication with users via Slack.

## Features

- **Two-way Communication**: Send and receive messages between the AI Manager and Slack
- **Design Generation via Slack**: Users can request design assets directly in Slack
- **Task Message Integration**: User messages in Slack are automatically added to active tasks using `addMessageToTask()`
- **File Upload Support**: Generated images are automatically uploaded to Slack
- **Thread Support**: Maintains conversation context within threads
- **Multi-channel Support**: Can listen and respond to multiple channels

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Choose "From scratch" and give your app a name
3. Select the workspace where you want to install the app

### 2. Configure Bot Token Scopes

In your app's OAuth & Permissions page, add these bot token scopes:

- `chat:write` - Send messages
- `channels:read` - List channels
- `channels:join` - Join public channels
- `files:write` - Upload files
- `im:write` - Send direct messages
- `users:read` - Get user information
- `app_mentions:read` - Receive mentions (if using Events API)
- `messages:channels` - Receive channel messages (if using Events API)

### 3. Install the App

1. Click "Install to Workspace"
2. Copy the Bot User OAuth Token (starts with `xoxb-`)

### 4. Configure Environment Variables

Add these to your `.env` file:

```bash
# Required
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Optional (for event subscriptions)
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_DEFAULT_CHANNEL=general
SLACK_ENABLE_SOCKET_MODE=true
```

### 5. Set Up Event Subscriptions (Optional)

If you want the bot to respond to messages automatically:

1. Enable Socket Mode in your app settings
2. Create an App-Level Token with `connections:write` scope
3. Add the token as `SLACK_APP_TOKEN` in your `.env`
4. Subscribe to these events:
   - `message.channels`
   - `app_mention`

## Usage

### Basic Integration

```typescript
import { initializeSlackIntegration } from './src/slack/index.js';

// Initialize Slack integration
const slackIntegration = await initializeSlackIntegration({
  enableTaskMessages: true,
  autoConnect: true
});

if (slackIntegration) {
  console.log('Slack integration ready!');
}
```

### Manual Message Sending

```typescript
const slackManager = slackIntegration.getSlackManager();
if (slackManager) {
  await slackManager.sendMessage(
    'general',
    'Hello from AI Manager! 🤖'
  );
}
```

### Design Generation Commands

Users can request designs in Slack using natural language:

- "Generate a modern logo for TechFlow"
- "Create a mockup for our mobile app"
- "Design a social media banner for the product launch"
- "Make an icon for the settings page"

The bot will:
1. Acknowledge the request
2. Generate the design using the AI Manager
3. Upload the final image to Slack
4. Provide progress updates during generation

### Task Message Integration

When a design task is active, all messages from users in the Slack channel are automatically captured and added to the task context using `addMessageToTask()`. This allows the AI to consider user feedback during the generation process.

Example flow:
1. User: "Generate a logo for our startup"
2. Bot: "I'll start working on your design request..."
3. User: "Make sure it has a tech feel with blue colors"
4. (This message is automatically added to the active task)
5. Bot: *Uploads final logo incorporating the feedback*

### Supported Asset Types

The integration maps common terms to asset types:

- `logo` → logo
- `mockup` → mockup
- `icon` → icon
- `favicon` → favicon
- `banner` → marketing-banner
- `social card` → marketing-social-card
- `screenshot` → product-screenshot
- `illustration` → illustration
- `palette` → color-palette
- `ui component` → ui-component

## API Reference

### SlackCommunicationManager

```typescript
class SlackCommunicationManager {
  // Connect to Slack
  async connect(): Promise<void>
  
  // Send a message
  async sendMessage(channel: string, message: string, options?: {
    threadTs?: string;
    blocks?: any[];
  }): Promise<void>
  
  // Send direct message to user
  async sendToUser(userId: string, message: string): Promise<void>
  
  // Listen for messages
  onMessage(channel: string, handler: (message: SlackMessage) => void): void
  
  // Upload a file
  async uploadFile(channels: string[], options: {
    file?: Buffer;
    filename?: string;
    title?: string;
    initial_comment?: string;
  }): Promise<void>
}
```

### SlackManagerIntegration

```typescript
class SlackManagerIntegration {
  // Set the active task for message capture
  setActiveTask(task: string | null): void
  
  // Get messages for a specific task
  getTaskMessages(task: string): SlackMessage[]
  
  // Get the underlying Slack manager
  getSlackManager(): SlackCommunicationManager | null
}
```

## Troubleshooting

### Bot not responding to messages

1. Check that Socket Mode is enabled
2. Verify the app token and signing secret are correct
3. Ensure the bot has joined the channel (`/invite @your-bot`)

### File uploads failing

1. Verify the bot has `files:write` permission
2. Check that the generated file exists before upload
3. Ensure the file size is within Slack limits

### Connection errors

1. Verify the bot token is valid
2. Check network connectivity
3. Ensure the workspace hasn't revoked the app

## Security Considerations

- Never commit Slack tokens to version control
- Use environment variables for all sensitive configuration
- Validate all user input before processing
- Implement rate limiting for API calls
- Use Slack's signing secret to verify requests (when using webhooks)