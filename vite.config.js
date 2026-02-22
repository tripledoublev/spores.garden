import { defineConfig } from 'vite';

export default defineConfig({
    base: '/',
    server: {
        port: 5174,
        strictPort: true,
        host: '127.0.0.1'
    },
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: [],
        include: ['src/**/*.{test,spec}.{js,ts}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/**/*.d.ts',
                'src/**/*.test.ts',
                'src/**/*.spec.ts'
            ]
        }
    }
});
