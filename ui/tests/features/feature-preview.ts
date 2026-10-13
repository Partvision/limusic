import './preview.css';
import { mount } from 'svelte';
import Preview from './Preview.svelte';
const settings: Record<string, string> = {};
const calls: string[] = [];
const callbacks = new Map<number, (...args: unknown[]) => void>();
let sequence = 0;
Object.assign(window, { __TAURI_INTERNALS__: {
	invoke: async (cmd: string, args: Record<string, unknown>) => {
		calls.push(cmd);
		if (cmd === 'get_settings') return { ...settings };
		if (cmd === 'set_setting') { settings[String(args.key)] = String(args.value); return; }
		if (cmd === 'play_index') {
			const { playback } = await import('../../src/lib/player.svelte');
			const index = Number(args.index); const item = playback.queue.items[index];
			playback.queue.currentIndex = index; playback.now = { videoId: item.video_id, title: item.title, artists: item.artists, streamClient: 'test' };
			playback.rating = item.rating ?? 'indifferent'; return;
		}
		if (cmd === 'toggle_pause') { const { playback } = await import('../../src/lib/player.svelte'); playback.paused = !playback.paused; return; }
		return null;
	},
	transformCallback: (callback: (...args: unknown[]) => void) => { const id = ++sequence; callbacks.set(id, callback); return id; },
	unregisterCallback: (id: number) => callbacks.delete(id),
	convertFileSrc: (path: string) => path,
	metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }
} });
mount(Preview, { target: document.getElementById('app')!, props: { settings, calls } });
