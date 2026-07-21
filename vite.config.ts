import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { viteWSPlugin } from './vite-ws-plugin.ts';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), viteWSPlugin()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'node',
  },
});
