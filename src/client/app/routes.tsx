import React from 'react';
import { Route, Routes } from 'react-router';
import AppLayout from './AppLayout';
import HomePage from '../pages/HomePage';
import TodosPage from '../pages/TodosPage';
import NotFoundPage from '../pages/NotFoundPage';

export default function AppRoutes() {
    return (
        <Routes>
            <Route element={<AppLayout />}>
                <Route index element={<HomePage />} />
                <Route path="todos" element={<TodosPage />} />
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}
