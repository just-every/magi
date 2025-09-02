import { v4 as uuidv4 } from 'uuid';
import type { ProjectPlan, HumanTask, PlanGenerationOptions } from '../types/project.js';
import fs from 'fs';
import path from 'path';
import { quick_llm_call } from '../utils/llm-utils.js';
import { Agent, type ResponseInput } from '@just-every/ensemble';

function nowIso(): string {
  return new Date().toISOString();
}

export function createProjectPlan(
  instruction: string,
  channel: string,
  opts: PlanGenerationOptions = {}
): ProjectPlan {
  const id = `proj_${uuidv4().slice(0, 8)}`;
  const createdAt = nowIso();
  const updatedAt = createdAt;
  const defaultOwner = opts.defaultOwner ?? '@owner-needed';
  const cadence = Math.max(1, opts.defaultCadenceHours ?? 24);

  const baseTasks: Array<Pick<HumanTask, 'title' | 'description' | 'reasonNotAutomatable'>> = [
    {
      title: 'Clarify success criteria',
      description: 'Confirm scope, constraints, stakeholders, and definition of done for the instruction.',
      reasonNotAutomatable: 'Requires stakeholder alignment and approvals.'
    },
    {
      title: 'Collect inputs and assets',
      description: 'Gather specs, credentials, data sources, and any existing materials.',
      reasonNotAutomatable: 'Human systems access, curation, and judgment required.'
    },
    {
      title: 'Decide owners and dates',
      description: 'Assign workstream owners and target dates across teams.',
      reasonNotAutomatable: 'Org context + human capacity planning.'
    },
    {
      title: 'Execute external steps',
      description: 'Perform steps the AI cannot: vendor calls, legal review, budget approval, production changes with risk.',
      reasonNotAutomatable: 'Real‑world action, legal, or system privileges needed.'
    },
    {
      title: 'Report status',
      description: 'Post progress updates, blockers, and decisions to the project thread.',
      reasonNotAutomatable: 'Human confirmation of progress and risks.'
    }
  ];

  const tasks: HumanTask[] = baseTasks.map((t, idx) => {
    const created = nowIso();
    const due = new Date(Date.now() + (idx + 1) * 24 * 60 * 60 * 1000); // stagger daily by default
    const nextFollow = new Date(Date.now() + cadence * 60 * 60 * 1000);
    return {
      id: `${id}_t${idx + 1}`,
      title: t.title,
      description: t.description,
      owner: defaultOwner,
      status: 'pending',
      dueAt: due.toISOString(),
      createdAt: created,
      updatedAt: created,
      requiresHuman: true,
      reasonNotAutomatable: t.reasonNotAutomatable,
      followUpEveryHours: cadence,
      nextFollowUpAt: nextFollow.toISOString(),
      notes: []
    };
  });

  return {
    id,
    title: instruction.split('\n')[0].slice(0, 120) || 'Project',
    instruction,
    createdAt,
    updatedAt,
    tasks,
    slack: { channel }
  };
}

export function updateTaskStatus(plan: ProjectPlan, taskId: string, status: HumanTask['status']): ProjectPlan {
  const idx = plan.tasks.findIndex(t => t.id === taskId);
  if (idx >= 0) {
    plan.tasks[idx].status = status;
    plan.tasks[idx].updatedAt = nowIso();
  }
  plan.updatedAt = nowIso();
  return plan;
}

export function reassignTask(plan: ProjectPlan, taskId: string, owner: string): ProjectPlan {
  const task = plan.tasks.find(t => t.id === taskId);
  if (task) {
    task.owner = owner;
    task.updatedAt = nowIso();
  }
  plan.updatedAt = nowIso();
  return plan;
}

export function addTaskNote(plan: ProjectPlan, taskId: string, note: string): ProjectPlan {
  const task = plan.tasks.find(t => t.id === taskId);
  if (task) {
    task.notes = task.notes || [];
    task.notes.push(`[${nowIso()}] ${note}`);
    task.updatedAt = nowIso();
  }
  plan.updatedAt = nowIso();
  return plan;
}

export function tasksDueForFollowUp(plan: ProjectPlan, ref: Date = new Date()): HumanTask[] {
  const now = ref.getTime();
  return plan.tasks.filter(t =>
    t.requiresHuman && t.status !== 'completed' && !!t.nextFollowUpAt && new Date(t.nextFollowUpAt).getTime() <= now
  );
}

export function bumpFollowUp(task: HumanTask): void {
  const hours = Math.max(1, task.followUpEveryHours ?? 24);
  const next = new Date(Date.now() + hours * 60 * 60 * 1000);
  task.nextFollowUpAt = next.toISOString();
  task.updatedAt = nowIso();
}

export function formatTasksAsSlackBlocks(plan: ProjectPlan): any[] {
  function trimList(list: string[] | undefined, n = 4): string[] {
    if (!list || list.length === 0) return [];
    return list.slice(0, n);
  }

  function mdList(prefix: string, items: string[] | undefined): string {
    const arr = trimList(items, 5);
    if (arr.length === 0) return '';
    return `\n*${prefix}:*\n• ${arr.join('\n• ')}`;
  }

  const header = {
    type: 'section',
    text: { type: 'mrkdwn', text: `*${plan.title}* — ID: ${plan.id}` }
  };
  const divider = { type: 'divider' };

  const items = plan.tasks.map((t, i) => {
    const details = t.details || {};
    const ac = details.acceptanceCriteria || (t.notes || []).find(n => n.startsWith('AC:'))?.replace(/^AC:\s*/, '');
    const brief = details.brief || t.description;
    // Compose a compact, information-dense block for each task
    let text = `*${i + 1}. ${t.title}* — owner: ${t.owner} ${t.requiresHuman ? '' : '🤖'}\n` +
      `status: *${t.status}*  | due: ${t.dueAt ?? 'n/a'}`;
    if (brief) text += `\n*Brief:* ${brief}`;
    if (ac) text += `\n*Acceptance:* ${ac}`;
    text += mdList('Subtasks', details.subtasks);
    text += mdList('Deliverables', details.deliverables);
    const checklistText = mdList('Checklist', details.checklist);
    if (checklistText) text += checklistText;
    const resourcesText = mdList('Resources', details.resources);
    if (resourcesText) text += resourcesText;
    const templatesText = mdList('Templates', details.templates);
    if (templatesText) text += templatesText;
    text += `\n*Why human:* ${t.reasonNotAutomatable}`;

    // Slack block text must be <= 3000 chars; enforce safety margin
    if (text.length > 2900) text = text.slice(0, 2850) + ' …';

    return { type: 'section', text: { type: 'mrkdwn', text } };
  });

  const help = {
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: 'Commands: `pm done <#>` · `pm owner <#> @who` · `pm note <#> <text>` · `pm status`'
    }]
  };
  return [header, divider, ...items, divider, help];
}

function readManagerMd(): string | undefined {
  try {
    const p = path.resolve(process.cwd(), 'manager.md');
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
  } catch {}
  return undefined;
}

export async function generateConcreteHumanTasks(
  instruction: string,
  context?: { managerMd?: string; defaultOwner?: string; defaultCadenceHours?: number }
): Promise<HumanTask[]> {
  const managerMd = context?.managerMd ?? readManagerMd() ?? '';
  const owner = context?.defaultOwner ?? '@owner-needed';
  const cadence = Math.max(1, context?.defaultCadenceHours ?? 24);

  const system = `You are a pragmatic COO/PM. Break the instruction into concrete, execution‑ready tasks with rich detail. Also mark whether each task is automatable by an AI agent.
Constraints:
- Output STRICT JSON array only. No prose, no backticks.
- Each item object MUST include: {
   "title", "description", "owner", "acceptanceCriteria", "daysFromNow", "automatable",
   "details": {
     "brief"?,
     "subtasks"?,        // 4–8 atomic bullets starting with verbs
     "deliverables"?,    // concrete files/posts/decisions
     "checklist"?,       // QA/review checks
     "resources"?,       // links/systems/people
     "templates"?        // copy-ready snippets or question lists when relevant
   }
 }
- daysFromNow is integer 0..30.
- Make details specific to the task domain: e.g., for research include question lists and QC; for launches include channel list + copy; for engineering include acceptance tests; for legal include approvals + signatories.
`;
  const user = `Instruction:
${instruction}

Company context (from manager.md):
${managerMd.slice(0, 6000)}

Produce 5–10 tasks. Be concrete about what to do, where, and with whom. Include acceptance criteria and rich details as specified.`;

  const agent = new Agent({ name: 'TaskPlanner', modelClass: 'standard', instructions: system, tools: [] });
  const input: ResponseInput = [
    { type: 'message', role: 'user', content: user }
  ];

  let parsed: any = [];
  try {
    const json = await quick_llm_call(input, agent);
    parsed = JSON.parse(json);
  } catch {
    // Fallback to a minimal set
    parsed = [
      { title: 'Draft success criteria', description: 'Write a one-pager with scope, KPIs, constraints.', owner, reasonNotAutomatable: 'Stakeholder alignment required', acceptanceCriteria: 'One-pager approved in Slack thread', daysFromNow: 0 },
      { title: 'Schedule kickoff', description: 'Book 30-min call with eng/design/community leads.', owner, reasonNotAutomatable: 'Calendar + team coordination', acceptanceCriteria: 'Invite sent, 3+ leads accepted', daysFromNow: 1 },
    ];
  }

  const now = Date.now();
  const tasks: HumanTask[] = (Array.isArray(parsed) ? parsed : [])
    .slice(0, 12)
    .map((t: any, idx: number) => {
      const created = new Date();
      const due = new Date(now + ((Number.isInteger(t.daysFromNow) ? t.daysFromNow : idx + 1) * 24 * 60 * 60 * 1000));
      return {
        id: `t_${uuidv4().slice(0, 8)}`,
        title: String(t.title || `Task ${idx + 1}`),
        description: String(t.description || ''),
        owner: String(t.owner || owner),
        status: 'pending',
        dueAt: due.toISOString(),
        createdAt: created.toISOString(),
        updatedAt: created.toISOString(),
        requiresHuman: !(t?.automatable === true),
        reasonNotAutomatable: t?.automatable === true ? 'Automatable by Manager AI' : String(t.reasonNotAutomatable || 'Human judgment/action needed'),
        followUpEveryHours: cadence,
        nextFollowUpAt: new Date(now + cadence * 60 * 60 * 1000).toISOString(),
        notes: t.acceptanceCriteria ? [ `AC: ${String(t.acceptanceCriteria)}` ] : [],
        details: {
          brief: t?.details?.brief || undefined,
          acceptanceCriteria: t?.acceptanceCriteria ? String(t.acceptanceCriteria) : undefined,
          subtasks: Array.isArray(t?.details?.subtasks) ? t.details.subtasks.map(String) : undefined,
          deliverables: Array.isArray(t?.details?.deliverables) ? t.details.deliverables.map(String) : undefined,
          checklist: Array.isArray(t?.details?.checklist) ? t.details.checklist.map(String) : undefined,
          resources: Array.isArray(t?.details?.resources) ? t.details.resources.map(String) : undefined,
          templates: Array.isArray(t?.details?.templates) ? t.details.templates.map(String) : undefined,
        }
      } as HumanTask;
    });

  return tasks;
}

export async function refineProjectPlan(plan: ProjectPlan, opts?: { defaultOwner?: string; defaultCadenceHours?: number }): Promise<ProjectPlan> {
  const tasks = await generateConcreteHumanTasks(plan.instruction, {
    managerMd: readManagerMd(),
    defaultOwner: opts?.defaultOwner ?? plan.tasks[0]?.owner ?? '@owner-needed',
    defaultCadenceHours: opts?.defaultCadenceHours ?? plan.tasks[0]?.followUpEveryHours ?? 24,
  });
  plan.tasks = tasks;
  plan.updatedAt = nowIso();
  return plan;
}

export function addQuickTask(plan: ProjectPlan, title: string, owner?: string, daysFromNow = 2): ProjectPlan {
  const created = nowIso();
  const due = new Date(Date.now() + Math.max(0, daysFromNow) * 24 * 60 * 60 * 1000).toISOString();
  const task: HumanTask = {
    id: `t_${uuidv4().slice(0, 8)}`,
    title,
    description: title,
    owner: owner || plan.tasks[0]?.owner || '@owner-needed',
    status: 'pending',
    dueAt: due,
    createdAt: created,
    updatedAt: created,
    requiresHuman: false,
    reasonNotAutomatable: 'Automatable by Manager AI',
    followUpEveryHours: plan.tasks[0]?.followUpEveryHours ?? 24,
    nextFollowUpAt: new Date(Date.now() + (plan.tasks[0]?.followUpEveryHours ?? 24) * 60 * 60 * 1000).toISOString(),
    notes: []
  };
  plan.tasks.push(task);
  plan.updatedAt = nowIso();
  return plan;
}
