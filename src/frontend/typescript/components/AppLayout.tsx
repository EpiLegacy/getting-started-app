import React from 'react';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import { AppBar, Button, Toolbar, Typography } from '@mui/material';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

export function AppLayout() {
    const { pathname } = useLocation();

    return (
        <>
            <AppBar position="static" color="inherit" elevation={1}>
                <Toolbar sx={{ gap: 1 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
                        Todo App
                    </Typography>
                    <Button
                        component={NavLink}
                        to="/"
                        color="inherit"
                        startIcon={<HomeOutlinedIcon />}
                        aria-current={pathname === '/' ? 'page' : undefined}
                    >
                        Home
                    </Button>
                    <Button
                        component={NavLink}
                        to="/todos"
                        color="inherit"
                        startIcon={<ListAltOutlinedIcon />}
                        aria-current={pathname === '/todos' ? 'page' : undefined}
                    >
                        Todos
                    </Button>
                </Toolbar>
            </AppBar>
            <Outlet />
        </>
    );
}
