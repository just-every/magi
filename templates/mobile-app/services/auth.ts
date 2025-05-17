import api from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

// Login function
export const login = async (email: string, password: string): Promise<AuthResponse> => {
  // In a real app, this would be:
  // const response = await api.post('/auth/login', { email, password });
  // return response.data;
  
  // Simulated successful login for template
  return {
    user: {
      id: '1',
      name: 'John Doe',
      email: email,
      avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
    },
    token: 'sample-jwt-token',
  };
};

// Register function
export const register = async (
  name: string,
  email: string,
  password: string
): Promise<AuthResponse> => {
  // In a real app, this would be:
  // const response = await api.post('/auth/register', { name, email, password });
  // return response.data;
  
  // Simulated successful registration for template
  return {
    user: {
      id: '1',
      name: name,
      email: email,
      avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
    },
    token: 'sample-jwt-token',
  };
};

// Forgot password function
export const forgotPassword = async (email: string): Promise<{ success: boolean }> => {
  // In a real app, this would be:
  // const response = await api.post('/auth/forgot-password', { email });
  // return response.data;
  
  // Simulated response for template
  return { success: true };
};

// Reset password function
export const resetPassword = async (
  token: string,
  password: string
): Promise<{ success: boolean }> => {
  // In a real app, this would be:
  // const response = await api.post('/auth/reset-password', { token, password });
  // return response.data;
  
  // Simulated response for template
  return { success: true };
};

// Get user profile
export const getProfile = async (): Promise<User> => {
  // In a real app, this would be:
  // const response = await api.get('/auth/profile');
  // return response.data;
  
  // Simulated response for template
  return {
    id: '1',
    name: 'John Doe',
    email: 'john.doe@example.com',
    avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
  };
};

// Update user profile
export const updateProfile = async (data: Partial<User>): Promise<User> => {
  // In a real app, this would be:
  // const response = await api.put('/auth/profile', data);
  // return response.data;
  
  // Simulated response for template
  return {
    id: '1',
    name: data.name || 'John Doe',
    email: data.email || 'john.doe@example.com',
    avatar: data.avatar || 'https://randomuser.me/api/portraits/men/1.jpg',
  };
};