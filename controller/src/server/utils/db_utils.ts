import { getDB } from './db.js';
import { Project } from '../../types/index';
import { ProjectType } from '../../types/shared-types';

export async function getProject(project_id: string): Promise<Project | null> {
    const db = await getDB();
    try {
        const result = await db.query(
            'SELECT * FROM projects WHERE project_id = $1',
            [project_id]
        );
        if (result.rows.length > 0) {
            return result.rows[0];
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting project:', error);
        return null;
    } finally {
        db.release();
    }
}

export async function updateProject(project: Project): Promise<void> {
    const db = await getDB();
    try {
        await db.query(
            'UPDATE projects SET is_ready = $2 WHERE project_id = $1',
            [project.project_id, project.is_ready]
        );
    } catch (error) {
        console.error('Error updating project:', error);
    } finally {
        db.release();
    }
}

/**
 * Ensure a project stub exists in the database
 * @param project_id The ID of the project to create if it doesn't exist
 * @param is_generated Whether this is a generated project or external project (default: false)
 * @returns Promise resolving to true if project was created, false if it already existed
 */
export async function ensureProjectStub(
    project_id: string,
    is_generated = false,
    projectType: ProjectType = 'plain'
): Promise<boolean> {
    const db = await getDB();
    try {
        // Check if project already exists
        const { rows } = await db.query(
            'SELECT 1 FROM projects WHERE project_id = $1 LIMIT 1',
            [project_id]
        );

        // If project exists, return false
        if (rows.length > 0) {
            return false;
        }

        // Insert new project stub
        await db.query(
            `INSERT INTO projects
            (project_id, project_type, simple_description, is_generated, is_ready)
            VALUES ($1, $2, $3, $4, $5)`,
            [
                project_id,
                projectType,
                is_generated
                    ? '[Creating project...]'
                    : '[Importing external project...]',
                is_generated,
                false,
            ]
        );

        console.log(
            `Created project stub for ${project_id} (is_generated=${is_generated})`
        );
        return true;
    } catch (error) {
        console.error(`Error ensuring project stub for ${project_id}:`, error);
        return false;
    } finally {
        db.release();
    }
}

/**
 * Add an entry to the project history table
 * @param project_id The ID of the project
 * @param action Description of the action performed
 * @param details Optional JSON with additional details
 * @param task_id Optional ID of the task that made the change
 * @returns Promise resolving to true if successful
 */
export async function addProjectHistory(
    project_id: string,
    action: string,
    details: any = null,
    task_id: string = null
): Promise<boolean> {
    const db = await getDB();
    try {
        await db.query(
            'INSERT INTO project_history (project_id, action, details, task_id) VALUES ($1, $2, $3, $4)',
            [project_id, action, details, task_id]
        );
        return true;
    } catch (error) {
        console.error('Error adding project history:', error);
        return false;
    } finally {
        db.release();
    }
}

/**
 * Get all project IDs from the projects table
 * @returns Promise resolving to an array of project IDs
 */
export async function getAllProjectIds(): Promise<string[]> {
    const db = await getDB();
    try {
        const result = await db.query('SELECT project_id FROM projects');
        return result.rows.map(row => row.project_id);
    } catch (error) {
        console.error('Error getting project IDs:', error);
        return [];
    } finally {
        db.release();
    }
}

/**
 * Get all project IDs that are not marked as ready
 * @returns Promise resolving to an array of unready project IDs
 */
export async function getUnreadyProjectIds(): Promise<string[]> {
    const db = await getDB();
    try {
        const { rows } = await db.query(
            'SELECT project_id FROM projects WHERE is_ready = false'
        );
        return rows.map(row => row.project_id);
    } catch (error) {
        console.error('Error listing unready projects:', error);
        return [];
    } finally {
        db.release();
    }
}

// Note: All PR operations have been moved to pr_event_utils.ts
// This ensures a single source of truth for PR event operations
