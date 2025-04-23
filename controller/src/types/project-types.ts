/**
 * Project-related type definitions for the MAGI System
 */
import { StreamEvent } from '../types';

// Project event with metadata support
export interface ProjectCreateEvent extends StreamEvent {
    type: 'project_create';
    project: string;
    description?: string;
    overview?: string;
}

export interface ProjectUpdateDescriptionEvent extends StreamEvent {
    type: 'project_update_description';
    project: string;
    description: string;
}

export interface ProjectUpdateOverviewEvent extends StreamEvent {
    type: 'project_update_overview';
    project: string;
    overview: string;
}

export interface ProjectAddHistoryEvent extends StreamEvent {
    type: 'project_add_history';
    project: string;
    action: string;
    taskId?: string;
}

export interface ProjectGetDetailsEvent extends StreamEvent {
    type: 'project_get_details';
    project: string;
}

export interface ProjectReadyEvent extends StreamEvent {
    type: 'project_ready';
    project: string;
}

// Union type for all project events
export type ProjectEvent =
    | ProjectCreateEvent
    | ProjectReadyEvent
    | ProjectUpdateDescriptionEvent
    | ProjectUpdateOverviewEvent
    | ProjectAddHistoryEvent
    | ProjectGetDetailsEvent;
