<script lang="ts">
	import { onMount } from 'svelte';
	import EqualizerSettings from '../../src/lib/components/EqualizerSettings.svelte';
	import PluginsSettings from '../../src/lib/components/PluginsSettings.svelte';
	import { initPlugins, plugins, installPlugin, togglePlugin } from '../../src/lib/plugins.svelte';
	import { playback } from '../../src/lib/player.svelte';
	let { settings, calls }: { settings: Record<string, string>; calls: string[] } = $props();
	let tab = $state('equalizer'); let checks = $state<string[]>([]);
	onMount(initPlugins);
	const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
	async function test() {
		checks = [];
		const assert = (value: unknown, label: string) => { checks.push(`${value ? 'PASS' : 'FAIL'} ${label}`); if (!value) throw new Error(label); };
		await togglePlugin('limusic.dontsend', true); assert(settings.dontsend === 'true', 'DontSend applies in backend');
		await togglePlugin('limusic.dontsend', false); assert(settings.dontsend === 'false', 'DontSend restores reporting');
		const bundle = (id: string, source: string, permissions: string[]) => JSON.stringify({apiVersion:1,id,name:id,description:'Runtime test',version:'1',type:'script',source,permissions});
		await installPlugin(bundle('test.denied', `api.next().then(() => api.setStorage({allowed:true})).catch(() => api.setStorage({denied:true}));`, []));
		const before = calls.filter((c) => c === 'next_track').length;
		await togglePlugin('test.denied', true); await wait(1000);
		assert(plugins.items.find(p => p.id === 'test.denied')?.storage.denied, 'Missing playback permission rejects RPC');
		assert(calls.filter((c) => c === 'next_track').length === before, 'Denied request never invokes backend');
		await installPlugin(bundle('test.isolation', `Promise.all([fetch('https://example.com').then(() => false, () => true), Promise.resolve(typeof window === 'undefined' && typeof __TAURI_INTERNALS__ === 'undefined')]).then(([network, isolated]) => api.setStorage({network,isolated}));`, []));
		await togglePlugin('test.isolation', true); await wait(1000);
		const isolation = plugins.items.find(p => p.id === 'test.isolation')?.storage;
		assert(isolation?.network && isolation?.isolated, 'Worker has no network, window, or Tauri bridge');
		await installPlugin(bundle('test.privacy', `api.setDontSend(true).catch(console.error);`, ['privacy.control']));
		await togglePlugin('test.privacy', true); await wait(1000); assert(settings.dontsend === 'true', 'Custom privacy plugin works');
		await togglePlugin('limusic.dontsend', true); await togglePlugin('test.privacy', false);
		assert(settings.dontsend === 'true', 'Releasing a lease does not override DontSend');
		await togglePlugin('limusic.dontsend', false);
		await installPlugin(JSON.stringify({ apiVersion:1,id:'test.theme',name:'Test theme',description:'',version:'1',type:'theme',permissions:['theme.write'],theme:{light:{primary:'#365bcc'},dark:{primary:'#8ca9ff'}} }));
		await togglePlugin('test.theme', true);
		assert(getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() === '#8ca9ff', 'Imported theme overrides tokens');
		await togglePlugin('test.theme', false);
		assert(getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() !== '#8ca9ff', 'Disabling theme restores appearance');
		playback.queue = { items: [{video_id:'bad',title:'Bad',artists:'Test',rating:'dislike'}, {video_id:'good',title:'Good',artists:'Test',rating:'like'}],currentIndex:0,repeat:'off' };
		playback.now = {videoId:'bad',title:'Bad',artists:'Test',streamClient:'test'}; playback.rating='dislike'; playback.paused=false;
		await togglePlugin('limusic.skip-disliked', true); await wait(1000);
		assert(playback.now?.videoId === 'good', 'Skip Disliked advances to eligible track');
		playback.queue = { items: [{video_id:'only',title:'Only',artists:'Test',rating:'dislike'}],currentIndex:0,repeat:'all' };
		playback.now = {videoId:'only',title:'Only',artists:'Test',streamClient:'test'}; playback.rating='dislike'; playback.paused=false;
		await wait(1000); assert(playback.paused, 'All-disliked repeat queue pauses without a loop');
		await togglePlugin('limusic.skip-disliked', false);
		await installPlugin(bundle('test.error', `throw new Error('expected failure');`, []));
		await togglePlugin('test.error', true); await wait(1000);
		assert(plugins.errors['test.error']?.includes('expected failure') && !plugins.items.find(p => p.id==='test.error')?.enabled, 'Runtime failures stop the plugin');
		await installPlugin(bundle('test.private-crash', `api.setDontSend(true).then(() => { throw new Error('expected private failure'); });`, ['privacy.control']));
		await togglePlugin('test.private-crash', true); await wait(1000);
		assert(settings.dontsend === 'true' && plugins.items.find(p => p.id==='limusic.dontsend')?.enabled, 'Privacy failures keep DontSend on');
		await togglePlugin('limusic.dontsend', false);
	}
</script>
<main class="mx-auto max-w-5xl p-6 text-foreground">
	<header class="mb-5 flex gap-3"><button onclick={() => tab='equalizer'}>Equalizer</button><button onclick={() => tab='plugins'}>Plugins</button><button onclick={() => test().catch(e => checks.push('FAIL ' + String(e)))}>Run runtime tests</button><button onclick={() => document.documentElement.classList.toggle('dark')}>Toggle light/dark</button></header>
	{#if checks.length}<pre class="mb-5 rounded-xl border p-4 text-xs">{checks.join('\n')}</pre>{/if}
	<div class="rounded-xl border bg-background">{#if tab==='equalizer'}<EqualizerSettings />{:else}<PluginsSettings />{/if}</div>
</main>
