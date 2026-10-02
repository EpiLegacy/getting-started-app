import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import NotificationBell from '../features/notifications/NotificationBell';
import { errorMessage } from '../lib/http';
import { Alert, AppBar, Box, Button, Link as MuiLink, Toolbar, Typography } from '@mui/material';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import { Link, NavLink, Outlet, useLocation } from 'react-router';

const APP_NAME = 'Todo App';

/** RGAA 8.6: every page has its own title, read first by screen readers. */
const PAGE_TITLES: Record<string, string> = {
    '/': 'Home',
    '/todos': 'My tasks',
    '/profile': 'Your profile',
    '/login': 'Sign in',
    '/register': 'Create an account',
    '/accessibility': 'Accessibility statement',
    '/sitemap': 'Site map',
};

export function pageTitle(pathname: string): string {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    return `${PAGE_TITLES[path] ?? 'Page not found'} - ${APP_NAME}`;
}

export default function AppLayout() {
    const { user, logout } = useAuth();
    const { pathname } = useLocation();
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const main = useRef<HTMLElement>(null);
    const firstRender = useRef(true);

    // A client-side navigation does not reload the page, so neither the title
    // nor the focus would change on their own. Moving the focus to the main
    // content makes screen readers announce the new page, as a real page load
    // would, and puts keyboard users at its start rather than in the menu.
    useEffect(() => {
        document.title = pageTitle(pathname);
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        main.current?.focus();
    }, [pathname]);

    async function signOut() {
        setBusy(true);
        setError('');
        try { await logout(); }
        catch (cause) { setError(errorMessage(cause)); }
        finally { setBusy(false); }
    }
    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* RGAA 12.7: the first focusable element skips the navigation. */}
            <MuiLink href="#main" onClick={event => { event.preventDefault(); main.current?.focus(); }}
                sx={{
                    position: 'absolute', left: 8, top: -100, zIndex: 'tooltip', p: 1.5,
                    bgcolor: 'background.paper', fontWeight: 700, '&:focus': { top: 8 },
                }}>
                Skip to main content
            </MuiLink>
            <AppBar component="header" position="static" color="inherit" elevation={1}>
                <Toolbar sx={{ gap: 1, flexWrap: 'wrap', py: 1 }}>
                    {/* Not a heading: each page starts its outline with its own h1 (RGAA 9.1). */}
                    <Typography component="p" variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
                        {APP_NAME}
                    </Typography>
                    {user && <NotificationBell />}
                    <Box component="nav" aria-label="Main navigation">
                        {/* RGAA 9.3: a menu is a list of links. */}
                        <Box component="ul" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', listStyle: 'none', m: 0, p: 0 }}>
                            {user ? <>
                                <li><Button component={NavLink} to="/" end color="inherit" startIcon={<HomeOutlinedIcon />}>
                                    Home
                                </Button></li>
                                <li><Button component={NavLink} to="/todos" color="inherit" startIcon={<ListAltOutlinedIcon />}>
                                    Todos
                                </Button></li>
                                <li><Button component={NavLink} to="/profile" color="inherit" startIcon={<AccountCircleOutlinedIcon />}>
                                    Profile
                                </Button></li>
                                <li><Button color="inherit" onClick={signOut} disabled={busy}>Sign out</Button></li>
                            </> : <>
                                <li><Button component={NavLink} to="/login" color="inherit">Sign in</Button></li>
                            </>}
                        </Box>
                    </Box>
                </Toolbar>
            </AppBar>
            <Box component="main" id="main" ref={main} tabIndex={-1} sx={{ flexGrow: 1, '&:focus': { outline: 'none' } }}>
                {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
                <Outlet />
            </Box>
            {/* Required on every page of a public service in France (decree 2019-768, art. 4). */}
            <Box component="footer" sx={{ py: 2, px: 3, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Box component="ul" sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', listStyle: 'none', m: 0, p: 0 }}>
                    <li><MuiLink component={Link} to="/accessibility">Accessibility: partially compliant</MuiLink></li>
                    {/* RGAA 12.1: a second way to reach every page, besides the menu. */}
                    <li><MuiLink component={Link} to="/sitemap">Site map</MuiLink></li>
                </Box>
            </Box>
        </Box>
    );
}
