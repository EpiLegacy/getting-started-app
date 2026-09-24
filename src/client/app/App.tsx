import React from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { AuthProvider } from '../features/auth/AuthProvider';
import AppRoutes from './routes';
import { theme } from './theme';

export default function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <AuthProvider><AppRoutes /></AuthProvider>
        </ThemeProvider>
    );
}
