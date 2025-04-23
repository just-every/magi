/**
 * Project Manager Module
 *
 * Handles project creation, management, and metadata storage.
 */
import {
    saveProjectData,
    loadProjectData,
    addProjectHistory,
    ProjectMetadata,
} from '../utils/storage';
import { createNewProject } from './container_manager';

// Event types
export interface ProjectCreateEvent {
    type: 'project_create';
    project: string;
    description?: string;
    overview?: string;
}

export interface ProjectUpdateDescriptionEvent {
    type: 'project_update_description';
    project: string;
    description: string;
}

export interface ProjectUpdateOverviewEvent {
    type: 'project_update_overview';
    project: string;
    overview: string;
}

export interface ProjectAddHistoryEvent {
    type: 'project_add_history';
    project: string;
    action: string;
    taskId?: string;
}

export interface ProjectGetDetailsEvent {
    type: 'project_get_details';
    project: string;
}

export type ProjectEvent =
    | ProjectCreateEvent
    | ProjectUpdateDescriptionEvent
    | ProjectUpdateOverviewEvent
    | ProjectAddHistoryEvent
    | ProjectGetDetailsEvent;

export class ProjectManager {
    /**
     * Create a new project with Git repository and metadata
     *
     * @param projectName - The name of the project
     * @param description - Optional short description
     * @param overview - Optional comprehensive overview
     * @returns The final project name if successful, null if failed
     */
    createProject(
        projectName: string,
        description?: string,
        overview?: string
    ): string | null {
        try {
            if (!projectName || !/^[a-zA-Z0-9_-]+$/.test(projectName)) {
                console.error(`Invalid project name: ${projectName}`);
                return null;
            }

            // Create the git repository using the existing function
            const finalProjectName = createNewProject(projectName);

            // Create the metadata file
            const metadata: ProjectMetadata = {
                projectName: finalProjectName,
                description: description || '',
                overview: overview || '',
                history: [
                    {
                        timestamp: new Date().toISOString(),
                        action: `Project '${finalProjectName}' created`,
                    },
                ],
            };

            // Save the project metadata
            saveProjectData(finalProjectName, metadata);

            console.log(`Project '${finalProjectName}' created successfully`);
            return finalProjectName;
        } catch (error) {
            console.error(`Error creating project ${projectName}:`, error);
            return null;
        }
    }

    /**
     * Update the description of a project
     *
     * @param projectName - The name of the project
     * @param description - The new description
     * @returns true if successful, false otherwise
     */
    updateProjectDescription(
        projectName: string,
        description: string
    ): boolean {
        try {
            const metadata = loadProjectData(projectName);

            if (!metadata) {
                console.error(`Project ${projectName} not found`);
                return false;
            }

            metadata.description = description;
            saveProjectData(projectName, metadata);

            console.log(`Description updated for project '${projectName}'`);
            return true;
        } catch (error) {
            console.error(
                `Error updating description for project ${projectName}:`,
                error
            );
            return false;
        }
    }

    /**
     * Update the overview of a project
     *
     * @param projectName - The name of the project
     * @param overview - The new overview
     * @returns true if successful, false otherwise
     */
    updateProjectOverview(projectName: string, overview: string): boolean {
        try {
            const metadata = loadProjectData(projectName);

            if (!metadata) {
                console.error(`Project ${projectName} not found`);
                return false;
            }

            metadata.overview = overview;
            saveProjectData(projectName, metadata);

            console.log(`Overview updated for project '${projectName}'`);
            return true;
        } catch (error) {
            console.error(
                `Error updating overview for project ${projectName}:`,
                error
            );
            return false;
        }
    }

    /**
     * Add a history entry to a project
     *
     * @param projectName - The name of the project
     * @param action - Description of the action
     * @param taskId - Optional associated task ID
     * @returns true if successful, false otherwise
     */
    addProjectHistory(
        projectName: string,
        action: string,
        taskId?: string
    ): boolean {
        try {
            const entry = {
                timestamp: new Date().toISOString(),
                action,
                taskId,
            };

            const result = addProjectHistory(projectName, entry);

            if (result) {
                console.log(
                    `History entry added to project '${projectName}': ${action}`
                );
            }

            return result;
        } catch (error) {
            console.error(
                `Error adding history to project ${projectName}:`,
                error
            );
            return false;
        }
    }

    /**
     * Get project details
     *
     * @param projectName - The name of the project
     * @returns Project metadata if found, null otherwise
     */
    getProjectDetails(projectName: string): ProjectMetadata | null {
        try {
            const metadata = loadProjectData(projectName);

            if (!metadata) {
                console.error(`Project ${projectName} not found`);
                return null;
            }

            return metadata;
        } catch (error) {
            console.error(
                `Error getting details for project ${projectName}:`,
                error
            );
            return null;
        }
    }

    /**
     * Handle project-related events
     *
     * @param event - The project event to handle
     * @returns Response object with status and data
     */
    handleProjectEvent(event: ProjectEvent): {
        success: boolean;
        data?: any;
        message: string;
    } {
        try {
            switch (event.type) {
                case 'project_create': {
                    const { project, description, overview } = event;
                    const result = this.createProject(
                        project,
                        description,
                        overview
                    );

                    return {
                        success: !!result,
                        data: { projectName: result },
                        message: result
                            ? `Project '${result}' created successfully`
                            : `Failed to create project '${project}'`,
                    };
                }

                case 'project_update_description': {
                    const { project, description } = event;
                    const result = this.updateProjectDescription(
                        project,
                        description
                    );

                    return {
                        success: result,
                        message: result
                            ? `Description updated for project '${project}'`
                            : `Failed to update description for project '${project}'`,
                    };
                }

                case 'project_update_overview': {
                    const { project, overview } = event;
                    const result = this.updateProjectOverview(
                        project,
                        overview
                    );

                    return {
                        success: result,
                        message: result
                            ? `Overview updated for project '${project}'`
                            : `Failed to update overview for project '${project}'`,
                    };
                }

                case 'project_add_history': {
                    const { project, action, taskId } = event;
                    const result = this.addProjectHistory(
                        project,
                        action,
                        taskId
                    );

                    return {
                        success: result,
                        message: result
                            ? `History entry added to project '${project}'`
                            : `Failed to add history entry to project '${project}'`,
                    };
                }

                case 'project_get_details': {
                    const { project } = event;
                    const details = this.getProjectDetails(project);

                    return {
                        success: !!details,
                        data: details,
                        message: details
                            ? `Retrieved details for project '${project}'`
                            : `Failed to get details for project '${project}'`,
                    };
                }

                default:
                    return {
                        success: false,
                        message: `Unknown project event type: ${(event as any).type}`,
                    };
            }
        } catch (error) {
            console.error('Error handling project event:', error);
            return {
                success: false,
                message: `Error handling project event: ${error}`,
            };
        }
    }

    /**
     * Initialize the project manager, loading existing projects
     */
    initialize(): void {
        try {
            console.log('Project Manager initialized successfully');
        } catch (error) {
            console.error('Error initializing Project Manager:', error);
        }
    }
}
