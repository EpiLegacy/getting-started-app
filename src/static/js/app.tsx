import React from 'react';
import { createRoot } from 'react-dom/client';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import {
    AppBar,
    Button,
    CssBaseline,
    Toolbar,
    ThemeProvider,
    Typography,
    createTheme,
} from '@mui/material';
import HomePage from './homePage';
import TodosPage from './todo';

const theme = createTheme({
    palette: { background: { default: '#f4f4f4' } },
    typography: {
        fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    shape: { borderRadius: 10 },
});

function App() {
    const isTodosPage = window.location.pathname === '/todos';

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <AppBar position="static" color="inherit" elevation={1}>
                <Toolbar sx={{ gap: 1 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
                        Todo App
                    </Typography>
                    <Button
                        href="/"
                        color="inherit"
                        startIcon={<HomeOutlinedIcon />}
                        aria-current={!isTodosPage ? 'page' : undefined}
                    >
                        Home
                    </Button>
                    <Button
                        href="/todos"
                        color="inherit"
                        startIcon={<ListAltOutlinedIcon />}
                        aria-current={isTodosPage ? 'page' : undefined}
                    >
                        Todos
                    </Button>
                </Toolbar>
            </AppBar>
            {isTodosPage ? <TodosPage /> : <HomePage />}
        </ThemeProvider>
    );
}

const rootElement = document.getElementById('root');

if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(<App />);
