import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    root: 'src/client',
    publicDir: false,
    plugins: [react({ jsxRuntime: 'classic' })],
    build: {
        outDir: '../../dist',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/items': 'http://localhost:3000',
            '/auth': 'http://localhost:3000',
            '/projects': 'http://localhost:3000',
            '/notifications': 'http://localhost:3000',
        },
    },
});
