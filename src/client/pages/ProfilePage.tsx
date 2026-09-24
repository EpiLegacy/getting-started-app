import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material';
import type { UserProfile } from '../../modules/auth/types';
import { authApi } from '../features/auth/api';
import { useAuth } from '../features/auth/AuthProvider';
import DeleteAccountDialog from '../features/auth/DeleteAccountDialog';
import { errorMessage } from '../lib/http';

export default function ProfilePage() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [confirmDeletion, setConfirmDeletion] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setProfile(null);
        authApi.profile(controller.signal).then(({ user }) => {
            if (!controller.signal.aborted) setProfile(user);
        }).catch(cause => {
            if (!controller.signal.aborted) setError(errorMessage(cause));
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [user?.id, attempt]);

    if (!user) return null;
    return (
        <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 6 } }}>
            <Stack spacing={3}>
                <Typography component="h1" variant="h3" fontWeight={700}>Your profile</Typography>
                <Paper component="section" aria-labelledby="account-details-heading" sx={{ p: 3 }}>
                    <Typography id="account-details-heading" component="h2" variant="h6" gutterBottom>Account details</Typography>
                    {error && <Alert severity="error" action={<Button onClick={() => setAttempt(value => value + 1)}>Retry</Button>}>{error}</Alert>}
                    <Box component="dl" sx={{ m: 0, '& dt': { color: 'text.secondary', mt: 2 }, '& dd': { m: 0, overflowWrap: 'anywhere' } }}>
                        <Typography component="dt">Email</Typography>
                        <Typography component="dd">{profile?.email ?? user.email}</Typography>
                        <Typography component="dt">Account ID</Typography>
                        <Typography component="dd">{profile?.id ?? user.id}</Typography>
                        <Typography component="dt">Member since</Typography>
                        <Typography component="dd">
                            {loading ? <CircularProgress size={18} aria-label="Loading account details" /> :
                                profile ? <time dateTime={profile.createdAt}>{new Date(profile.createdAt).toLocaleDateString(undefined, {
                                    year: 'numeric', month: 'long', day: 'numeric',
                                })}</time> : 'Unavailable'}
                        </Typography>
                    </Box>
                </Paper>
                <Paper component="section" aria-labelledby="delete-account-heading" sx={{ p: 3, border: 1, borderColor: 'error.main' }}>
                    <Typography id="delete-account-heading" component="h2" variant="h6" gutterBottom>Delete account</Typography>
                    <Typography sx={{ mb: 2 }}>
                        Permanently delete your account and all your tasks, including tasks you claimed.
                        Your tasks will not become available for others to claim.
                    </Typography>
                    <Button variant="outlined" color="error" onClick={() => setConfirmDeletion(true)}>Delete my account</Button>
                </Paper>
            </Stack>
            {confirmDeletion && <DeleteAccountDialog onClose={() => setConfirmDeletion(false)} />}
        </Container>
    );
}
