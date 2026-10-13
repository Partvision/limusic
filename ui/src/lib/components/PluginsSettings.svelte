<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { plugins, installPlugin, removePlugin, togglePlugin } from '$lib/plugins.svelte';
	let input: HTMLInputElement;
	let busy = $state(false);
	let error = $state('');
	const permissionLabels: Record<string, string> = {
		'playback.read': 'Read song and queue metadata', 'playback.control': 'Skip and pause songs',
		'privacy.control': 'Control listening activity reporting', 'theme.write': 'Change theme colors'
	};
	async function run(action: () => Promise<void>) {
		busy = true; error = '';
		try { await action(); } catch (e) { error = String(e); } finally { busy = false; }
	}
	async function importFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		await run(async () => {
			if (!file || file.size > 150_000) throw new Error('Choose a plugin JSON bundle under 150 KB.');
			await installPlugin(await file.text());
		});
		input.value = '';
	}
</script>

<div class="min-w-0 flex-1 overflow-y-auto px-6 py-5">
	<div class="mb-5 flex items-start justify-between gap-4">
		<div><h3 class="text-sm font-semibold">Make LiMusic yours</h3><p class="mt-1 text-xs text-muted-foreground">Import theme palettes and custom JavaScript plugin bundles. Imported plugins start disabled.</p></div>
		<Button size="sm" disabled={!plugins.loaded || busy} onclick={() => input.click()}>Import plugin</Button>
		<input bind:this={input} type="file" accept=".json" class="hidden" onchange={importFile} />
	</div>
	{#if error}<p role="alert" class="mb-4 rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>{/if}
	{#if plugins.dontsend}<p role="status" class="mb-4 rounded-xl border bg-muted p-3 text-sm">DontSend is active. Listening activity reports and Discord presence are suppressed.</p>{/if}
	{#if !plugins.loaded}<p class="text-sm text-muted-foreground">Loading plugins…</p>{/if}
	<div class="space-y-3">
		{#each plugins.items as plugin (plugin.id)}
			<div class="rounded-xl border bg-card p-4">
				<div class="flex items-start justify-between gap-4">
					<div><h4 class="text-sm font-semibold">{plugin.name} <span class="font-normal text-muted-foreground">v{plugin.version}</span></h4>
					<p class="mt-1 text-xs text-muted-foreground">{plugin.description}</p></div>
					<Switch checked={plugin.enabled} disabled={busy} aria-label="Enable {plugin.name}" onCheckedChange={(on) => run(() => togglePlugin(plugin.id, on))} />
				</div>
				<div class="mt-3 flex flex-wrap gap-1.5">
					<span class="rounded-md bg-muted px-2 py-1 text-[10px]">{plugin.id.startsWith('limusic.') ? 'Built in' : plugin.type === 'theme' ? 'Theme' : 'JavaScript'}</span>
					{#each plugin.permissions as permission}<span class="rounded-md bg-muted px-2 py-1 text-[10px]">{permissionLabels[permission]}</span>{/each}
				</div>
				{#if plugin.id === 'limusic.dontsend'}<p class="mt-3 text-xs text-muted-foreground">Streaming still contacts YouTube. This does not erase past history, retract reports already sent, or hide a Listen Together session you join.</p>{/if}
				{#if plugins.errors[plugin.id]}<p role="alert" class="mt-3 text-xs text-destructive">Stopped: {plugins.errors[plugin.id]}</p>{/if}
				{#if !plugin.id.startsWith('limusic.')}<Button class="mt-3" variant="ghost" size="sm" disabled={busy} onclick={() => run(() => removePlugin(plugin.id))}>Remove</Button>{/if}
			</div>
		{/each}
	</div>
	<p class="mt-5 text-xs text-muted-foreground">Enabling a plugin grants the permissions shown on its card. JavaScript plugins have no network, account credentials, or direct access to the app’s backend.</p>
</div>
