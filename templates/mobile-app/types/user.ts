/**
 * User-related type definitions
 */

/**
 * Represents a user in the application
 */
export interface User {
  id: string;
  name?: string;
  email: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Data required to register a new user
 */
export interface RegisterData {
  name: string;
  email: string;
  password: string;
}

/**
 * Data required for user login
 */
export interface LoginData {
  email: string;
  password: string;
}

/**
 * Authentication response containing user data and token
 */
export interface AuthResponse {
  user: User;
  token: string;
}
