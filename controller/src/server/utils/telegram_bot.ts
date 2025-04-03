/**
 * Telegram Bot Module
 *
 * Handles communication with Telegram using node-telegram-bot-api
 */
import TelegramBot from 'node-telegram-bot-api';
import ngrok from 'ngrok';
import { ProcessManager } from '../managers/process_manager';
import { CommunicationManager } from '../managers/communication_manager';

let telegramBot: TelegramBot | null = null;
let ngrokUrl: string | null = null;
let communicationManager: CommunicationManager | null = null;
let processManager: ProcessManager | null = null;
let allowedChatIds: Set<number> = new Set();
const activeChats: Map<number, string> = new Map(); // Maps chat IDs to process IDs
let isShuttingDown = false;
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const ngrokProcess: any = null;

/**
 * Initialize the Telegram bot
 */
export async function initTelegramBot(
  commManager: CommunicationManager,
  procManager: ProcessManager
): Promise<void> {
  // If we're already in the process of shutting down, don't try to initialize
  if (isShuttingDown) {
    console.log('[Telegram] Not initializing bot because shutdown is in progress');
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log('[Telegram] Bot token not found. Telegram integration disabled.');
    return;
  }

  // First, make sure there aren't any lingering resources from previous runs
  await closeTelegramBot();

  // Store references to managers
  communicationManager = commManager;
  processManager = procManager;

  try {
    // Set up ngrok for webhook
    // Use the secondary port (4010) for the webhook to avoid port conflicts
    const webhookPort = parseInt(process.env.TELEGRAM_WEBHOOK_PORT || '4010', 10);

    try {
      // Make sure any previous ngrok connection is properly killed
      // This is important for handling server restarts via nodemon
      try {
        console.log('[Telegram] Closing any existing ngrok connections before starting new one');
        await ngrok.disconnect();
        await ngrok.kill();
      } catch (killError) {
        console.log('[Telegram] No existing ngrok process found or error closing it:', killError);
      }
      
      console.log(`[Telegram] Starting ngrok on port ${webhookPort}`);
      
      ngrokUrl = await ngrok.connect({
        addr: webhookPort,
        authtoken: process.env.NGROK_AUTH_TOKEN || undefined,
        onStatusChange: status => {
          console.log(`[Telegram] Ngrok status changed: ${status}`);
        },
        onLogEvent: data => {
          if (data.includes('error')) {
            console.error(`[Telegram] Ngrok log: ${data}`);
          }
        }
      });

      console.log(`[Telegram] Ngrok tunnel established at ${ngrokUrl}`);
    } catch (ngrokError) {
      console.error('[Telegram] Failed to establish ngrok tunnel:', ngrokError);
      console.log('[Telegram] Falling back to polling mode');
    }

    // Initialize the Telegram bot
    const webhookPath = '/telegram-webhook';

    if (ngrokUrl) {
      // Webhook mode
      telegramBot = new TelegramBot(token, {
        webHook: {
          port: webhookPort
        }
      });

      // Set webhook
      const webhookUrl = `${ngrokUrl}${webhookPath}`;
      await telegramBot.setWebHook(webhookUrl);
      console.log(`[Telegram] Webhook set to ${webhookUrl} on port ${webhookPort}`);
    } else {
      // Polling mode
      telegramBot = new TelegramBot(token, { polling: true });
      console.log('[Telegram] Bot started in polling mode');
    }

    // Get bot info to log the bot username
    try {
      const me = await telegramBot.getMe();
      console.log(`[Telegram] Connected to bot: @${me.username}`);
      console.log(`[Telegram] Bot ID: ${me.id}`);
      console.log(`[Telegram] Bot name: ${me.first_name}`);
    } catch (error) {
      console.error('[Telegram] Failed to get bot info:', error);
    }

    // Load allowed chat IDs from environment variable
    if (process.env.TELEGRAM_ALLOWED_CHAT_IDS) {
      const chatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS.split(',').map(id => parseInt(id.trim(), 10));
      allowedChatIds = new Set(chatIds);
      console.log(`[Telegram] Allowed chat IDs: ${Array.from(allowedChatIds).join(', ')}`);
    }

    // Set up message handlers
    setupMessageHandlers();

    console.log('[Telegram] Bot initialized successfully');
  } catch (error) {
    console.error('[Telegram] Error initializing Telegram bot:', error);
    telegramBot = null;
  }
}

/**
 * Set up message handlers for the Telegram bot
 */
function setupMessageHandlers(): void {
  if (!telegramBot || !processManager || !communicationManager) return;

  // Handle text messages
  telegramBot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username || msg.from?.first_name || 'Unknown user';

    console.log(`[Telegram] Received message from ${username} (chat ID: ${chatId}): "${msg.text}"`);

    // Check if this chat is allowed
    if (!allowedChatIds.has(chatId)) {
      console.log(`[Telegram] Message from unauthorized chat ${chatId}`);
      telegramBot?.sendMessage(chatId,
        `Unauthorized. This chat ID (${chatId}) is not in the allowed list.\n\n` +
        `To allow this chat, add ${chatId} to the TELEGRAM_ALLOWED_CHAT_IDS environment variable.`
      );
      return;
    }

    // Handle text message
    if (msg.text) {
      // Send acknowledgment first
      telegramBot?.sendMessage(chatId, `Received: "${msg.text}"\nProcessing your request...`);

      // Then handle the message
      handleIncomingMessage(chatId, msg.text);
    } else {
      telegramBot?.sendMessage(chatId, 'I can only process text messages at this time.');
    }
  });

  // Handle errors
  telegramBot.on('error', (error) => {
    console.error('[Telegram] Bot error:', error);
  });

  // Handle polling errors
  telegramBot.on('polling_error', (error) => {
    console.error('[Telegram] Polling error:', error);
  });

  // Handle webhook errors
  telegramBot.on('webhook_error', (error) => {
    console.error('[Telegram] Webhook error:', error);
  });
}

/**
 * Handle incoming message from Telegram
 */
function handleIncomingMessage(chatId: number, text: string): void {
  if (!processManager || !communicationManager) {
    telegramBot?.sendMessage(chatId, 'System error: Communication manager not initialized.');
    return;
  }

  const coreProcessId = processManager.coreProcessId;

  if (!coreProcessId) {
    telegramBot?.sendMessage(chatId, 'No active core process available. Please start a new session in the web interface.');
    return;
  }

  // Check if the core process is active and has a connection
  const hasActiveConnection = communicationManager.hasActiveConnection(coreProcessId);
  if (!hasActiveConnection) {
    telegramBot?.sendMessage(chatId, 'Core process exists but has no active connection. The system may be starting up or experiencing issues.');
    return;
  }

  // Map this chat to the core process
  activeChats.set(chatId, coreProcessId);

  try {
    // Forward the message to the core process
    const success = communicationManager.sendCommand(
      coreProcessId,
      'telegram_message',
      {
        chatId,
        message: text
      }
    );

    if (success) {
      console.log(`[Telegram] Successfully forwarded message from chat ${chatId} to process ${coreProcessId}`);
    } else {
      console.error(`[Telegram] Failed to forward message from chat ${chatId} to process ${coreProcessId}`);
      telegramBot?.sendMessage(chatId, 'Error sending message to MAGI. Please try again later.');
    }
  } catch (error) {
    console.error(`[Telegram] Error sending command to process ${coreProcessId}:`, error);
    telegramBot?.sendMessage(chatId, 'Error processing your message. Please try again later.');
  }
}

/**
 * Send a message to Telegram
 */
export async function sendTelegramMessage(message: string, affect: string, processId: string): Promise<void> {
  if (!telegramBot) {
    console.log('[Telegram] Cannot send message: Bot not initialized');
    return;
  }

  if (!message || typeof message !== 'string') {
    console.error('[Telegram] Invalid message:', message);
    return;
  }

  // Find chats associated with this process
  const targetChats: number[] = [];

  // Always send to all active chats that are allowed
  for (const [chatId] of activeChats.entries()) {
    if (allowedChatIds.has(chatId)) {
      targetChats.push(chatId);
    }
  }

  // If no active chats, send to all allowed chats
  if (targetChats.length === 0) {
    targetChats.push(...Array.from(allowedChatIds));
  }

  if (targetChats.length === 0) {
    console.log('[Telegram] No target chats available to send message to');
    return;
  }

  // Format message with affect and process ID
  let formattedMessage = `[MAGI ${processId}]\n${message}`;

  // Telegram has a 4096 character limit, so we need to truncate long messages
  if (formattedMessage.length > 4000) {
    formattedMessage = formattedMessage.substring(0, 3997) + '...';
  }

  // Clean up HTML tags that might cause parsing issues
  formattedMessage = formattedMessage
    .replace(/<(?!\/?(b|strong|i|em|u|ins|s|strike|del|a|code|pre)( |>))/gi, '&lt;') // Only allow safe HTML tags
    .replace(/(\r\n|\n|\r)/gm, '\n'); // Normalize newlines

  // Log that we're sending a message
  console.log(`[Telegram] Sending message to ${targetChats.length} chat(s): ${targetChats.join(', ')}`);

  // Send message to all target chats
  for (const chatId of targetChats) {
    try {
      await telegramBot.sendMessage(chatId, formattedMessage, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
      console.log(`[Telegram] Message sent successfully to chat ${chatId}`);
    } catch (error) {
      console.error(`[Telegram] Error sending message to chat ${chatId}:`, error);
      // Try again without HTML parsing
      try {
        await telegramBot.sendMessage(chatId, `[MAGI ${processId}]\n${message}`, {
          parse_mode: '',
          disable_web_page_preview: true
        });
        console.log(`[Telegram] Message sent successfully to chat ${chatId} (without HTML parsing)`);
      } catch (secondError) {
        console.error(`[Telegram] Failed to send even plain text message to chat ${chatId}:`, secondError);
      }
    }
  }
}

/**
 * Close the Telegram bot and clean up resources
 */
export async function closeTelegramBot(): Promise<void> {
  // Set the shutting down flag to prevent reinitialization during shutdown
  isShuttingDown = true;
  
  try {
    console.log('[Telegram] Starting cleanup of Telegram bot resources');
    
    // Close the Telegram bot
    if (telegramBot) {
      try {
        console.log('[Telegram] Closing Telegram webhook and stopping polling');
        await telegramBot.closeWebHook();
        telegramBot.stopPolling();
        telegramBot = null;
        console.log('[Telegram] Bot shut down successfully');
      } catch (botError) {
        console.error('[Telegram] Error shutting down Telegram bot:', botError);
      }
    }

    // Disconnect ngrok with multiple attempts and force kill if needed
    if (ngrokUrl) {
      try {
        console.log('[Telegram] Disconnecting ngrok tunnel');
        await ngrok.disconnect();
        console.log('[Telegram] Killing ngrok process');
        await ngrok.kill();
        ngrokUrl = null;
        console.log('[Telegram] Ngrok tunnel closed successfully');
      } catch (ngrokError) {
        console.error('[Telegram] Error disconnecting ngrok:', ngrokError);
        
        // Try again with a more aggressive approach
        try {
          console.log('[Telegram] Attempting forceful ngrok shutdown');
          // Force disconnect all tunnels
          await ngrok.disconnect();
          // Hard kill the process
          await ngrok.kill();
        } catch (finalError) {
          console.error('[Telegram] Final attempt to kill ngrok failed:', finalError);
        }
      }
    }
    
    // Reset state variables
    communicationManager = null;
    processManager = null;
    allowedChatIds = new Set();
    activeChats.clear();
    
    console.log('[Telegram] Cleanup completed');
  } catch (error) {
    console.error('[Telegram] Unexpected error during cleanup:', error);
  } finally {
    // Reset the shutting down flag
    isShuttingDown = false;
  }
}
