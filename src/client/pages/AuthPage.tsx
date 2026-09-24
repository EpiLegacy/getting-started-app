import React, { useState } from 'react';
import { Alert, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../features/auth/AuthProvider';
import { errorMessage } from '../lib/http';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
    const { user, loading, signIn, accountDeleted } = useAuth();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const registering = mode === 'register';
    const title = registering ? 'Create an account' : 'Sign in';
    const from: unknown = location.state?.from;
    const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
        && !['/login', '/register'].includes(from) ? from : '/todos';

    if (!loading && user) return <Navigate to={destination} replace />;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try { await signIn(mode, email, password); }
        catch (cause) { setError(errorMessage(cause)); }
        finally { setBusy(false); }
    }

    return (
        <Container maxWidth="xs" sx={{ py: 6 }}>
            <Paper sx={{ p: 3 }}>
                <Stack component="form" onSubmit={submit} spacing={3}>
                    <Typography component="h1" variant="h4">{title}</Typography>
                    {accountDeleted && <Alert severity="success">
                        Your account and its tasks have been deleted.
                    </Alert>}
                    {error && <Alert severity="error">{error}</Alert>}
                    <TextField label="Email" type="email" autoComplete="email" required value={email}
                        onChange={event => setEmail(event.target.value)} />
                    <TextField label="Password" type="password" required value={password}
                        autoComplete={registering ? 'new-password' : 'current-password'}
                        helperText={registering ? 'Use 12–128 characters.' : undefined}
                        slotProps={{ htmlInput: { minLength: registering ? 12 : 1, maxLength: 128 } }}
                        onChange={event => setPassword(event.target.value)} />
                    <Button type="submit" variant="contained" disabled={busy || loading}>{busy ? 'Please wait…' : title}</Button>
                    <Button component={Link} to={registering ? '/login' : '/register'} state={location.state}>
                        {registering ? 'Already have an account? Sign in' : 'Create an account'}
                    </Button>
                </Stack>
            </Paper>
        </Container>
    );
}
