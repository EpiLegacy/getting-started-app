import type { User } from '../../../modules/auth/types';
import { request } from '../../lib/http';

export const authApi = {
    me: () => request<{ user: User }>('/auth/me'),
    signIn: (mode: 'login' | 'register', email: string, password: string) =>
        request<{ user: User }>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
};
