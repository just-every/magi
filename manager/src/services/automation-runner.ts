import type { HumanTask, ProjectPlan } from '../types/project.js';
import { runSimpleManagerAgent } from '../agents/simple-manager-agent.js';
import { quick_llm_call } from '../utils/llm-utils.js';
import { Agent, type ResponseInput } from '@just-every/ensemble';

export interface AutomationResult {
  ok: boolean;
  message: string;
  files?: { filename: string; content: Buffer }[];
}

export function isAutomatable(task: HumanTask): boolean {
  if (task.requiresHuman === false) return true;
  const s = `${task.title} ${task.description}`.toLowerCase();
  const keywords = [
    'draft', 'write', 'summar', 'analy', 'matrix', 'table', 'report', 'generate', 'compile'
  ];
  return keywords.some(k => s.includes(k));
}

export async function runAutomation(plan: ProjectPlan, task: HumanTask): Promise<AutomationResult> {
  const title = task.title.toLowerCase();

  // 1) Executive summary / analysis
  if (title.includes('executive') || title.includes('summary') || title.includes('analysis')) {
    const text = await runSimpleManagerAgent(`${plan.instruction} — Provide an executive summary focused on market & technical landscape.` as any, 'executive_summary' as any);
    return { ok: true, message: text };
  }

  // 2) Competitor matrix
  if (title.includes('competitor') || title.includes('matrix') || title.includes('table')) {
    const system = `You produce compact CSV tables with a header row. No prose, just CSV.`;
    const user = `Create a competitor comparison matrix for: ${plan.instruction}
Columns: Company, Product, Price, Key Features, Strengths, Gaps
Include 6–10 rows based on general industry knowledge (note that data may be approximate).`;
    const agent = new Agent({ name: 'CSVBot', modelClass: 'standard', instructions: system, tools: [] });
    const input: ResponseInput = [ { type: 'message', role: 'user', content: user } ];
    const csv = await quick_llm_call(input, agent);
    const buf = Buffer.from(csv, 'utf8');
    return { ok: true, message: 'Generated competitor matrix (CSV).', files: [{ filename: 'competitor-matrix.csv', content: buf }] };
  }

  // Default: attempt narrative draft
  const fallback = await runSimpleManagerAgent(`Draft content for task: ${task.title}\n\nContext: ${plan.instruction}`, 'executive_summary' as any);
  return { ok: true, message: fallback };
}

