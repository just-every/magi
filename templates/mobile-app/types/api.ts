/**
 * Common API-related type definitions
 */

/**
 * Base item interface
 */
export interface Item {
  id: string;
  title: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Type for creating/updating items - omits server-generated fields
 */
export type ItemData = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>;
