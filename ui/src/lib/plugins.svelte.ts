import * as api from './api';
import { playback, ratingOf, toast } from './player.svelte';
import { BUILTINS, parsePlugin, restorePlugins, validateTheme, type Plugin, type PluginTheme, type Permission } from './plugins';
import { pluginSandbox } from './plugin-sandbox';

export const plugins = $state({ items: [] as Plugin[], loaded: false, errors: {} as Record<string, string>, dontsend: false });
type Runtime = { frame: HTMLIFrameElement; dispose: () => void; alive: number; busy: boolean; ready: boolean };
const runtimes = new Map<string, Runtime>();
const themes = new Map<string, PluginTheme>();
const privacy = new Set<string>();
let themeStyle: HTMLStyleElement | undefined;
let write: Promise<void> = Promise.resolve();
let privacyWrite: Promise<void> = Promise.resolve();
let destroyed = false;

const save = () => {
	const json = JSON.stringify(plugins.items);
	const next = write.catch(() => {}).then(() => api.setSetting('plugins_json', json));
	write = next;
	return next;
};
const snapshot = () => ({
	track: playback.now ? { id: playback.now.videoId, title: playback.now.title, artists: playback.now.artists, album: playback.now.album } : null,
	rating: playback.rating, paused: playback.paused,
	queue: playback.queue.items.map((item) => ({ id: item.video_id, rating: ratingOf(item) })),
	currentIndex: playback.queue.currentIndex
});

function applyThemes() {
	if (!themeStyle) { themeStyle = document.createElement('style'); document.head.append(themeStyle); }
	const rules = [...themes.values()].map((theme) => {
		const css = (palette: Record<string, string>) => Object.entries(palette).map(([k, v]) => `--${k}:${v} !important`).join(';');
		return `html:not(.dark){${css(theme.light)}}html.dark{${css(theme.dark)}}`;
	});
	themeStyle.textContent = rules.join('\n');
}

async function applyPrivacy() {
	const on = plugins.items.some((p) => p.enabled && (p.id === 'limusic.dontsend' || privacy.has(p.id)));
	const next = privacyWrite.catch(() => {}).then(async () => {
		await api.setSetting('dontsend', String(on)); plugins.dontsend = on;
	});
	privacyWrite = next;
	await next;
}

function stop(id: string) {
	runtimes.get(id)?.dispose();
	runtimes.delete(id);
	themes.delete(id); privacy.delete(id);
	applyThemes();
}

async function skipDisliked() {
	const current = playback.now?.videoId;
	if (!current || playback.rating !== 'dislike' || playback.paused) return;
	const { items, currentIndex, repeat } = playback.queue;
	for (let offset = 1; offset < items.length; offset++) {
		const index = currentIndex + offset;
		if (index >= items.length && (repeat ?? 'off') === 'off') break;
		const next = index % items.length;
		if (ratingOf(items[next]) !== 'dislike') {
			await api.playIndex(next);
			return;
		}
	}
	// A bounded search also handles repeat-one/all and a queue made entirely of disliked songs.
	if (!playback.paused && playback.now?.videoId === current) await api.togglePause();
}

function start(plugin: Plugin) {
	if (!plugin.enabled || plugin.type === 'builtin') return;
	if (plugin.type === 'theme') { themes.set(plugin.id, plugin.theme!); applyThemes(); return; }
	const frame = document.createElement('iframe');
	frame.hidden = true; frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('aria-hidden', 'true');
	frame.srcdoc = pluginSandbox(plugin.source!);
	const runtime: Runtime = { frame, alive: Date.now(), busy: false, ready: false, dispose: () => {} };
	let removed = false;
	const send = (message: unknown) => { if (!removed) frame.contentWindow?.postMessage(message, '*'); };
	const require = (permission: Permission) => {
		if (!plugin.permissions.includes(permission)) throw new Error(`Permission required: ${permission}`);
	};
	const fail = (error: unknown) => {
		if (removed) return;
		// A broken privacy script must not silently resume reporting.
		if (privacy.has(plugin.id)) plugins.items.find((p) => p.id === 'limusic.dontsend')!.enabled = true;
		plugins.errors[plugin.id] = String(error).slice(0, 300);
		plugin.enabled = false;
		stop(plugin.id);
		Promise.all([save(), applyPrivacy()]).catch((e) => toast.error(String(e)));
	};
	const dispatch = async (method: string, args: unknown) => {
		if (method === 'getPlayback') { require('playback.read'); return snapshot(); }
		if (method === 'getStorage') return JSON.parse(JSON.stringify(plugin.storage));
		if (method === 'setStorage') {
			if (!args || typeof args !== 'object' || Array.isArray(args) || JSON.stringify(args).length > 16_000) throw new Error('Storage must be an object under 16 KB.');
			plugin.storage = { ...args as Record<string, unknown>, __dontsend: privacy.has(plugin.id) }; await save(); return;
		}
		if (method === 'setDontSend') {
			require('privacy.control');
			if (typeof args !== 'boolean') throw new Error('Expected a boolean.');
			args ? privacy.add(plugin.id) : privacy.delete(plugin.id);
			// Persist the lease so privacy remains active before JavaScript starts next launch.
			plugin.storage = { ...plugin.storage, __dontsend: args };
			await applyPrivacy(); await save(); return;
		}
		if (method === 'setTheme') {
			require('theme.write'); themes.set(plugin.id, validateTheme(args)); applyThemes(); return;
		}
		if (['next', 'pause', 'skipDisliked'].includes(method)) {
			require('playback.control');
			if (runtime.busy) return;
			runtime.busy = true;
			try {
				if (method === 'next') await api.nextTrack();
				if (method === 'pause' && !playback.paused) await api.togglePause();
				if (method === 'skipDisliked') await skipDisliked();
			} finally { setTimeout(() => { runtime.busy = false; }, 250); }
			return;
		}
		throw new Error(`Unknown plugin method: ${method}`);
	};
	let messageCount = 0;
	const handler = (event: MessageEvent) => {
		if (removed || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
		const m = event.data;
		if (++messageCount > 100) { fail('Plugin exceeded 100 messages per second.'); return; }
		if (m.heartbeat) runtime.alive = Date.now();
		if (m.error) { fail(m.error); return; }
		if (m.ready) {
			runtime.ready = true;
			if (plugin.permissions.includes('playback.read')) send({ event: 'playback', state: snapshot() });
		}
		if (Number.isSafeInteger(m.id) && typeof m.method === 'string') {
			dispatch(m.method, m.args).then((result) => send({ id: m.id, result }), (e) => send({ id: m.id, error: String(e) }));
		}
	};
	window.addEventListener('message', handler);
	let lastCheck = Date.now();
	const timer = setInterval(() => {
		messageCount = 0;
		const now = Date.now();
		// A suspended computer or throttled host timer is not evidence that the worker hung.
		if (now - lastCheck > 3000) runtime.alive = now;
		lastCheck = now;
		// Background webviews throttle timers; only judge health while the window is visible.
		if (document.visibilityState === 'visible' && now - runtime.alive > 15_000) fail('Plugin stopped responding.');
		if (document.visibilityState !== 'visible') runtime.alive = Date.now();
	}, 1000);
	runtime.dispose = () => { removed = true; clearInterval(timer); window.removeEventListener('message', handler); frame.remove(); };
	runtimes.set(plugin.id, runtime);
	document.body.append(frame);
}

export async function togglePlugin(id: string, enabled: boolean) {
	const plugin = plugins.items.find((p) => p.id === id);
	if (!plugin) return;
	const old = plugin.enabled;
	stop(id);
	plugin.enabled = enabled;
	if (enabled && plugin.permissions.includes('privacy.control') && plugin.storage.__dontsend === true) privacy.add(id);
	try {
		await applyPrivacy(); await save();
		delete plugins.errors[id];
		if (enabled) start(plugin);
	} catch (e) {
		plugin.enabled = old;
		if (old && plugin.permissions.includes('privacy.control') && plugin.storage.__dontsend === true) privacy.add(id);
		await applyPrivacy(); if (old) start(plugin); throw e;
	}
}

export async function installPlugin(text: string) {
	const plugin = parsePlugin(text);
	if (plugins.items.some((p) => p.id === plugin.id)) throw new Error('This plugin is already installed. Remove it before importing a new version.');
	if (plugins.items.length >= 32) throw new Error('At most 32 plugins can be installed.');
	plugins.items.push(plugin);
	try { await save(); } catch (e) { plugins.items = plugins.items.filter((p) => p.id !== plugin.id); throw e; }
}

export async function removePlugin(id: string) {
	if (BUILTINS.some((p) => p.id === id)) return;
	await togglePlugin(id, false);
	plugins.items = plugins.items.filter((p) => p.id !== id);
	await save();
}

export function initPlugins(): () => void {
	destroyed = false;
	api.getSettings().then(async (settings) => {
		if (destroyed) return;
		plugins.items = restorePlugins(settings.plugins_json);
		for (const p of plugins.items) {
			if (p.enabled && p.permissions.includes('privacy.control') && p.storage.__dontsend === true) privacy.add(p.id);
		}
		// Fail closed if the registry is damaged but the native privacy preference survived.
		if (settings.dontsend === 'true' && !privacy.size && !plugins.items.some((p) => p.id === 'limusic.dontsend' && p.enabled)) {
			plugins.items.find((p) => p.id === 'limusic.dontsend')!.enabled = true;
		}
		await applyPrivacy();
		if (destroyed) return;
		plugins.loaded = true;
		for (const p of plugins.items) start(p);
	}).catch((e) => toast.error(`Plugins: ${e}`));
	const disposeEffect = $effect.root(() => {
		$effect(() => {
			const state = snapshot();
			for (const [id, runtime] of runtimes) {
				if (runtime.ready && plugins.items.find((p) => p.id === id)?.permissions.includes('playback.read')) {
					runtime.frame.contentWindow?.postMessage({ event: 'playback', state }, '*');
				}
			}
		});
	});
	return () => {
		destroyed = true; disposeEffect();
		for (const id of [...runtimes.keys()]) stop(id);
		themes.clear(); privacy.clear(); themeStyle?.remove(); themeStyle = undefined;
	};
}
