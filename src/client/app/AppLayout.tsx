import React from 'react';
import { AppBar, Box, Button, Toolbar, Typography } from '@mui/material';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import { NavLink, Outlet } from 'react-router';

export default function AppLayout() {
    return (
        <>
            <AppBar position="static" color="inherit" elevation={1}>
                <Toolbar component="nav" aria-label="Main navigation" sx={{ gap: 1 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
                        Todo App
                    </Typography>
                    <Button component={NavLink} to="/" end color="inherit" startIcon={<HomeOutlinedIcon />}>
                        Home
                    </Button>
                    <Button component={NavLink} to="/todos" color="inherit" startIcon={<ListAltOutlinedIcon />}>
                        Todos
                    </Button>
                </Toolbar>
            </AppBar>
            <Box component="main">
                <Outlet />
            </Box>
        </>
    );
}
