# Plugins in the Partvision fork

Windows preview builds use the separate `com.partvision.limusic` app identifier, so they do not
share account/session data with an installed upstream LiMusic. Upstream auto-updates are disabled
to prevent replacing this fork's features. Configure a fork-owned signed feed before distributing
self-updating installers. Last.fm requires your own build-time `src-tauri/lastfm.keys` credentials;
the upstream project does not publish them. ListenBrainz and Discord keep their normal setup.

Open **Settings → Plugins**, import a `.json` plugin bundle, then enable it. Imports are
disabled until you turn them on. The card lists every permission granted when enabled.
Disabling a plugin tears down its Worker, subscriptions, theme and privacy request.

**DontSend** suppresses explicit YouTube playback and search-history reporting, Last.fm and
ListenBrainz now-playing/scrobbles, and Discord Rich Presence. It is applied in Rust at startup,
before a restored queue can play. Your existing integration preferences and credentials are
preserved. Streaming and browsing still contact YouTube; this is not anonymous playback. Past
history and requests already in flight cannot be retracted. Voluntarily joining Listen Together
still shares the session's playback with its participants. Local On Repeat counts are retained.

**Skip Disliked Songs** uses the same JavaScript API as custom plugins. It reacts to the current
track's rating, including a rating learned after playback begins, and picks the next queue item
not known to be disliked. When none remains it pauses, including under repeat-all/one. An unknown
rating can only be skipped once YouTube returns it. Playback in a Listen Together guest is
host-controlled, so plugins cannot override the host.

## JavaScript bundle

```json
{
  "apiVersion": 1,
  "id": "example.skip-disliked",
  "name": "My Skip Plugin",
  "version": "1.0.0",
  "description": "Skip songs I dislike.",
  "type": "script",
  "permissions": ["playback.read", "playback.control"],
  "source": "api.onPlayback(s => { if (s.rating === 'dislike' && !s.paused) api.skipDisliked().catch(console.error); });"
}
```

The `source` is ordinary JavaScript, run with a global `api`. Bundle your dependencies into that
source: remote imports and network calls are blocked. A plugin runs in a Worker inside a
sandboxed opaque-origin iframe. It has no parent DOM, session credentials, filesystem, or direct
Tauri command access. Syntax/runtime errors stop the plugin and appear on its card. Message
floods and unresponsive Workers are stopped. Metadata only reaches plugins with `playback.read`.

| API | Permission | Behavior |
| --- | --- | --- |
| `api.onPlayback(callback)` | `playback.read` | Subscribe to song, rating, pause and queue changes; returns an unsubscribe function |
| `await api.getPlayback()` | `playback.read` | `{ track: { id, title, artists, album } \| null, rating, paused, queue, currentIndex }` |
| `await api.next()` | `playback.control` | Advance using the normal transport behavior |
| `await api.pause()` | `playback.control` | Pause if playing |
| `await api.skipDisliked()` | `playback.control` | Bounded skip to an eligible queue item, or pause |
| `await api.setDontSend(true/false)` | `privacy.control` | Request/release suppressed activity reporting |
| `await api.setTheme({ light, dark })` | `theme.write` | Apply validated theme tokens |
| `await api.getStorage()` | none | Read only this plugin's saved data |
| `await api.setStorage(object)` | none | Save an object under 16 KB; `__dontsend` is reserved |

Privacy requests combine: one plugin releasing its request never overrides another plugin or
the built-in DontSend switch. They persist across restarts and are released on disable/removal.
If a privacy plugin crashes, built-in DontSend stays on until you explicitly turn it off.
New versions require removing the old bundle and importing again, so an update cannot silently
expand permissions. Bundle limits are 150 KB, 100 KB of source, and 32 installed plugins.

## Theme bundle

```json
{
  "apiVersion": 1, "id": "example.midnight", "name": "Midnight",
  "version": "1.0.0", "description": "A blue palette.", "type": "theme",
  "permissions": ["theme.write"],
  "theme": {
    "light": { "background": "#f5f7ff", "foreground": "#18213b", "primary": "#365bcc" },
    "dark": { "background": "#101525", "foreground": "#edf0ff", "primary": "#8ca9ff" }
  }
}
```

Palettes override the standard color tokens, such as `background`, `foreground`, `card`,
`primary`, `accent`, `muted`, `border`, and their corresponding foreground/sidebar tokens.
Use hex, RGB, HSL, OKLab or OKLCH values. Arbitrary CSS, selectors, URLs, and imports are not
accepted. Both palettes are required. The last enabled theme's overlapping tokens win; disabling
it restores the underlying appearance. Theme palettes follow the existing light/dark switch.

## Equalizer

**Settings → Equalizer** offers ten bands (31 Hz–16 kHz), a preamp, bass and treble shelves,
stereo width, and a peak limiter. These are libmpv/FFmpeg audio filters, applied to both playback
decks and composed with existing loudness normalization and pitch processing. Bypass restores
the original graph without erasing the saved controls. Changes apply on slider release.

Built-in presets include Flat, Bass boost, Deep bass, Rock, Vocals, Electronic, Warm and Night
listening. Save named presets, or export/import their JSON. Lower the preamp when boosting several
bands; the limiter protects peaks but does not replace headroom. Stereo width changes stereo
content only. Speed and pitch reuse LiMusic's existing controls and reset on restart; pitch
requires libmpv built with rubberband. EQ settings and named presets persist across restarts.

Filter reference: [FFmpeg audio filters](https://ffmpeg.org/ffmpeg-filters.html),
[mpv audio filter chain](https://mpv.io/manual/stable/#audio-filters).
