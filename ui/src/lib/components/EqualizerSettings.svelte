<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Slider } from '$lib/components/ui/slider';
	import * as api from '$lib/api';
	import { playback } from '$lib/player.svelte';
	import { EQ_FREQUENCIES, EQ_PRESETS, FLAT, parseEqualizer, type Equalizer, type EqPreset } from '$lib/equalizer';

	let config = $state<Equalizer>(structuredClone(FLAT));
	let applied = structuredClone(FLAT);
	let ready = $state(false);
	let busy = $state(false);
	let error = $state('');
	let selected = $state('Custom');
	let name = $state('');
	let saved = $state<EqPreset[]>([]);
	let fileInput: HTMLInputElement;
	const db = 'limusic.eq.presets.v1';
	const dbLabel = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

	onMount(() => {
		api.getSettings().then((settings) => {
			if (settings.equalizer) config = parseEqualizer(JSON.parse(settings.equalizer));
			applied = structuredClone($state.snapshot(config));
			ready = true;
		}).catch((e) => { error = String(e); });
		try {
			const rows = JSON.parse(localStorage.getItem(db) ?? '[]');
			if (Array.isArray(rows)) saved = rows.filter((p) => typeof p.name === 'string' && p.name.length <= 60)
				.map((p) => ({ name: p.name, config: parseEqualizer(p.config) }));
		} catch { saved = []; }
	});

	async function apply(next: Equalizer, label = 'Custom') {
		if (busy || !ready) return;
		busy = true; error = '';
		try {
			const wanted = parseEqualizer(next);
			await api.setSetting('equalizer', JSON.stringify(wanted));
			applied = wanted; config = structuredClone(wanted); selected = label;
		} catch (e) { config = structuredClone(applied); error = String(e); }
		finally { busy = false; }
	}
	function band(index: number, value: number) {
		const next = $state.snapshot(config); next.bands[index] = value; void apply(next);
	}
	function modifier(key: 'preamp' | 'bass' | 'treble' | 'stereo_width', value: number) {
		void apply({ ...$state.snapshot(config), [key]: value });
	}
	function savePreset() {
		const label = name.trim().slice(0, 60);
		if (!label) return;
		saved = [...saved.filter((p) => p.name !== label), { name: label, config: $state.snapshot(config) }];
		localStorage.setItem(db, JSON.stringify(saved)); name = ''; selected = label;
	}
	function removePreset(label: string) {
		saved = saved.filter((p) => p.name !== label); localStorage.setItem(db, JSON.stringify(saved));
	}
	function downloadPreset() {
		const blob = new Blob([JSON.stringify({ name: selected, config: $state.snapshot(config) }, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob); const a = document.createElement('a');
		a.href = url; a.download = 'equalizer-preset.json'; a.click(); URL.revokeObjectURL(url);
	}
	async function importPreset(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		try {
			if (!file || file.size > 16_000) throw new Error('Choose a preset JSON file under 16 KB.');
			const data = JSON.parse(await file.text());
			await apply(parseEqualizer(data.config), typeof data.name === 'string' ? data.name.slice(0, 60) : 'Imported');
		} catch (e) { error = String(e); }
		finally { fileInput.value = ''; }
	}
	async function params(speed: number, semitones: number) {
		busy = true; error = '';
		try { await api.setPlaybackParams(speed, semitones); playback.speed = speed; playback.semitones = semitones; }
		catch (e) { error = String(e); } finally { busy = false; }
	}
</script>

<div class="min-w-0 flex-1 overflow-y-auto px-6 py-5">
	<div class="mb-5 flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
		<div><h3 class="text-sm font-semibold">Equalizer</h3><p class="mt-1 text-xs text-muted-foreground">Shape the audio you hear. Changes apply as soon as you release a slider.</p></div>
		<Switch checked={config.enabled} disabled={!ready || busy} aria-label="Enable equalizer" onCheckedChange={(enabled) => apply({ ...$state.snapshot(config), enabled }, selected)} />
	</div>
	{#if error}<p role="alert" class="mb-4 rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>{/if}
	<div class="mb-5 flex flex-wrap gap-2" aria-label="Equalizer presets">
		{#each EQ_PRESETS as preset}<Button size="sm" variant={selected === preset.name ? 'default' : 'outline'} disabled={!ready || busy} onclick={() => apply(preset.config, preset.name)}>{preset.name}</Button>{/each}
	</div>
	<fieldset disabled={!ready || busy || !config.enabled} class="disabled:opacity-50">
		<legend class="mb-3 text-sm font-medium">10-band equalizer <span class="text-xs text-muted-foreground">−12 to +12 dB</span></legend>
		<div class="grid grid-cols-5 gap-x-3 gap-y-6 rounded-xl border bg-card p-4 lg:grid-cols-10">
			{#each EQ_FREQUENCIES as frequency, i}
				<div class="flex min-w-0 flex-col items-center gap-3">
					<output class="text-[10px] tabular-nums">{dbLabel(config.bands[i])}</output>
					<div class="h-40"><Slider type="single" orientation="vertical" value={config.bands[i]} min={-12} max={12} step={0.5} aria-label={frequency} thumbLabel={frequency} disabled={!ready || busy || !config.enabled} onValueCommit={(value) => band(i, value)} /></div>
					<span class="whitespace-nowrap text-[10px] text-muted-foreground">{frequency}</span>
				</div>
			{/each}
		</div>
		<div class="my-5 space-y-5 rounded-xl border bg-card p-4">
			{#each [{ key: 'preamp', label: 'Preamp', min: -24, max: 12 }, { key: 'bass', label: 'Bass boost', min: -12, max: 12 }, { key: 'treble', label: 'Treble', min: -12, max: 12 }] as knob}
				{@const key = knob.key as 'preamp' | 'bass' | 'treble'}
				<div><div class="mb-3 flex justify-between text-xs"><label for="eq-{key}">{knob.label}</label><output>{dbLabel(config[key])}</output></div>
				<Slider id="eq-{key}" type="single" value={config[key]} min={knob.min} max={knob.max} step={0.5} aria-label={knob.label} thumbLabel={knob.label} disabled={!ready || busy || !config.enabled} onValueCommit={(value) => modifier(key, value)} /></div>
			{/each}
			<div><div class="mb-3 flex justify-between text-xs"><span>Stereo width</span><output>{Math.round(config.stereo_width * 100)}%</output></div>
			<Slider type="single" value={config.stereo_width} min={0} max={2} step={0.05} aria-label="Stereo width" thumbLabel="Stereo width" disabled={!ready || busy || !config.enabled} onValueCommit={(value) => modifier('stereo_width', value)} />
			<p class="mt-2 text-xs text-muted-foreground">0% narrows stereo to mono; 100% preserves the original mix.</p></div>
			<div class="flex items-center justify-between gap-4"><div><p class="text-sm font-medium">Peak limiter</p><p class="text-xs text-muted-foreground">Prevents boosted peaks from clipping. Lower the preamp for more headroom.</p></div>
			<Switch checked={config.limiter} aria-label="Peak limiter" onCheckedChange={(limiter) => apply({ ...$state.snapshot(config), limiter })} /></div>
		</div>
	</fieldset>
	<div class="mb-5 rounded-xl border bg-card p-4">
		<h3 class="mb-4 text-sm font-semibold">Tempo and pitch</h3>
		<div class="mb-5"><div class="mb-3 flex justify-between text-xs"><span>Playback speed</span><output>{playback.speed.toFixed(2)}×</output></div>
		<Slider type="single" value={playback.speed} min={0.25} max={2} step={0.05} disabled={busy} aria-label="Playback speed" thumbLabel="Playback speed" onValueCommit={(value) => params(value, playback.semitones)} /></div>
		<div><div class="mb-3 flex justify-between text-xs"><span>Pitch</span><output>{playback.semitones > 0 ? '+' : ''}{playback.semitones} semitones</output></div>
		<Slider type="single" value={playback.semitones} min={-12} max={12} step={1} disabled={busy} aria-label="Pitch" thumbLabel="Pitch" onValueCommit={(value) => params(playback.speed, value)} /></div>
		<p class="mt-3 text-xs text-muted-foreground">Tempo and pitch reset on restart. Your equalizer stays saved.</p>
	</div>
	<div class="space-y-3 rounded-xl border bg-card p-4">
		<h3 class="text-sm font-semibold">Your presets</h3>
		<div class="flex gap-2"><Input aria-label="Preset name" placeholder="Preset name" maxlength={60} bind:value={name} /><Button disabled={!ready || busy || !name.trim()} onclick={savePreset}>Save</Button></div>
		{#each saved as preset}<div class="flex justify-between gap-2"><Button variant="outline" size="sm" disabled={busy} onclick={() => apply(preset.config, preset.name)}>{preset.name}</Button><Button variant="ghost" size="sm" onclick={() => removePreset(preset.name)}>Remove</Button></div>{/each}
		<div class="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!ready || busy} onclick={() => apply({ ...structuredClone(FLAT), enabled: config.enabled }, 'Flat')}>Reset</Button><Button variant="outline" size="sm" disabled={!ready} onclick={downloadPreset}>Export preset</Button><Button variant="outline" size="sm" disabled={!ready || busy} onclick={() => fileInput.click()}>Import preset</Button></div>
		<input bind:this={fileInput} type="file" accept=".json" class="hidden" onchange={importPreset} />
	</div>
</div>
