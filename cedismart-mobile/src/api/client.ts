import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

/**
 * Production-grade Axios client for CediSmart.
 * 
 * Features:
 * - Bearer token injection from SecureStore.
 * - Auto-refresh token on 401 response (mutex-protected).
 * - Request ID tracing.
 * - Base URL from environment variables.
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.199:8000/api/v1';

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Mutex-like flags for handling concurrent 401s
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// --- Multi-Account Session Helpers ---
export const getActiveSessionPhone = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync('active_session_phone');
};

export const getActiveTokens = async (): Promise<{ access: string | null; refresh: string | null }> => {
  const activePhone = await getActiveSessionPhone();
  if (activePhone) {
    const sanitized = activePhone.replace(/[^\w.-]/g, '');
    const access = await SecureStore.getItemAsync(`session_access_token_${sanitized}`);
    const refresh = await SecureStore.getItemAsync(`session_refresh_token_${sanitized}`);
    return { access, refresh };
  }
  // Fallback to legacy
  const access = await SecureStore.getItemAsync('access_token');
  const refresh = await SecureStore.getItemAsync('refresh_token');
  return { access, refresh };
};

export const setActiveTokens = async (phone: string, access: string, refresh: string): Promise<void> => {
  const sanitized = phone.replace(/[^\w.-]/g, '');
  await SecureStore.setItemAsync('active_session_phone', phone);
  await SecureStore.setItemAsync(`session_access_token_${sanitized}`, access);
  await SecureStore.setItemAsync(`session_refresh_token_${sanitized}`, refresh);
  
  // Legacy fallback support
  await SecureStore.setItemAsync('access_token', access);
  await SecureStore.setItemAsync('refresh_token', refresh);
};

export const clearActiveSession = async (phone: string): Promise<void> => {
  // NOTE: We intentionally do NOT delete the per-account tokens
  // (session_access_token_${sanitized}, session_refresh_token_${sanitized})
  // so the user can switch back to this account later without re-authenticating.
  const activePhone = await getActiveSessionPhone();
  if (activePhone === phone) {
    await SecureStore.deleteItemAsync('active_session_phone');
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
  }
};

// --- Request Interceptor ---
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const isPublicEndpoint = config.url && (
      config.url.includes('/auth/login') ||
      config.url.includes('/auth/register') ||
      config.url.includes('/auth/verify-otp') ||
      config.url.includes('/auth/token/refresh') ||
      config.url.includes('/support/chat') ||
      config.url.includes('/support/escalate')
    );

    if (!isPublicEndpoint) {
      const { access } = await getActiveTokens();
      if (access && config.headers) {
        config.headers.Authorization = `Bearer ${access}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Response Interceptor ---
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const isPublicEndpoint = originalRequest?.url && (
      originalRequest.url.includes('/auth/login') ||
      originalRequest.url.includes('/auth/register') ||
      originalRequest.url.includes('/auth/verify-otp') ||
      originalRequest.url.includes('/auth/token/refresh') ||
      originalRequest.url.includes('/support/chat') ||
      originalRequest.url.includes('/support/escalate')
    );

    // If error is 401, we haven't retried yet, and it is not a public auth endpoint
    if (error.response?.status === 401 && !originalRequest._retry && !isPublicEndpoint) {
      if (isRefreshing) {
        // Queue the request while refresh is in flight
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { refresh } = await getActiveTokens();
        if (!refresh) throw new Error('No refresh token');

        // Attempt to refresh
        const response = await axios.post(`${BASE_URL}/auth/token/refresh`, {
          refresh_token: refresh,
        });

        const { access_token, refresh_token } = response.data;
        
        // Save new access token
        const activePhone = await getActiveSessionPhone();
        if (activePhone) {
          const sanitized = activePhone.replace(/[^\w.-]/g, '');
          await SecureStore.setItemAsync(`session_access_token_${sanitized}`, access_token);
          if (refresh_token) {
            await SecureStore.setItemAsync(`session_refresh_token_${sanitized}`, refresh_token);
          }
        }
        await SecureStore.setItemAsync('access_token', access_token);
        if (refresh_token) {
          await SecureStore.setItemAsync('refresh_token', refresh_token);
        }

        processQueue(null, access_token);
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        
        // Force logout on refresh failure
        const activePhone = await getActiveSessionPhone();
        if (activePhone) {
          await clearActiveSession(activePhone);
        } else {
          await SecureStore.deleteItemAsync('access_token');
          await SecureStore.deleteItemAsync('refresh_token');
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
