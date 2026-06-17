# Remaining Issues And Todos

## P0

1. Validate the known 4.4 GB legacy package opens the main screen video without freezing by skipping the oversized `webcam.webm`.
2. Validate a real macOS recording with microphone, system audio, native `webcam.mp4`, editable cursor, and auto zoom enabled.
3. Validate a long macOS recording stops cleanly and leaves a ready `.likelysnap` package that opens in the editor.
4. Validate moving a package to another folder and reopening it.
5. Validate deleting `manifest.json` and reopening the package rebuilds a recoverable manifest.
6. Validate killing the app mid-recording leaves recoverable package artifacts.
7. Validate native Windows x64 webcam sidecar recording as bounded `webcam.mp4` on Windows hardware, including the persisted `webcamStartOffsetMs` manifest field.
8. Validate the known ~17 minute package `/Users/macbook/Movies/LikelySnap/recording-1781685552950.likelysnap` opens interactively with waveform on by default and confirm generated peaks are cached for subsequent opens.
9. Validate the standalone settings window end to end from both entry points: launch HUD gear and editor top-bar gear. Confirm recording/project/cache directory pickers, cache size/clear, quality/FPS settings, and default editable cursor/mic/system audio/webcam toggles persist and affect the next recording.

## P1

1. Add MP4 export sync diagnostics.
2. Make MP4 export write to a temp file or streaming file target instead of an in-memory `mediabunny` `BufferTarget`; this is required before claiming reliable multi-hour edited exports.
3. Ensure exported MP4 with source audio fails loudly if audio cannot be preserved.
4. Add broader automated tests for custom recording directories and interrupted package recovery.
5. Add real macOS long-recording validation evidence.
6. Validate the refined auto zoom and Follow Mouse model on real recordings: ordinary dwells/clicks should produce stable fixed-position zooms, held mouse-button spans should produce Follow Mouse zooms, and per-zoom settings should override either result.
7. Add cursor telemetry indexing/downsampling for multi-hour recordings.
8. Add sidecar/proxy diagnostics for file size, duration, codec, and skipped webcam state.
9. Add Windows CI or documented manual verification for `npm run build:native:win`, `npm run build:win:portable`, and `npm run test:wgc-full:win`.
10. Consider progressive waveform progress reporting if first-time generation on multi-hour recordings needs a visible percentage instead of the current lightweight skeleton.
11. Add automated IPC coverage for `app-settings.json` migration, cache directory changes, and project-directory save/open defaults.
12. Add a durable Windows export encoder policy: hardware-first by default when supported, software fallback for compatibility, a user-facing encoder setting (`auto`, `prefer hardware`, `compatibility CPU`), and diagnostics showing whether the finished export used GPU or CPU encoding.
13. Make MP4 export frame rate source-aware instead of hard-coded to 60 FPS; default to source FPS or a user-selected export FPS so 30 FPS recordings do not pay for double-frame export work.

## P2

1. Add "Show Recording Folder" action after recording.
2. Add project relink flow if a media file moves.
3. Add UI affordance to reveal package contents for diagnostics.

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
12. Open a long recording with the trim waveform visible by default, confirm the editor remains responsive during generation, then close/reopen and confirm the waveform loads from cache.
13. Change recording quality/FPS in the standalone settings window and confirm the next native macOS recording request uses the configured profile.
14. Open settings from the editor top-bar gear and confirm the same persisted values are shown as the launch HUD settings entry.
15. On a Windows x64 build machine, run `npm run build:win:portable` and confirm the produced zip contains `resources/electron/native/bin/win32-x64/wgc-capture.exe` and `cursor-sampler.exe`.
16. On Windows x64, record with webcam enabled and inspect `.likelysnap/manifest.json`; confirm `media.webcamStartOffsetMs` is present when `webcam.mp4` exists, then verify preview/export webcam sync.
17. On Windows x64, export the same project with Task Manager's CPU/GPU video encode graphs visible and confirm the UI/diagnostics report the actual encoder path. Current code-level expectation is CPU-first because Windows uses WebCodecs `prefer-software` before `prefer-hardware`.
