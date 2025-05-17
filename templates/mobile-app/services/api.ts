import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Item, ItemData } from '@/types/api';

// Get configuration from app.json extra
const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl || 'https://api.example.com';
const apiTimeout = Constants.expoConfig?.extra?.apiTimeout || 10000;

// Create axios instance with default config
const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: apiTimeout,
});

// Add a request interceptor to attach auth token
api.interceptors.request.use(
  async (config: AxiosRequestConfig) => {
    try {
      const token = await SecureStore.getItemAsync('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error retrieving auth token:', error);
    }
    return config;
  },
  (error: unknown) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle common errors
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    // Handle token expiration
    if (error.response?.status === 401) {
      // Logout user or refresh token
      // Example: AuthService.logout();
    }

    // Handle network errors
    if (!error.response) {
      console.error('Network Error:', error.message);
    }

    return Promise.reject(error);
  }
);

// Example API functions
export const fetchItems = async (): Promise<Item[]> => {
  // Simulated data response for template
  // In a real app, this would be: const response = await api.get('/items');

  return Promise.resolve([
    { id: '1', title: 'First Item', description: 'This is the first item' },
    { id: '2', title: 'Second Item', description: 'This is the second item' },
    { id: '3', title: 'Third Item', description: 'This is the third item' },
  ]);
};

export const fetchItemById = async (id: string): Promise<Item> => {
  // In a real app: return (await api.get(`/items/${id}`)).data;
  return Promise.resolve({
    id,
    title: `Item ${id}`,
    description: `This is item ${id}`,
    createdAt: new Date().toISOString(),
  });
};

export const createItem = async (data: ItemData): Promise<Item> => {
  // In a real app: return (await api.post('/items', data)).data;
  return Promise.resolve({
    id: Math.random().toString(36).substr(2, 9),
    ...data,
    createdAt: new Date().toISOString(),
  });
};

export const updateItem = async (id: string, data: ItemData): Promise<Item> => {
  // In a real app: return (await api.put(`/items/${id}`, data)).data;
  return Promise.resolve({
    id,
    ...data,
    updatedAt: new Date().toISOString(),
  });
};

export const deleteItem = async (id: string): Promise<{success: boolean, deletedId: string}> => {
  // In a real app: return (await api.delete(`/items/${id}`)).data;
  // Including id in the response to show it was used
  return Promise.resolve({ success: true, deletedId: id });
};

export default api;
