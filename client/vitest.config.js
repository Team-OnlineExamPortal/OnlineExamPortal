import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom', restoreMocks: true, clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/main.jsx'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
