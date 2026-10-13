export const EQ_FREQUENCIES = ['31 Hz', '62 Hz', '125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz', '8 kHz', '16 kHz'];
export type Equalizer = {
	enabled: boolean; bands: number[]; preamp: number; bass: number; treble: number;
	stereo_width: number; limiter: boolean;
};
export const FLAT: Equalizer = { enabled: false, bands: Array(10).fill(0), preamp: 0, bass: 0, treble: 0, stereo_width: 1, limiter: true };
export type EqPreset = { name: string; config: Equalizer };
const preset = (name: string, changes: Partial<Equalizer>): EqPreset => ({ name, config: { ...FLAT, bands: [...FLAT.bands], enabled: true, ...changes } });
export const EQ_PRESETS: EqPreset[] = [
	preset('Flat', {}),
	preset('Bass boost', { bass: 6, preamp: -6 }),
	preset('Deep bass', { bass: 9, bands: [2, 2, 0, 0, 0, 0, 0, 0, 0, 0], preamp: -11 }),
	preset('Rock', { bands: [4, 3, 2, -1, -2, 0, 2, 3, 4, 3], preamp: -5 }),
	preset('Vocals', { bands: [-3, -2, -1, 0, 2, 4, 3, 2, 0, -1], preamp: -5 }),
	preset('Electronic', { bands: [5, 4, 2, 0, -2, -1, 1, 3, 4, 3], preamp: -6 }),
	preset('Warm', { bass: 3, treble: -3, preamp: -4 }),
	preset('Night listening', { bands: [-4, -3, -2, 0, 2, 3, 2, 0, -2, -3], preamp: -4 })
];
export function parseEqualizer(input: unknown): Equalizer {
	if (!input || typeof input !== 'object') throw new Error('Invalid equalizer preset.');
	const p = input as Equalizer;
	const range = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
	if (typeof p.enabled !== 'boolean' || typeof p.limiter !== 'boolean' || !Array.isArray(p.bands) || p.bands.length !== 10 ||
		!p.bands.every((v) => range(v, -12, 12)) || !range(p.bass, -12, 12) || !range(p.treble, -12, 12) ||
		!range(p.preamp, -24, 12) || !range(p.stereo_width, 0, 2)) throw new Error('Preset has invalid equalizer values.');
	return { enabled: p.enabled, limiter: p.limiter, bands: [...p.bands], bass: p.bass,
		treble: p.treble, preamp: p.preamp, stereo_width: p.stereo_width };
}
