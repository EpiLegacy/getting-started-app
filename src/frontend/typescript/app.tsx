import React from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { AppLayout } from './components/AppLayout';
import { HomePage } from './pages/HomePage';
import { TodosPage } from './pages/TodosPage';
import { theme } from './theme';

const router = createBrowserRouter([
    {
        path: '/',
        element: <AppLayout />,
        children: [
            { index: true, element: <HomePage /> },
            { path: 'todos', element: <TodosPage /> },
            { path: '*', element: <Navigate to="/" replace /> },
        ],
    },
]);

function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <RouterProvider router={router} />
        </ThemeProvider>
    );
}

const rootElement = document.getElementById('root');

if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(<App />);
