import axios, { AxiosError } from 'axios';
import type { WorkItem } from './types';

export const TOKEN_KEY = 'ops.token';
export const USER_KEY = 'ops.user';

export const api = axios.create({ baseURL: '/api' });

// Attach the JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 (expired/invalid token) -> clear session and go to /login
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const isLoginCall = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginCall) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export interface ApiErrorInfo {
  status?: number;
  code?: string;
  message: string;
  currentItem?: WorkItem;
}

/** Normalise any thrown value into the server's { error, code, currentItem } shape. */
export function getErrorInfo(err: unknown): ApiErrorInfo {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: string; code?: string; currentItem?: WorkItem }
      | undefined;
    return {
      status: err.response?.status,
      code: data?.code,
      message: data?.error ?? err.message,
      currentItem: data?.currentItem,
    };
  }
  return { message: err instanceof Error ? err.message : 'Something went wrong' };
}
