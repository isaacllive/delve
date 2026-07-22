import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { viteWSPlugin } from './vite-ws-plugin.ts';

// The dev:tunnel script sets DELVE_TUNNEL=1 to allow the ephemeral
// *.trycloudflare.com Host through Vite's dev/preview host check (its
// DNS-rebinding guard 403s unknown hosts otherwise). Ordinary `npm run dev` /
// `preview` keep the strict default — only the tunnel opts in.
const tunnelHosts = process.env.DELVE_TUNNEL ? ['.trycloudflare.com'] : undefined;

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), viteWSPlugin()],
  server: { allowedHosts: tunnelHosts },
  preview: { allowedHosts: tunnelHosts },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'node',
  },
});
