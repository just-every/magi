import { initializeSlackIntegration } from '../slack/index.js';
import { CEOProjectManager } from '../slack/ceo-project-manager.js';

async function main() {
  console.log('🤝 Starting CEO Project Manager (Slack)');
  const integration = await initializeSlackIntegration({ autoConnect: true });
  if (!integration) {
    console.error('❌ Slack not configured. Check .env');
    process.exit(1);
  }
  const slack = integration.getSlackManager();
  if (!slack) {
    console.error('❌ Slack manager unavailable');
    process.exit(1);
  }

  const pm = new CEOProjectManager(slack);
  pm.startScheduler(60_000);

  slack.onMessage?.('*', async (msg) => {
    try { await pm.handleMessage(msg as any); } catch (e) { console.error(e); }
  });

  const botName = (slack as any).getBotUserName?.() || (process.env.MANAGER_BOT_NAME || 'magi').replace(/^@/, '');
  console.log(`✅ CEO Project Manager is listening. Type "@${botName}: <instruction>" in Slack.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
