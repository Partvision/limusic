// Standalone Node check; the browser project's types intentionally omit Node built-ins.
// @ts-expect-error Node provides this module when the self-check runner executes.
import assert from 'node:assert/strict';
import { EQ_PRESETS, FLAT, parseEqualizer } from './equalizer.ts';
for (const preset of EQ_PRESETS) assert.deepEqual(parseEqualizer(preset.config), preset.config);
assert.throws(() => parseEqualizer({ ...FLAT, bass: 13 }));
assert.throws(() => parseEqualizer({ ...FLAT, bands: [1, 2] }));
assert.throws(() => parseEqualizer({ ...FLAT, preamp: NaN }));
assert.throws(() => parseEqualizer({ ...FLAT, stereo_width: Infinity }));
const copied = parseEqualizer(FLAT); copied.bands[0] = 5;
assert.equal(FLAT.bands[0], 0, 'editing a preset never changes the source');
console.log('equalizer preset checks: ok');
