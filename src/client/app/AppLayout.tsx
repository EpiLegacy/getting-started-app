import React, { useState } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import { errorMessage } from '../lib/http';
import { Alert, AppBar, Box, Button, Toolbar, Typography } from '@mui/material';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import { NavLink, Outlet } from 'react-router';

export default function AppLayout() {
    const { user, logout } = useAuth();
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    async function signOut() {
        setBusy(true);
        setError('');
        try { await logout(); }
        catch (cause) { setError(errorMessage(cause)); }
        finally { setBusy(false); }
    }
    return (
        <>
            <AppBar position="static" color="inherit" elevation={1}>
                <Toolbar component="nav" aria-label="Main navigation" sx={{ gap: 1, flexWrap: 'wrap', py: 1 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
                        Todo App
                    </Typography>
                    {user ? <>
                        <Button component={NavLink} to="/" end color="inherit" startIcon={<HomeOutlinedIcon />}>
                            Home
                        </Button>
                        <Button component={NavLink} to="/todos" color="inherit" startIcon={<ListAltOutlinedIcon />}>
                            Todos
                        </Button>
                        <Button component={NavLink} to="/profile" color="inherit" startIcon={<AccountCircleOutlinedIcon />}>
                            Profile
                        </Button>
                        <Button color="inherit" onClick={signOut} disabled={busy}>Sign out</Button>
                    </> : <>
                        <Button component={NavLink} to="/login" color="inherit">Sign in</Button>
                    </>}
                </Toolbar>
            </AppBar>
            <Box component="main">
                {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
                <Outlet />
            </Box>
        </>
    );
}
