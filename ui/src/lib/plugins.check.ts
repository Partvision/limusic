// Standalone Node check; the browser project's types intentionally omit Node built-ins.
// @ts-expect-error Node provides this module when the self-check runner executes.
import assert from 'node:assert/strict';
import { parsePlugin, restorePlugins, validateTheme } from './plugins.ts';
import { pluginSandbox } from './plugin-sandbox.ts';
const valid = { apiVersion: 1, id: 'example.skip', name: 'Example', version: '1.0', description: '',
	type: 'script', source: 'api.next()', permissions: ['playback.control'] };
assert.equal(parsePlugin(JSON.stringify({ ...valid, enabled: true })).enabled, false, 'imports never auto-run');
assert.throws(() => parsePlugin(JSON.stringify({ ...valid, id: 'limusic.dontsend' })));
assert.throws(() => parsePlugin(JSON.stringify({ ...valid, permissions: ['backend.invoke'] })));
assert.throws(() => parsePlugin(JSON.stringify({ ...valid, source: 'x'.repeat(100_001) })));
assert.throws(() => validateTheme({ light: { background: 'url(https://example.com)' }, dark: {} }));
assert.throws(() => validateTheme({ light: { background: '#fff;display:none' }, dark: {} }));
assert.throws(() => validateTheme({ light: { anything: '#fff' }, dark: { background: '#000' } }));
assert.equal(validateTheme({ light: { background: '#fff' }, dark: { background: 'oklch(0.2 0.02 250)' } }).light.background, '#fff');
const restored = restorePlugins(JSON.stringify([{}, { ...valid, enabled: true }, { ...valid, enabled: false },
	{ id: 'limusic.dontsend', enabled: true, source: 'malicious replacement' }]));
assert.equal(restored.filter((p) => p.id === valid.id).length, 1);
assert.equal(restored.find((p) => p.id === 'limusic.dontsend')?.type, 'builtin');
assert.equal(restored.find((p) => p.id === 'limusic.dontsend')?.enabled, true);
const sandbox = pluginSandbox('</script><script>alert(1)</script>');
assert.equal((sandbox.match(/<script>/g) ?? []).length, 1, 'script text cannot escape the iframe bootstrap');
assert.ok(sandbox.includes("connect-src 'none'"));
assert.ok(sandbox.includes('new Worker'));
console.log('plugin bundle and sandbox checks: ok');
