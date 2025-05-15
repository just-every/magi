/**
 * Pull Request Event types
 *
 * Represents records of git operations (successful merges, failures, reverts)
 */
import { Metrics } from './index';

// Resolution types for PR failures
export type PRResolution = 'merged' | 'ignored' | 'retry_failed';

export type PRStatus = 'merged' | 'failed' | 'resolved' | 'reverted';

export interface PullRequestEvent {
    id: number;
    process_id: string;
    project_id: string;
    branch_name: string;
    commit_msg: string;
    metrics?: Metrics; // Optional since it might not be available at all points
    error_message: string;
    merge_commit_sha: string | null;
    status: PRStatus;
    created_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    resolution: PRResolution;
}

export interface PullRequestEventInput {
    processId: string;
    projectId: string;
    branchName: string;
    commitMsg: string;
    metrics?: Metrics;
    errorMessage?: string; // Now optional since successful merges won't have errors
    mergeCommitSha?: string; // SHA for successful merges
    status: PRStatus;
}
