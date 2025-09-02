import { describe, it, expect } from 'vitest';
import { createProjectPlan, tasksDueForFollowUp, formatTasksAsSlackBlocks, updateTaskStatus, reassignTask, addTaskNote } from '../services/project-manager.js';

describe('project manager service', () => {
  it('creates a plan with human tasks', () => {
    const plan = createProjectPlan('Ship v1 beta', '#exec-updates', { defaultOwner: '@ceo', defaultCadenceHours: 6 });
    expect(plan.id).toMatch(/^proj_/);
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.tasks[0].requiresHuman).toBe(true);
    expect(plan.tasks[0].owner).toBe('@ceo');
  });

  it('returns tasks due for follow up', () => {
    const plan = createProjectPlan('Do X', '#general', { defaultCadenceHours: 1 });
    const ref = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const due = tasksDueForFollowUp(plan, ref);
    expect(due.length).toBeGreaterThan(0);
  });

  it('formats slack blocks', () => {
    const plan = createProjectPlan('Prepare launch brief', '#exec');
    const blocks = formatTasksAsSlackBlocks(plan);
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks[0]).toHaveProperty('type');
  });

  it('updates task status, owner, and notes', () => {
    const plan = createProjectPlan('Test updates', '#exec');
    const t = plan.tasks[0];
    updateTaskStatus(plan, t.id, 'in_progress');
    reassignTask(plan, t.id, '@eng-lead');
    addTaskNote(plan, t.id, 'Kickoff scheduled');
    const updated = plan.tasks[0];
    expect(updated.status).toBe('in_progress');
    expect(updated.owner).toBe('@eng-lead');
    expect(updated.notes && updated.notes.length).toBe(1);
  });
});

