import React from 'react';
import { Route, Routes } from 'react-router';
import ProfilePage from '../pages/ProfilePage';
import AuthPage from '../pages/AuthPage';
import RequireAuth from '../features/auth/RequireAuth';
import AppLayout from './AppLayout';
import HomePage from '../pages/HomePage';
import TodosPage from '../pages/TodosPage';
import NotFoundPage from '../pages/NotFoundPage';

export default function AppRoutes() {
    return (
        <Routes>
            <Route element={<AppLayout />}>
                <Route path="login" element={<AuthPage key="login" mode="login" />} />
                <Route path="register" element={<AuthPage key="register" mode="register" />} />
                <Route element={<RequireAuth />}>
                    <Route index element={<HomePage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="todos" element={<TodosPage />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}
