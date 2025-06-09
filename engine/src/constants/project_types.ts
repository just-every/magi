/**
 * Project Types and Descriptions
 *
 * This file contains the standardized list of project types and their descriptions
 * used throughout the MAGI system.
 */

import { ProjectType } from '../types/shared-types.js';

/**
 * Map of project types to their descriptions
 */
export const PROJECT_TYPE_DESCRIPTIONS: Record<ProjectType, string> = {
    'web-app':
        'Full-stack web application with authentication, database integration, and modern UI components (Next.js, Postgres, etc.)',
    'web-static':
        'Lightweight website for landing pages and content sites (Next.js)',
    'game-3d':
        '3D application for interactive games and visualizations (Three.js, etc.)',
    'game-2d': '2D game projects (Phaser, etc.)',
    'mobile-app': 'Mobile applications (React Native, etc.)',
    'desktop-app': 'Desktop applications (Electron, etc.)',
    plain: 'Empty project with no framework or structure',
};

/**
 * Array of all available project types
 */
export const PROJECT_TYPES: ProjectType[] = Object.keys(
    PROJECT_TYPE_DESCRIPTIONS
) as ProjectType[];

/**
 * Get the description for a specific project type
 */
export function getProjectTypeDescription(type: ProjectType): string {
    return PROJECT_TYPE_DESCRIPTIONS[type] || 'Unknown project type';
}

/**
 * Get the list of project types for enum construction
 */
export function getProjectTypesList(): ProjectType[] {
    return [...PROJECT_TYPES];
}

/**
 * Helper to check if a string is a valid project type
 */
export function isValidProjectType(type: string): type is ProjectType {
    return PROJECT_TYPES.includes(type as ProjectType);
}
