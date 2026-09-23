import React from 'react';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';

export default function RequireAuth() {
    const { user, loading, error, retry } = useAuth();
    const location = useLocation();
    if (loading) return <Box sx={{ p: 4 }}><CircularProgress aria-label="Checking your session" /></Box>;
    if (error) return <Alert severity="error" action={<Button onClick={retry}>Retry</Button>}>{error}</Alert>;
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    return <Outlet />;
}
