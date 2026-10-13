import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
// @ts-expect-error Node provides this module when Vite runs the test harness.
import { fileURLToPath } from 'node:url';
export default defineConfig({
	root: fileURLToPath(new URL('.', import.meta.url)),
	plugins: [tailwindcss(), svelte({ compilerOptions: { runes: true } })],
	resolve: { alias: {
		'$lib': fileURLToPath(new URL('../../src/lib', import.meta.url)),
		'$app/environment': fileURLToPath(new URL('./environment.ts', import.meta.url))
	} },
	server: { port: 5184, strictPort: true, host: '127.0.0.1', fs: { allow: ['../..'] } }
});
