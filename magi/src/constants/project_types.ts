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
        'Web application with server-side logic (Next.js, React, Angular, Vue, etc.)',
    'web-static': 'Simple HTML/CSS/JS website without a framework or backend',
    'game-2d': '2D game project (Phaser, Pixi.js, etc.)',
    'game-3d': '3D game project (Unity, Three.js, etc.)',
    'mobile-app': 'Mobile application (React Native, Flutter, etc.)',
    'desktop-app': 'Desktop application (Electron, etc.)',
    plain: "General-purpose project that doesn't fit other categories",
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
