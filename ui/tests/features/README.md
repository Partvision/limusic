# Browser feature checks

From `ui/` run:

```sh
pnpm exec vite --config tests/features/vite.config.ts
```

Open `http://127.0.0.1:5184/feature-preview.html` and click **Run runtime tests**. Reload before
running again. Thirteen checks exercise real sandbox Workers, permission denial, network/DOM/IPC
isolation, theme application/removal, combined privacy requests and fail-closed behavior, and
disliked-song skipping (including an all-disliked repeat queue).

This harness mocks the Tauri backend; it never signs in, streams YouTube, or changes native app
preferences. Its equalizer panel is also useful for checking light/dark layout and keyboard
controls. Real DSP is covered by the player's PCM sample test and two-deck filter checks.

On Windows, Cargo's app test executable needs a Common Controls v6 manifest because an upstream
dependency imports `TaskDialogIndirect`. Build the tests with `cargo test --workspace --all-targets
--no-run`, embed that manifest with the Windows SDK `mt.exe`, then run the app test executable.
The normal Tauri release executable already includes this manifest.
