# Remaining Issues And Todos

## P0

1. Validate the known 4.4 GB legacy package opens the main screen video without freezing by skipping the oversized `webcam.webm`.
2. Validate a real macOS recording with microphone, system audio, native `webcam.mp4`, editable cursor, and auto zoom enabled.
3. Validate a long macOS recording stops cleanly and leaves a ready `.likelysnap` package that opens in the editor.
4. Validate moving a package to another folder and reopening it.
5. Validate deleting `manifest.json` and reopening the package rebuilds a recoverable manifest.
6. Validate killing the app mid-recording leaves recoverable package artifacts.
7. Validate native Windows webcam sidecar recording as bounded `webcam.mp4` on Windows hardware.
8. Validate the known ~17 minute package `/Users/macbook/Movies/LikelySnap/recording-1781685552950.likelysnap` opens interactively with waveform off by default, then enable waveform and confirm generated peaks are cached for subsequent opens.

## P1

1. Add MP4 export sync diagnostics.
2. Make MP4 export write to a temp file instead of an in-memory `BufferTarget`.
3. Ensure exported MP4 with source audio fails loudly if audio cannot be preserved.
4. Add broader automated tests for custom recording directories and interrupted package recovery.
5. Add real macOS long-recording validation evidence.
6. Validate the refined auto zoom and Follow Mouse model on real recordings: ordinary dwells/clicks should produce stable fixed-position zooms, held mouse-button spans should produce Follow Mouse zooms, and per-zoom settings should override either result.
7. Add cursor telemetry indexing/downsampling for multi-hour recordings.
8. Add sidecar/proxy diagnostics for file size, duration, codec, and skipped webcam state.
9. Add Windows CI or documented manual verification for `npm run build:native:win` and `npm run test:wgc-full:win`.
10. Consider progressive waveform progress reporting if first-time generation on multi-hour recordings needs a visible percentage instead of the current lightweight skeleton.

## P2

1. Add "Show Recording Folder" action after recording.
2. Add recording directory management to editor settings.
3. Add project relink flow if a media file moves.
4. Add UI affordance to reveal package contents for diagnostics.

## Validation Checklist

1. Record 20 minutes on macOS and stop successfully.
2. Confirm selected recording directory shows one `recording-<id>.likelysnap` package.
3. Confirm package contains `screen.mp4`, optional native `webcam.mp4`, `cursor.json`, and `manifest.json`.
4. Confirm raw source file plays in Finder/QuickTime with audio in sync.
5. Confirm editor auto zoom suggestions still appear from cursor telemetry.
6. Confirm selected zoom settings can switch a single zoom between Follow Mouse off/on even when the global Follow Mouse button has been used.
7. Confirm long same-area explanations become one longer fixed-position zoom instead of repeated short jumps.
8. Confirm held mouse-button spans default their suggested zoom to Follow Mouse, while ordinary dwells/clicks default to stable fixed-position zoom.
9. Confirm export MP4 remains in sync.
10. Kill the app mid-recording and verify the package is recoverable.
11. Open an old package with `webcam.webm`; if the sidecar is oversized, confirm the app warns and still opens the main video.
12. Enable the trim waveform on a long recording, confirm the editor remains responsive during generation, then close/reopen and confirm the waveform loads from cache.
