import { createTheme } from '@mui/material';

/**
 * Accessibility (RGAA 4.1, see docs/accessibility.md) is enforced here, once,
 * rather than component by component.
 *
 * - 3.2: MUI's default blue (#1976d2) only reaches 4.0:1 as text on the page
 *   background and on alert backgrounds. #1565c0 gives at least 5.1:1.
 * - 3.3: the default field outline (23% black, about 1.6:1) is too faint to
 *   locate a field. 60% black gives about 5.7:1.
 * - 10.7: ButtonBase removes the browser outline and only shows a ripple on
 *   keyboard focus. Every focusable element gets a solid 3px ring instead.
 * - 13.8: animations and transitions stop when the user asks for less motion.
 */
const PRIMARY = '#1565c0';
const FOCUS_RING = { outline: `3px solid ${PRIMARY}`, outlineOffset: 2 };

export const theme = createTheme({
    palette: {
        primary: { main: PRIMARY },
        background: { default: '#f4f4f4' },
    },
    typography: {
        fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    shape: { borderRadius: 10 },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                ':focus-visible': FOCUS_RING,
                '@media (prefers-reduced-motion: reduce)': {
                    '*, *::before, *::after': {
                        animationDuration: '0.01ms !important',
                        animationIterationCount: '1 !important',
                        transitionDuration: '0.01ms !important',
                        scrollBehavior: 'auto !important',
                    },
                },
            },
        },
        MuiButtonBase: {
            styleOverrides: { root: { '&.Mui-focusVisible': FOCUS_RING } },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                notchedOutline: { borderColor: 'rgba(0, 0, 0, 0.6)' },
            },
        },
    },
});
