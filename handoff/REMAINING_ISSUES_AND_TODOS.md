# Remaining Issues And Todos

## P0

1. Validate the FFmpeg MP4 export path on long real projects on macOS and Windows x64, including audio sync, webcam offset, cursor overlay, zoom, trims, and speed changes.
2. Validate Windows x64 FFmpeg encoder selection on real NVIDIA/Intel/AMD machines and expose the actual encoder used in UI/diagnostics.
3. Add package-local `cache/media-info.json` so editor-open can trust persisted media metadata before deeper validation.
4. Extend the current package-local `cursor-preview.json` into chunked/append cursor storage for true multi-hour recordings. Preview samples now survive cold app launches, but live recording still keeps samples in memory and rewrites full cursor snapshots.
5. Add video metadata ready timing from `VideoPlayback` and connect it to the `[editor-open]` log story.
6. Prevent `StreamingVideoDecoder.loadMetadata()` and whole-file `readBinaryFile` paths from running during first-screen editor open. The editor is staged now, but export still uses whole-source WebDemuxer loading and should not leak back into first-screen open.
7. Add visible editor preparation state for long media: waveform, cursor index, auto zoom suggestions, thumbnails/proxies.
8. Implement the real preview-proxy pipeline for very long/high-resolution recordings. This is not done yet: generate `proxy-screen.mp4` / `proxy-webcam.mp4` in a package/global cache, record proxy health in metadata, switch editor playback to proxies when ready, and keep export on original media.
9. Add a background job manager for media preparation so media info, waveform, thumbnails, cursor indexes, auto zoom suggestions, and proxy generation are coordinated instead of being separate ad hoc effects.
10. Before another Windows one-hour optimization, add hard timing checkpoints for manifest read, file stat, session preparation, video metadata readiness, first React paint, cursor preview load, waveform start/cache/generation, auto zoom start/finish, and proxy generation.
11. Validate the implemented Auto Zoom / Follow Mouse model on real recordings: three per-zoom modes (`Off`, `Smart Follow Mouse`, `Always Follow Mouse`), mutually exclusive global Smart/Always controls, scale-aware smart safe areas, slower eased always-follow motion, ignored isolated single clicks, retained repeated-click/double-click/press/drag suggestions, long stable same-area explanation zooms, small-region dwell detection for natural hand jitter, long-dwell spans starting at dwell onset, and `1500ms` max auto-merge gap between nearby generated zooms.

## Existing P0 Validation

0. Publish fresh macOS and Windows builds after the 2026-06-22 public-feedback fixes. Validate that the macOS packaged app no longer throws `The 'screen' module can't be used before the app 'ready' event` on launch/reactivation, and that a clean Windows x64 profile opens with a selected default screen source and an enabled record button.
1. Validate the known 4.4 GB legacy package opens the main screen video without freezing by skipping the oversized `webcam.webm`.
2. Validate a longer macOS recording with microphone, system audio, native `webcam.mov`, editable cursor, and auto zoom enabled. The earlier macOS PixelBufferAdaptor path is abandoned after repeated real-package finalize failures, and the later `AVCaptureMovieFileOutput` attempt is abandoned after producing a readable but truncated `webcam.mov`; new macOS validation must target the direct `AVCaptureVideoDataOutput -> AVAssetWriterInput.append(sampleBuffer)` path. One real package has passed at ~11 minutes (`screen.mp4` ~665s, `webcam.mov` ~664s) after the ffmpeg input-probe fix, but 20+ minute validation is still required.
3. Validate a long macOS recording stops cleanly and leaves a ready `.likelysnap` package that opens in the editor.
4. Validate moving a package to another folder and reopening it.
5. Validate deleting `manifest.json` and reopening the package rebuilds a recoverable manifest.
6. Validate killing the app mid-recording leaves recoverable package artifacts.
7. Validate native Windows x64 webcam sidecar recording as bounded `webcam.mp4` on Windows hardware, including the persisted `webcamStartOffsetMs` manifest field.
8. Validate the known ~17 minute package `/Users/macbook/Movies/LikelySnap/recording-1781685552950.likelysnap` opens interactively with waveform on by default and confirm generated peaks are cached for subsequent opens.
9. Validate the Windows one-hour package against the `cursor-preview.json` fix. Expected result: editor becomes interactive without waiting for a full `cursor.json` parse; logs should show `[editor-open] cursor preview cache hit` or `[editor-open] cursor preview prepared`.
10. Validate the standalone settings window end to end from both entry points: launch HUD gear and editor top-bar gear. Confirm recording/project/cache directory pickers, cache size/clear, OBS-style Standard/High/Ultra/Custom routes, and default editable cursor/mic/system audio/webcam toggles persist and affect the next recording.
11. Validate macOS native recordings from the settings UI for all preset profiles: Standard should request `1080p / 30 FPS / 5 Mbps`, High should request source backing pixels / `60 FPS / 8 Mbps`, Ultra should request source backing pixels / `60 FPS / 15 Mbps`, and Custom should honor manual resolution/FPS/Mbps with bitrate capped at `60 Mbps`.
12. Validate Windows native recordings on Windows x64 after the helper rebuild: FPS and bitrate should match the settings, while encoded width/height should remain the WGC source size until GPU scaling is implemented.

## P1

1. Add MP4 export sync diagnostics.
2. Move any remaining MP4 fallback/export-save paths away from in-memory final Blobs; the primary MP4 path is FFmpeg streaming now, but compatibility paths should stay clearly gated.
3. Ensure exported MP4 with source audio fails loudly if audio cannot be preserved.
4. Add broader automated tests for custom recording directories and interrupted package recovery.
5. Add real macOS long-recording validation evidence.
6. Validate the refined auto zoom and Follow Mouse model on real recordings: ordinary single-click UI actions should not create distracting zooms, repeated-click/double-click/press/drag/dwell actions should create explainable zooms, long article/script dwells should stay zoomed for the narrated section, Smart Follow should only pan near scale-aware boundaries, Always Follow should feel slower/eased, and each selected zoom should override the global defaults.
7. Add append/chunked cursor telemetry storage for multi-hour recordings. The current editor uses package-local `cursor-preview.json`, but recording still keeps and rewrites full cursor snapshots.
8. Add sidecar/proxy diagnostics for file size, duration, codec, and skipped webcam state.
9. Add Windows CI or documented manual verification for `npm run build:native:win`, `npm run build:win:portable`, and `npm run test:wgc-full:win`.
10. Consider progressive waveform progress reporting if first-time generation on multi-hour recordings needs a visible percentage instead of the current lightweight skeleton.
11. Add automated IPC coverage for `app-settings.json` migration, cache directory changes, and project-directory save/open defaults.
12. Add a user-facing encoder setting (`auto`, `prefer hardware`, `compatibility CPU`) and diagnostics showing whether the finished export used GPU or CPU encoding.
13. Make MP4 export frame rate source-aware instead of hard-coded to 60 FPS; default to source FPS or a user-selected export FPS so 30 FPS recordings do not pay for double-frame export work.
14. Move GIF export to a streaming/temp-file path or explicitly label it as short-form only.
15. Add a real Windows native recording GPU scaling pass if Windows must honor recording resolution choices (`1080p`, `1440p`, `4K`, custom). The current WGC encoder uses source texture dimensions because `CopyResource` requires matching texture sizes.

## P2

1. Add "Show Recording Folder" action after recording.
2. Add project relink flow if a media file moves.
3. Add UI affordance to reveal package contents for diagnostics.

## Validation Checklist

1. Record 20 minutes on macOS and stop successfully.
2. Confirm selected recording directory shows one timestamped `recording-YYYY-MM-DD-HH-mm-ss-SSS.likelysnap` package with the LikelySnap Finder icon.
3. Confirm package contains `screen.mp4`, optional validated native webcam sidecar (`webcam.mov` on macOS, `webcam.mp4` on Windows), `cursor.json`, `cursor-preview.json`, and `manifest.json`. For macOS, confirm no 0-byte webcam, no `.sb-*` AVAssetWriter side-band files, and a readable `webcam.mov` video track.
4. Confirm raw source file plays in Finder/QuickTime with audio in sync.
5. Confirm editor auto zoom suggestions still appear from cursor telemetry.
6. Confirm selected zoom settings can switch a single zoom between `Off`, `Smart Follow Mouse`, and `Always Follow Mouse` even when a global follow button has been used.
7. Confirm the global Smart Follow Mouse and global Always Follow Mouse buttons are mutually exclusive.
8. Confirm long same-area explanations become one stable bounded long zoom instead of repeated short jumps.
9. Confirm held mouse-button/drag spans default their suggested zoom to Smart Follow Mouse, while ordinary single clicks and click-and-leave UI actions do not create auto zooms.
10. Confirm export MP4 remains in sync.
11. Kill the app mid-recording and verify the package is recoverable.
12. Open an old package with `webcam.webm`; if the sidecar is oversized, confirm the app warns and still opens the main video.
13. Open a long recording with the trim waveform visible by default, confirm the editor remains responsive during generation, then close/reopen and confirm the waveform loads from cache.
14. Change recording quality/resolution/FPS/bitrate in the standalone settings window and confirm the next native macOS recording request uses the configured profile.
15. Open settings from the editor top-bar gear and confirm the same persisted values are shown as the launch HUD settings entry.
16. On a Windows x64 build machine, run `npm run build:win:portable` and confirm the produced zip passes `npm run verify:win:portable`, including `resources/electron/native/bin/win32-x64/wgc-capture.exe`, `cursor-sampler.exe`, bundled FFmpeg, and `LikelySnap.exe`.
17. On Windows x64, record with webcam enabled and inspect `.likelysnap/manifest.json`; confirm `media.webcamStartOffsetMs` is present when `webcam.mp4` exists, then verify preview/export webcam sync.
18. On Windows x64, export the same project with Task Manager's CPU/GPU video encode graphs visible and confirm the UI/diagnostics report the actual encoder path. Current code-level expectation is hardware-first only when FFmpeg exposes `h264_nvenc`; otherwise it falls back to CPU.
