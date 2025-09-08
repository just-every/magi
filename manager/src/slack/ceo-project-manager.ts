import { SlackCommunicationManager } from './slack-communication-manager.js';
import { createProjectPlan, updateTaskStatus, reassignTask, addTaskNote, tasksDueForFollowUp, bumpFollowUp, formatTasksAsSlackBlocks, refineProjectPlan, addQuickTask } from '../services/project-manager.js';
import { isAutomatable, runAutomation } from '../services/automation-runner.js';
import type { ProjectPlan } from '../types/project.js';
import fs from 'fs';
import path from 'path';

export class CEOProjectManager {
  private slack: SlackCommunicationManager;
  private plans: Map<string, ProjectPlan> = new Map();
  private scheduler?: NodeJS.Timeout;
  private storePath?: string;
  private auditPath?: string;

  constructor(slack: SlackCommunicationManager, opts?: { storePath?: string }) {
    this.slack = slack;
    this.storePath = opts?.storePath;
    // Always attempt to load from disk (uses default path if storePath not set)
    this.loadFromDisk();
    // derive audit path next to store
    const baseStore = this.storePath || this.getDefaultStorePath();
    this.auditPath = path.join(path.dirname(baseStore), 'projects.audit.jsonl');
  }

  startScheduler(intervalMs = 60_000): void {
    if (this.scheduler) return;
    this.scheduler = setInterval(async () => {
      for (const plan of this.plans.values()) {
        const due = tasksDueForFollowUp(plan);
        if (due.length === 0) continue;
        const threadTs = plan.slack.threadTs;
        for (const task of due) {
          try {
            await this.slack.sendMessage(plan.slack.channel, `⏰ Follow‑up: ${task.title} — owner ${task.owner} — status ${task.status}`, { threadTs: threadTs });
            bumpFollowUp(task);
            this.logEvent('follow_up_sent', { planId: plan.id, taskId: task.id });
          } catch {
            // ignore send errors to keep loop alive
          }
        }
      }
    }, intervalMs);
  }

  stopScheduler(): void {
    if (this.scheduler) clearInterval(this.scheduler);
    this.scheduler = undefined;
  }

  private getDefaultStorePath(): string {
    const base = process.env.MANAGER_OUTPUT_DIR || '.output';
    return path.join(base, 'projects.json');
  }

  private ensureStoreDir(): void {
    const p = this.storePath || this.getDefaultStorePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private saveToDisk(): void {
    try {
      const p = this.storePath || this.getDefaultStorePath();
      this.ensureStoreDir();
      const payload = {
        savedAt: new Date().toISOString(),
        plans: Array.from(this.plans.values()),
      };
      fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // best effort persistence
    }
  }

  private loadFromDisk(): void {
    try {
      const p = this.storePath || this.getDefaultStorePath();
      if (!fs.existsSync(p)) return;
      const raw = fs.readFileSync(p, 'utf-8');
      const data = JSON.parse(raw) as { plans?: ProjectPlan[] };
      (data.plans || []).forEach(pl => this.plans.set(pl.id, pl));
    } catch {
      // ignore load errors
    }
  }

  private logEvent(event: string, data: Record<string, any>): void {
    try {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ...data,
      });
      this.ensureStoreDir();
      fs.appendFileSync(this.auditPath || this.getDefaultStorePath() + '.log', line + '\n', 'utf-8');
    } catch {
      // noop
    }
  }

  private async autoExecuteAutomatable(plan: ProjectPlan, channel: string): Promise<number> {
    let done = 0;
    const remaining: typeof plan.tasks = [];
    for (const task of plan.tasks) {
      if (task.status === 'completed') { remaining.push(task); continue; }
      if (task.requiresHuman !== false) { remaining.push(task); continue; }
      try {
        await this.slack.sendMessage(channel, `🤖 Auto-running: ${task.title}`);
        const result = await runAutomation(plan, task);
        if (result.message) {
          await this.slack.sendMessage(channel, result.message);
        }
        if (result.files && result.files.length > 0) {
          for (const f of result.files) {
            await this.slack.uploadFile([plan.slack.channel], { file: f.content, filename: f.filename, title: f.filename, initial_comment: `Output: ${task.title}` });
          }
        }
        this.logEvent('auto_completed', { planId: plan.id, taskId: task.id, title: task.title });
        done += 1;
      } catch (e) {
        task.requiresHuman = true;
        task.reasonNotAutomatable = `Automation failed: ${String((e as Error).message || e)}`;
        task.notes = task.notes || [];
        task.notes.push(`[auto] Failed to automate at ${new Date().toISOString()}`);
        remaining.push(task);
      }
    }
    plan.tasks = remaining;
    plan.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return done;
  }

  async handleMessage(message: { channel: string; text: string; user?: string; ts?: string; thread_ts?: string; }): Promise<void> {
    const raw = (message.text || '').trim();
    const botId = (this.slack as any).getBotUserId?.() as string | undefined;
    const botNameEnv = (process.env.MANAGER_BOT_NAME || '').replace(/^@/, '');
    const botName = botNameEnv || (this.slack as any).getBotUserName?.() || 'magi';

    // Build regexes to detect a leading mention of this bot, supporting both
    // Slack mention format (<@UXXXX>) and a plain-text @name fallback.
    const mentionIdRe = botId ? new RegExp(`^<@${botId}>\s*:?\s*`, 'i') : null;
    const mentionNameRe = new RegExp(`^@${botName}\\b\s*:?\s*`, 'i');

    let txt: string | null = null;
    if (mentionIdRe && mentionIdRe.test(raw)) {
      // Normalize to historic parser by mapping leading mention to `pm` prefix
      txt = raw.replace(mentionIdRe, (m: string) => (/:\s*$/.test(m) ? 'pm: ' : 'pm '));
    } else if (mentionNameRe.test(raw)) {
      txt = raw.replace(mentionNameRe, (m: string) => (m.includes(':') ? 'pm: ' : 'pm '));
    }

    // If the message doesn't start with an @magi (or bot) mention, ignore it.
    if (!txt) {
      return;
    }
    // Create project: "pm: <title or instruction>"
    if (/^pm:\s*/i.test(txt)) {
      const instruction = txt.replace(/^pm:\s*/i, '').trim();
      const plan = createProjectPlan(instruction, message.channel, { defaultOwner: message.user ? `<@${message.user}>` : '@owner-needed' });
      this.plans.set(plan.id, plan);
      await this.slack.sendMessage(message.channel, `📌 Project created: ${plan.title}`);
      // Immediately refine into concrete tasks and auto-execute what the manager can do
      await this.slack.sendMessage(message.channel, `🛠️ Refining plan and executing automatable tasks...`);
      try {
        await refineProjectPlan(plan, { defaultOwner: message.user ? `<@${message.user}>` : undefined });
        const autoCount = await this.autoExecuteAutomatable(plan, message.channel);
        const blocks = formatTasksAsSlackBlocks(plan);
        await this.slack.sendMessage(message.channel, `✅ Plan ready. Auto-completed ${autoCount} task(s). Remaining human tasks:`, { blocks });
      } catch (e) {
        const blocks = formatTasksAsSlackBlocks(plan);
        await this.slack.sendMessage(message.channel, `⚠️ Plan refinement failed; showing initial task scaffold.`, { blocks });
      }
      plan.slack.threadTs = message.ts;
      this.saveToDisk();
      this.logEvent('project_created', { planId: plan.id, channel: message.channel, user: message.user, title: plan.title });
      return;
    }

    // List projects anywhere: "@magi projects"
    if (/^pm\s+projects\b/i.test(txt)) {
      const plans = Array.from(this.plans.values());
      if (plans.length === 0) {
        await this.slack.sendMessage(message.channel, `No projects yet. Start one with: @${botName}: <instruction>`);
        return;
      }
      const blocks: any[] = [{ type: 'section', text: { type: 'mrkdwn', text: '*Active Projects*' } }, { type: 'divider' }];
      plans.forEach((p, i) => {
        const open = p.tasks.filter(t => t.status !== 'completed').length;
        const total = p.tasks.length;
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `*${i + 1}. ${p.title}*  — ID: ${p.id}\nchannel: ${p.slack.channel}  |  open tasks: *${open}/${total}*` }
        });
      });
      await this.slack.sendMessage(message.channel, 'Projects:', { blocks });
      this.logEvent('projects_listed', { channel: message.channel, count: plans.length });
      return;
    }

    // Help / Commands: "@magi help" | "@magi commands"
    if (/^pm\s+(help|commands)\b/i.test(txt)) {
      const blocks: any[] = [
        { type: 'section', text: { type: 'mrkdwn', text: '*CEO Project Manager — Commands*' } },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ': <instruction>` — Create a project from an instruction' } },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ' status [<project-id>]` — Show status in channel' } },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ' projects` — List all projects' } },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ' plan [<project-id>]` — Refine tasks; AI auto-runs automatable work' } },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ' recreate [<project-id>]` — Re-create tasks from instruction; AI auto-runs automatable' } },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ' add <text>` — Add a quick task' } },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ' can <#> [<project-id>]` — Check if task is automatable' } },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ' auto <#> [<project-id>]` — Run AI automation for a task' } },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ' done <#> [<project-id>]` — Mark task complete' } },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ' owner <#> @who [<project-id>]` — Reassign owner' } },
        { type: 'section', text: { type: 'mrkdwn', text: '`@' + botName + ' note <#> <text> [<project-id>]` — Add a note' } },
        { type: 'divider' },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'Persistence: `.output/projects.json` (override with MANAGER_PM_STORE / MANAGER_OUTPUT_DIR)' }] },
      ];
      await this.slack.sendMessage(message.channel, 'Available commands:', { blocks });
      return;
    }

    // Plan/refine concrete tasks for a project
    // @magi plan         -> refine the single project in channel
    // @magi plan <id>    -> refine that project
    if (/^pm\s+plan(\s+\S+)?$/i.test(txt)) {
      const idMatch = txt.match(/^pm\s+plan\s+(\S+)$/i);
      const selId = idMatch?.[1];
      let target: ProjectPlan | undefined;
      const inChannel = [...this.plans.values()].filter(p => p.slack.channel === message.channel);
      if (selId) target = inChannel.find(p => p.id === selId) || this.plans.get(selId);
      if (!target && inChannel.length === 1) target = inChannel[0];
      if (!target) {
        await this.slack.sendMessage(message.channel, `Project not found. Use ` + '`@' + botName + ' projects` or `@' + botName + ' plan <project-id>`.');
        return;
      }
      await this.slack.sendMessage(message.channel, `🛠️ Refining plan for ${target.title}... this may take ~20–40s.`);
      try {
        await refineProjectPlan(target);
        const autoCount = await this.autoExecuteAutomatable(target, message.channel);
        this.saveToDisk();
        const blocks = formatTasksAsSlackBlocks(target);
        await this.slack.sendMessage(message.channel, `Updated plan for ${target.title}. Auto-completed ${autoCount} task(s). Remaining human tasks:`, { blocks });
        this.logEvent('plan_refined', { planId: target.id });
      } catch (e) {
        await this.slack.sendMessage(message.channel, `❌ Failed to refine plan: ${String((e as Error).message || e)}`);
      }
      return;
    }

    // Re-create tasks for an existing project (aliases)
    // @magi recreate [<id>]  |  @magi retask [<id>]  |  @magi reset tasks [<id>]
    if (/^pm\s+(recreate|retask|reset\s+tasks)(\s+\S+)?$/i.test(txt)) {
      const idMatch = txt.match(/^pm\s+(?:recreate|retask|reset\s+tasks)\s+(\S+)$/i);
      const selId = idMatch?.[1];
      let target: ProjectPlan | undefined;
      const inChannel = [...this.plans.values()].filter(p => p.slack.channel === message.channel);
      if (selId) target = inChannel.find(p => p.id === selId) || this.plans.get(selId);
      if (!target && inChannel.length === 1) target = inChannel[0];
      if (!target) {
        await this.slack.sendMessage(message.channel, `Project not found. Use ` + '`@' + botName + ' projects` or `@' + botName + ' recreate <project-id>`.');
        return;
      }
      await this.slack.sendMessage(message.channel, `♻️ Re-creating tasks for ${target.title}... this may take ~20–40s.`);
      try {
        await refineProjectPlan(target);
        const autoCount = await this.autoExecuteAutomatable(target, message.channel);
        this.saveToDisk();
        const blocks = formatTasksAsSlackBlocks(target);
        await this.slack.sendMessage(message.channel, `Recreated tasks for ${target.title}. Auto-completed ${autoCount} task(s). Remaining human tasks:`, { blocks });
        this.logEvent('tasks_recreated', { planId: target.id });
      } catch (e) {
        await this.slack.sendMessage(message.channel, `❌ Failed to re-create tasks: ${String((e as Error).message || e)}`);
      }
      return;
    }

    // Quick add task: @magi add <text>
    if (/^pm\s+add\s+.+/i.test(txt)) {
      const title = txt.replace(/^pm\s+add\s+/i, '').trim();
      const inChannel = [...this.plans.values()].filter(p => p.slack.channel === message.channel);
      if (inChannel.length === 0) {
        await this.slack.sendMessage(message.channel, `No project in this channel. Start one with ` + '`@' + botName + ': <instruction>` or use `@' + botName + ' add` in the project channel.');
        return;
      }
      const target = inChannel.length === 1 ? inChannel[0] : inChannel[0]; // simple heuristic: first project
      addQuickTask(target, title, message.user ? `<@${message.user}>` : undefined);
      this.saveToDisk();
      const blocks = formatTasksAsSlackBlocks(target);
      await this.slack.sendMessage(message.channel, `➕ Added: ${title}`, { blocks });
      this.logEvent('task_added', { planId: target.id, title });
      return;
    }

    // Can we automate this? @magi can <#> [<project-id>]
    if (/^pm\s+can\s+.+/i.test(txt)) {
      const tokens = txt.split(/\s+/);
      const possibleIndex = tokens.find(t => /^\d+$/.test(t));
      const possibleId = tokens.find(t => /^proj_/.test(t));
      const inChannel = [...this.plans.values()].filter(p => p.slack.channel === message.channel);
      const target = possibleId ? inChannel.find(p => p.id === possibleId) : (inChannel.length === 1 ? inChannel[0] : undefined);
      if (!target || !possibleIndex) {
        await this.slack.sendMessage(message.channel, 'Usage: @' + botName + ' can <#> [<project-id>]');
        return;
      }
      const idx = Number(possibleIndex) - 1;
      const task = target.tasks[idx];
      if (!task) { await this.slack.sendMessage(message.channel, 'Task not found.'); return; }
      const can = isAutomatable(task) && task.status !== 'completed';
      await this.slack.sendMessage(message.channel, can ? `🤖 Yes — I can run task ${possibleIndex} (${task.title}). Use: @${botName} auto ${possibleIndex}` : `🙅 Not safe to automate task ${possibleIndex} right now.`);
      return;
    }

    // Run automation: @magi auto <#> [<project-id>]  | aliases: @magi run
    if (/^pm\s+(auto|run)\s+.+/i.test(txt)) {
      const tokens = txt.split(/\s+/);
      const possibleIndex = tokens.find(t => /^\d+$/.test(t));
      const possibleId = tokens.find(t => /^proj_/.test(t));
      const inChannel = [...this.plans.values()].filter(p => p.slack.channel === message.channel);
      const target = possibleId ? inChannel.find(p => p.id === possibleId) : (inChannel.length === 1 ? inChannel[0] : undefined);
      if (!target || !possibleIndex) {
        await this.slack.sendMessage(message.channel, 'Usage: @' + botName + ' auto <#> [<project-id>]');
        return;
      }
      const idx = Number(possibleIndex) - 1;
      const task = target.tasks[idx];
      if (!task) { await this.slack.sendMessage(message.channel, 'Task not found.'); return; }
      if (!isAutomatable(task)) { await this.slack.sendMessage(message.channel, `Task ${possibleIndex} is not automatable.`); return; }

      await this.slack.sendMessage(message.channel, `🤖 Running task ${possibleIndex}: ${task.title}...`);
      try {
        const result = await runAutomation(target, task);
        if (result.message) {
          await this.slack.sendMessage(message.channel, result.message);
        }
        if (result.files && result.files.length > 0) {
          for (const f of result.files) {
            await this.slack.uploadFile([target.slack.channel], { file: f.content, filename: f.filename, title: f.filename, initial_comment: `Output for task ${possibleIndex}: ${task.title}` });
          }
        }
        updateTaskStatus(target, task.id, 'completed');
        addTaskNote(target, task.id, 'Auto-completed by Manager AI');
        this.saveToDisk();
        await this.slack.sendMessage(message.channel, `✅ Completed task ${possibleIndex}: ${task.title}`);
      } catch (e) {
        await this.slack.sendMessage(message.channel, `❌ Automation failed: ${String((e as Error).message || e)}`);
      }
      return;
    }

    // Channel-level status: "@magi status [<project-id>]"
    const statusMatch = txt.match(/^pm\s+status(?:\s+(\S+))?$/i);
    if (statusMatch) {
      let target: ProjectPlan | undefined;
      const sel = statusMatch[1];
      if (sel) {
        target = [...this.plans.values()].find(p => p.id === sel);
      } else {
        const inChannel = [...this.plans.values()].filter(p => p.slack.channel === message.channel);
        if (inChannel.length === 1) target = inChannel[0];
        if (inChannel.length > 1) {
          // Disambiguate
          const blocks: any[] = [{ type: 'section', text: { type: 'mrkdwn', text: '*Multiple projects in this channel*\nUse `@' + botName + ' status <project-id>`' } }, { type: 'divider' }];
          inChannel.forEach((p, i) => {
            const open = p.tasks.filter(t => t.status !== 'completed').length;
            const total = p.tasks.length;
            blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${i + 1}. ${p.title}* — ID: ${p.id}  |  open: *${open}/${total}*` } });
          });
          await this.slack.sendMessage(message.channel, 'Select a project:', { blocks });
          return;
        }
      }

      if (!target) {
        await this.slack.sendMessage(message.channel, `Project not found. Use ` + '`@' + botName + ' projects` to list all, or `@' + botName + ' status <project-id>`.');
        return;
      }

      const blocks = formatTasksAsSlackBlocks(target);
      // Post status to the channel (not the thread)
      await this.slack.sendMessage(target.slack.channel, `Status for ${target.title}:`, { blocks });
      this.logEvent('status_posted', { planId: target.id });
      return;
    }

    // Channel-level complete/owner/note with optional project-id disambiguation
    // Supported:
    //  - @magi done <#>
    //  - @magi done <project-id> <#>  OR  @magi done <#> <project-id>
    //  - @magi owner <#> @who [<project-id>]
    //  - @magi note <#> <text> [<project-id>]
    const tokens = txt.split(/\s+/);
    if (tokens.length >= 3 && tokens[0].toLowerCase() === 'pm') {
      const cmd = tokens[1].toLowerCase();
      if (cmd === 'done' || cmd === 'owner' || cmd === 'note') {
        const inChannel = [...this.plans.values()].filter(p => p.slack.channel === message.channel);

        const possibleId = tokens.slice(2).find(t => /^proj_/.test(t));
        const possibleIndex = tokens.slice(2).find(t => /^\d+$/.test(t));

        let target: ProjectPlan | undefined;
        if (possibleId) target = inChannel.find(p => p.id === possibleId);
        if (!target && inChannel.length === 1) target = inChannel[0];

        if (!target) {
          if (inChannel.length > 1) {
            const blocks: any[] = [{ type: 'section', text: { type: 'mrkdwn', text: '*Multiple projects in this channel*\nAdd the project id to your command, e.g., `@' + botName + ' done 1 proj_abcd1234`' } }, { type: 'divider' }];
            inChannel.forEach((p, i) => {
              const open = p.tasks.filter(t => t.status !== 'completed').length;
              blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${i + 1}. ${p.title}* — ID: ${p.id}  |  open: *${open}/${p.tasks.length}*` } });
            });
            await this.slack.sendMessage(message.channel, 'Select a project:', { blocks });
            return;
          }
          // No project in channel
          // fall through to thread-based handling below (if any)
        } else if (possibleIndex) {
          const idx = Number(possibleIndex) - 1;
          if (!target.tasks[idx]) {
            await this.slack.sendMessage(message.channel, `Task ${possibleIndex} not found in ${target.title}.`);
            return;
          }
          if (cmd === 'done') {
            updateTaskStatus(target, target.tasks[idx].id, 'completed');
            await this.slack.sendMessage(message.channel, `✅ Marked task ${possibleIndex} completed for ${target.title}.`);
            this.saveToDisk();
            this.logEvent('task_completed', { planId: target.id, taskIndex: idx + 1, taskId: target.tasks[idx].id });
            return;
          }
          if (cmd === 'owner') {
            // owner arg is the first token that starts with @ after the index
            const at = tokens.slice(2).find(t => /^@/.test(t));
            if (!at) {
              await this.slack.sendMessage(message.channel, 'Please specify an owner, e.g., `@' + botName + ' owner 2 @eng-lead`');
              return;
            }
            reassignTask(target, target.tasks[idx].id, at);
            await this.slack.sendMessage(message.channel, `👤 Reassigned task ${possibleIndex} to ${at} for ${target.title}.`);
            this.saveToDisk();
            this.logEvent('task_reassigned', { planId: target.id, taskIndex: idx + 1, taskId: target.tasks[idx].id, owner: at });
            return;
          }
          if (cmd === 'note') {
            // text after the index (and optional id) that doesn't look like a proj_ id
            const textStart = tokens.findIndex(t => t === possibleIndex);
            const after = tokens.slice(textStart + 1).filter(t => !/^proj_/.test(t));
            const noteText = after.join(' ').trim();
            if (!noteText) {
              await this.slack.sendMessage(message.channel, 'Please include a note, e.g., `@' + botName + ' note 3 kickoff scheduled`');
              return;
            }
            addTaskNote(target, target.tasks[idx].id, noteText);
            await this.slack.sendMessage(message.channel, `🗒️ Added note to task ${possibleIndex} for ${target.title}.`);
            this.saveToDisk();
            this.logEvent('task_note_added', { planId: target.id, taskIndex: idx + 1, taskId: target.tasks[idx].id });
            return;
          }
        }
      }
    }

    // Route thread commands: must reference a known plan thread
    const plan = [...this.plans.values()].find(p => p.slack.channel === message.channel && (p.slack.threadTs === (message.thread_ts || message.ts)));
    if (!plan) return;

    if (/^pm\s+status/i.test(txt)) {
      const blocks = formatTasksAsSlackBlocks(plan);
      // Post status to the channel (not the thread)
      await this.slack.sendMessage(plan.slack.channel, 'Current status:', { blocks });
      this.saveToDisk();
      this.logEvent('status_posted', { planId: plan.id });
      return;
    }

    let m: RegExpMatchArray | null;
    if ((m = txt.match(/^pm\s+done\s+(\d+)/i))) {
      const idx = Number(m[1]) - 1;
      if (plan.tasks[idx]) updateTaskStatus(plan, plan.tasks[idx].id, 'completed');
      await this.slack.sendMessage(plan.slack.channel, `✅ Marked task ${m[1]} completed.`);
      this.saveToDisk();
      this.logEvent('task_completed', { planId: plan.id, taskIndex: idx + 1, taskId: plan.tasks[idx]?.id });
      return;
    }

    if ((m = txt.match(/^pm\s+owner\s+(\d+)\s+(\S+)/i))) {
      const idx = Number(m[1]) - 1;
      if (plan.tasks[idx]) reassignTask(plan, plan.tasks[idx].id, m[2]);
      await this.slack.sendMessage(plan.slack.channel, `👤 Reassigned task ${m[1]} to ${m[2]}.`);
      this.saveToDisk();
      this.logEvent('task_reassigned', { planId: plan.id, taskIndex: idx + 1, taskId: plan.tasks[idx]?.id, owner: m[2] });
      return;
    }

    if ((m = txt.match(/^pm\s+note\s+(\d+)\s+(.+)/i))) {
      const idx = Number(m[1]) - 1;
      if (plan.tasks[idx]) addTaskNote(plan, plan.tasks[idx].id, m[2]);
      await this.slack.sendMessage(plan.slack.channel, `🗒️ Added note to task ${m[1]}.`);
      this.saveToDisk();
      this.logEvent('task_note_added', { planId: plan.id, taskIndex: idx + 1, taskId: plan.tasks[idx]?.id });
      return;
    }
  }
}
