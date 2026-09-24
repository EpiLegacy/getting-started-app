import type { User, UserProfile } from '../../../modules/auth/types';
import { request } from '../../lib/http';

export const authApi = {
    profile: (signal?: AbortSignal) => request<{ user: UserProfile }>('/auth/profile', { signal }),
    deleteAccount: (password: string) => request<void>('/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) }),
    me: () => request<{ user: User }>('/auth/me'),
    signIn: (mode: 'login' | 'register', email: string, password: string) =>
        request<{ user: User }>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
};
