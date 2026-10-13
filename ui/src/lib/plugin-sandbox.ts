// Custom code runs in a disposable Worker inside an opaque-origin iframe. The iframe's CSP
// is inherited by its blob Worker: no network, imports, backend IPC, cookies, or parent DOM.
export function pluginSandbox(source: string): string {
	const worker = `
const pending = new Map(); let sequence = 0; const listeners = new Set();
const call = (method, args) => new Promise((resolve, reject) => {
  const id = ++sequence; pending.set(id, {resolve, reject}); postMessage({id, method, args});
});
const api = Object.freeze({
  onPlayback(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  getPlayback: () => call('getPlayback'),
  next: () => call('next'), pause: () => call('pause'),
  skipDisliked: () => call('skipDisliked'),
  setDontSend: (on) => call('setDontSend', on),
  setTheme: (theme) => call('setTheme', theme),
  getStorage: () => call('getStorage'), setStorage: (value) => call('setStorage', value)
});
onmessage = event => {
  const m = event.data;
  if (m.event === 'playback') {
    for (const fn of listeners) Promise.resolve().then(() => fn(m.state)).catch(e => postMessage({error: String(e)}));
  } else if (pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
  }
};
setInterval(() => postMessage({heartbeat: true}), 1000);
addEventListener('unhandledrejection', e => postMessage({error: String(e.reason)}));
try {\n${source}\n} catch (e) { postMessage({error: String(e)}); }
postMessage({ready: true});`;
	const encoded = JSON.stringify(worker).replace(/</g, '\\u003c');
	return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; child-src blob:; connect-src 'none'; form-action 'none'; base-uri 'none'"><script>
const worker = new Worker(URL.createObjectURL(new Blob([${encoded}], {type:'text/javascript'})));
worker.onmessage = e => parent.postMessage(e.data, '*');
worker.onerror = e => parent.postMessage({error: e.message || 'Plugin worker failed'}, '*');
onmessage = e => { if (e.source === parent) worker.postMessage(e.data); };
addEventListener('pagehide', () => worker.terminate());
</script>`;
}
