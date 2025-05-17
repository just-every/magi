// eslint-disable-next-line @typescript-eslint/no-unused-vars
import api from '@/services/api';
import { User, AuthResponse } from '@/types/user';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { LoginData, RegisterData } from '@/types/user';

/**
 * Login a user with email and password
 *
 * @param email User email
 * @param password User password
 * @returns AuthResponse containing user data and token
 */
export const login = async (email: string, password: string /* eslint-disable-line @typescript-eslint/no-unused-vars */): Promise<AuthResponse> => {
  // In a real app, this would make an API call:
  // return api.post('/auth/login', { email, password });

  // Mock implementation for template
  return Promise.resolve({
    user: {
      id: '1',
      name: 'Demo User',
      email,
      createdAt: new Date().toISOString(),
    },
    token: 'mock-jwt-token',
  });
};

/**
 * Register a new user
 *
 * @param name User name
 * @param email User email
 * @param password User password
 * @returns AuthResponse containing user data and token
 */
export const register = async (name: string, email: string, password: string /* eslint-disable-line @typescript-eslint/no-unused-vars */): Promise<AuthResponse> => {
  // In a real app, this would make an API call:
  // return api.post('/auth/register', { name, email, password });

  // Mock implementation for template
  return Promise.resolve({
    user: {
      id: Math.random().toString(36).substr(2, 9),
      name,
      email,
      createdAt: new Date().toISOString(),
    },
    token: 'mock-jwt-token',
  });
};

/**
 * Logout the current user
 */
export const logout = async (): Promise<void> => {
  // In a real app, this might call an API endpoint to invalidate the token:
  // return api.post('/auth/logout');

  // Mock implementation for template
  return Promise.resolve();
};

/**
 * Get the current user's profile
 *
 * @returns User data
 */
export const getCurrentUser = async (): Promise<User> => {
  // In a real app, this would make an API call:
  // return api.get('/user/profile');

  // Mock implementation for template
  return Promise.resolve({
    id: '1',
    name: 'Demo User',
    email: 'user@example.com',
    createdAt: new Date().toISOString(),
  });
};

/**
 * Update user profile
 *
 * @param data User data to update
 * @returns Updated user data
 */
export const updateProfile = async (data: Partial<User>): Promise<User> => {
  // In a real app, this would make an API call:
  // return api.put('/user/profile', data);

  // Mock implementation for template
  return Promise.resolve({
    id: '1',
    name: data.name || 'Demo User',
    email: data.email || 'user@example.com',
    updatedAt: new Date().toISOString(),
  });
};

/**
 * Reset password request
 *
 * @param email User email address
 */
export const requestPasswordReset = async (email: string /* eslint-disable-line @typescript-eslint/no-unused-vars */): Promise<void> => {
  // In a real app, this would make an API call:
  // return api.post('/auth/password-reset-request', { email });

  // Mock implementation for template
  return Promise.resolve();
};
