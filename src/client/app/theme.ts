import { createTheme } from '@mui/material';

export const theme = createTheme({
    palette: { background: { default: '#f4f4f4' } },
    typography: {
        fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    shape: { borderRadius: 10 },
});

