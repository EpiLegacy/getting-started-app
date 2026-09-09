import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    root: 'src/static',
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
        },
    },
});
