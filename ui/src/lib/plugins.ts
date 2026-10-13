// Versioned plugin bundles. No code executes while importing or inspecting a bundle.
export const PERMISSIONS = ['playback.read', 'playback.control', 'privacy.control', 'theme.write'] as const;
export type Permission = typeof PERMISSIONS[number];
export type Palette = Record<string, string>;
export type PluginTheme = { light: Palette; dark: Palette };
export type Plugin = {
	apiVersion: 1; id: string; name: string; version: string; description: string;
	type: 'script' | 'theme' | 'builtin'; permissions: Permission[];
	source?: string; theme?: PluginTheme; enabled: boolean; storage: Record<string, unknown>;
};
const TOKENS = new Set(['background', 'foreground', 'card', 'card-foreground', 'popover',
	'popover-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
	'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'border', 'input',
	'ring', 'sidebar', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground',
	'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring']);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function validateTheme(input: unknown): PluginTheme {
	if (!object(input)) throw new Error('Theme must contain light and dark palettes.');
	const palette = (input: unknown): Palette => {
		if (!object(input) || !Object.keys(input).length) throw new Error('Each theme palette needs colors.');
		const result: Palette = {};
		for (const [key, value] of Object.entries(input)) {
			// Color tokens only: no arbitrary selectors, URLs, imports, or executable CSS.
			if (!TOKENS.has(key) || typeof value !== 'string' || value.length > 80 ||
				!(/^(#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|(?:oklch|oklab|rgb|rgba|hsl|hsla)\([\d\s.,%/+\-]+\))$/i.test(value)) ||
				(typeof CSS !== 'undefined' && !CSS.supports('color', value))) {
				throw new Error(`Unsupported theme color: ${key}`);
			}
			result[key] = value;
		}
		return result;
	};
	return { light: palette(input.light), dark: palette(input.dark) };
}

export function parsePlugin(text: string): Plugin {
	if (text.length > 150_000) throw new Error('Plugin bundles must be under 150 KB.');
	const p: unknown = JSON.parse(text);
	if (!object(p) || p.apiVersion !== 1 || typeof p.id !== 'string' ||
		!(/^[a-z][a-z0-9.-]{2,63}$/.test(p.id)) || p.id.startsWith('limusic.')) {
		throw new Error('Use apiVersion 1 and an id such as yourname.plugin (limusic.* is reserved).');
	}
	for (const key of ['name', 'version', 'description']) {
		if (typeof p[key] !== 'string' || (p[key] as string).length > (key === 'description' ? 500 : 100)) {
			throw new Error(`Plugin ${key} is missing or too long.`);
		}
	}
	if (!p.name || !p.version || !Array.isArray(p.permissions) ||
		p.permissions.some((v) => !PERMISSIONS.includes(v as Permission))) {
		throw new Error('Plugin has invalid permissions, name, or version.');
	}
	if (p.type !== 'script' && p.type !== 'theme') throw new Error('Plugin type must be script or theme.');
	if (p.type === 'script' && (typeof p.source !== 'string' || !p.source.trim() || p.source.length > 100_000)) {
		throw new Error('Script plugins need JavaScript source under 100 KB.');
	}
	if (p.type === 'theme' && !p.permissions.includes('theme.write')) throw new Error('Themes need theme.write permission.');
	return {
		apiVersion: 1, id: p.id, name: p.name as string, version: p.version as string,
		description: p.description as string, type: p.type, permissions: [...new Set(p.permissions)] as Permission[],
		...(p.type === 'script' ? { source: p.source as string } : { theme: validateTheme(p.theme) }),
		enabled: false, storage: {}
	};
}

export const BUILTINS: Plugin[] = [
	{ apiVersion: 1, id: 'limusic.dontsend', name: 'DontSend', version: '1.0.0', type: 'builtin',
		description: 'Suppress YouTube play/search history, Last.fm and ListenBrainz reporting, and Discord presence.',
		permissions: ['privacy.control'], enabled: false, storage: {} },
	{ apiVersion: 1, id: 'limusic.skip-disliked', name: 'Skip Disliked Songs', version: '1.0.0', type: 'script',
		description: 'Skip a disliked song as soon as its rating is known. Pause when no eligible track remains.',
		permissions: ['playback.read', 'playback.control'], enabled: false, storage: {},
		source: `api.onPlayback(state => { if (state.track && state.rating === 'dislike' && !state.paused) api.skipDisliked().catch(console.error); });` }
];

export function restorePlugins(json: string | undefined): Plugin[] {
	let saved: unknown;
	try { saved = JSON.parse(json ?? '[]'); } catch { saved = []; }
	if (!Array.isArray(saved)) saved = [];
	const rows = saved as Record<string, unknown>[];
	const result = BUILTINS.map((p) => ({ ...p, enabled: rows.some((r) => object(r) && r.id === p.id && r.enabled === true) }));
	for (const row of rows) {
		try {
			const p = parsePlugin(JSON.stringify(row));
			if (result.some((r) => r.id === p.id)) continue;
			p.enabled = row.enabled === true;
			p.storage = object(row.storage) ? row.storage : {};
			result.push(p);
		} catch { /* One damaged plugin cannot prevent the rest of the app starting. */ }
	}
	return result;
}
