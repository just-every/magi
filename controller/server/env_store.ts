/**
 * Environment Variable Storage
 *
 * @deprecated This file is kept for backwards compatibility.
 * Use the new modules in managers/env_store.ts and managers/color_manager.ts instead.
 */

// Re-export everything from the new modules
export * from './managers/env_store';
export { saveUsedColors, loadUsedColors } from './managers/color_manager';