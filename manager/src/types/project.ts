export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed';

export interface HumanTask {
  id: string;
  title: string;
  description: string;
  owner: string; // Slack handle or name
  status: TaskStatus;
  dueAt?: string; // ISO string
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  requiresHuman: boolean;
  reasonNotAutomatable: string;
  followUpEveryHours?: number;
  nextFollowUpAt?: string; // ISO string
  notes?: string[];
  // Optional rich task details for higher-fidelity execution in Slack
  details?: {
    brief?: string; // one-paragraph purpose/goal
    acceptanceCriteria?: string; // success definition
    subtasks?: string[]; // concrete steps to execute
    deliverables?: string[]; // expected outputs
    checklist?: string[]; // QA or review checks
    resources?: string[]; // links, owners, systems
    templates?: string[]; // copy-ready snippets or outlines
  };
}

export interface ProjectPlan {
  id: string;
  title: string;
  instruction: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  tasks: HumanTask[];
  slack: {
    channel: string;
    threadTs?: string;
  };
}

export interface PlanGenerationOptions {
  defaultOwner?: string;
  defaultCadenceHours?: number;
}
