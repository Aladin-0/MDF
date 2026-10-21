import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const getBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        try {
            const u = new URL(rawBaseUrl);
            u.hostname = window.location.hostname;
            return u.toString().replace(/\/$/, '');
        } catch {
            return rawBaseUrl;
        }
    }
    return rawBaseUrl;
};

const BASE_URL = getBaseUrl();

export const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 10000
});

// Request Interceptor: forward cookies for cookie-based auth and attach Bearer token
api.interceptors.request.use(
    (config) => {
        // If data is FormData, remove Content-Type so Axios/browser automatically sets multipart/form-data with proper boundary
        if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
            if (config.headers) {
                if (typeof (config.headers as any).delete === 'function') {
                    (config.headers as any).delete('Content-Type');
                } else {
                    delete (config.headers as Record<string, any>)['Content-Type'];
                }
            }
        }

        if (typeof document !== 'undefined') {
            const row = document.cookie.split('; ').find(r => r.startsWith('access_token='));
            const token = row ? row.substring('access_token='.length) : null;
            if (token && config.headers) {
                if (typeof config.headers.set === 'function') {
                    config.headers.set('Authorization', `Bearer ${token}`);
                } else {
                    (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
                }
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 & Structured Errors
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;

        // Handle 401 Unauthorized securely
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                // Attempt refresh
                await axios.post(`${BASE_URL}/auth/refresh/`, {}, { withCredentials: true });

                // Refresh successful, retry original request
                return api(originalRequest);
            } catch (refreshError) {
                // Refresh failed, logout
                useAuthStore.getState().logout();
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        // Format structured API Error
        const apiError = {
            code: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
            message: error.response?.data?.error?.message || error.message || 'An unexpected error occurred',
            details: error.response?.data?.error?.details
        };

        return Promise.reject({ error: apiError });
    }
);
