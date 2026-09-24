import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '../../../modules/auth/types';
import { ApiError, errorMessage } from '../../lib/http';
import { authApi } from './api';

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    accountDeleted: boolean;
    error: string;
    signIn(mode: 'login' | 'register', email: string, password: string): Promise<void>;
    logout(): Promise<void>;
    deleteAccount(password: string): Promise<void>;
    retry(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [accountDeleted, setAccountDeleted] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        authApi.me().then(result => {
            if (active) setUser(result.user);
        }).catch(cause => {
            if (!active) return;
            setUser(null);
            if (!(cause instanceof ApiError && cause.status === 401)) setError(errorMessage(cause));
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [attempt]);

    useEffect(() => {
        const expired = () => setUser(null);
        window.addEventListener('auth:unauthenticated', expired);
        return () => window.removeEventListener('auth:unauthenticated', expired);
    }, []);

    const value: AuthContextValue = {
        user, loading, error, accountDeleted,
        async signIn(mode, email, password) {
            const result = await authApi.signIn(mode, email, password);
            setAccountDeleted(false);
            setUser(result.user);
            setError('');
        },
        async deleteAccount(password) {
            await authApi.deleteAccount(password);
            setAccountDeleted(true);
            setUser(null);
            setError('');
        },
        async logout() {
            await authApi.logout();
            setUser(null);
        },
        retry: () => setAttempt(value => value + 1),
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth requires AuthProvider');
    return context;
}
