# Current Goal

Build a durable macOS/Windows LikelySnap recorder/editor that can record long videos safely, write directly to a user-selected directory, preserve audio/video sync, package each recording as one user-facing `.likelysnap` document, keep cursor-driven zoom/edit/export features intact, and open long recordings without loading multi-GB sidecars into memory.

## Hard Requirements

1. Recordings write continuously to disk during capture.
2. The user can choose the recording directory before recording.
3. Stopping a long recording must not lose the video.
4. macOS recordings must preserve audio/video sync in the source file.
5. MP4 exports must preserve audio/video sync from the edited timeline.
6. Cursor telemetry must remain aligned with video time so auto zoom and Follow Mouse zoom continue to work.
7. Cursor-driven zoom must remain stable and controllable: auto zoom suggestions choose candidate time spans, each zoom decides whether Follow Mouse is enabled, and macOS window capture must normalize cursor positions against the captured window bounds.
8. Crash recovery must leave inspectable and recoverable media files.
9. New recordings must appear to users as one `.likelysnap` package, while internally preserving live-write files.
10. Legacy loose recordings must remain loadable.
11. Webcam sidecars must be long-recording safe: native MP4 sidecars where supported, bounded fallback WebM where necessary, and editor-side degradation if a sidecar is too large or unhealthy.
12. The editor must reference large media like an NLE: no whole-file media reads on open, non-blocking sidecars, lazy/cached waveform generation, and incremental export paths for long videos.
13. User-facing settings must be real, persistent, and wired to the recorder/editor behavior: recording directory, project directory, cache directory, cache clearing, recording quality, frame rate, and default recording toggles.
14. App settings must open from both the launch HUD and the editor as a standalone, fully clickable Electron window, not as a clipped modal inside the transparent HUD overlay.
15. Windows deliverables are x64-only for now. Portable Windows builds must include the x64 WGC helper binaries and must not silently package without them.
16. Edited MP4 export must use an FFmpeg-backed temp-file/streaming output path before LikelySnap claims multi-hour export support. This is now implemented as the primary MP4 path, but still needs longer real-machine export validation.
17. Windows export should not be CPU-only by accident. The product now has an explicit FFmpeg hardware-first strategy with software fallback, and still needs UI/diagnostics that report the actual encoder mode used.
18. The editor must move toward a mainstream NLE architecture: instant timeline open, asynchronous media preparation, package/cache indexes, waveform/proxy/background jobs, and original-media export.
19. Recording quality must be explicit and inspectable, not hidden behind fixed 4K assumptions. Presets are `Standard = 1080p/30/5Mbps`, `High = source/60/8Mbps`, and `Ultra = source/60/15Mbps`; manual resolution/FPS/bitrate controls are only active on the separate Custom route, with custom bitrate capped at `60 Mbps`.

## Current Priority

Push the package model from "recording works" to "long recordings remain editable", using the architecture in `handoff/NLE_EDITOR_ARCHITECTURE_PLAN.md`:

- Make editor-open interactive before waveform, cursor, auto zoom, thumbnails, and proxy generation finish.
- Keep the newly implemented staged editor-open path intact: package-local `cursor-preview.json`, preview cursor bridge data, main-process cursor cache, idle auto zoom, idle waveform preparation, and first-screen timing logs.
- Add package-local media caches and deeper cursor chunk indexes so cold app launches do not need to parse/index from scratch.
- Avoid whole-file media reads and packet scans in first-screen editor open.
- Add the remaining timing instrumentation for video metadata readiness and future proxy/cache jobs.
- Record with microphone, webcam, and editable cursor enabled.
- Confirm package contents live-update while recording.
- Confirm editor/open dialogs load `.likelysnap` package directories as recordings.
- Confirm moved packages reopen from relative `manifest.json` paths.
- Confirm missing-manifest recovery rebuilds a usable package session.
- Confirm editor preview and exported MP4 stay in sync.
- Validate the updated auto zoom and Follow Mouse model: normal auto zoom suggestions should default to stable fixed-position zooms, suggestions created from held mouse-button spans should default to Follow Mouse, and every selected zoom must remain individually switchable between Follow Mouse off/on in the settings panel.
- Validate the implemented long-recording native webcam plan in `handoff/LONG_RECORDING_NATIVE_WEBCAM_PLAN.md`: macOS native `webcam.mp4`, Windows native `webcam.mp4`, legacy `webcam.webm` compatibility, and editor-side degradation for huge sidecars.
- Validate Windows native `webcam.mp4` sidecar sync after the WGC helper now emits and persists `webcamStartOffsetMs`.
- Produce the Windows x64 portable zip on a Windows x64 build machine with `npm run build:win:portable`; this macOS Apple Silicon machine cannot produce the final Windows zip because the WGC helper binary is missing and electron-builder's Wine resource step cannot execute.
- Confirm the existing 4.4 GB `webcam.webm` package opens the main video without freezing by skipping the unsafe webcam sidecar.
- Confirm the known ~17 minute package stays interactive with waveform on by default and uses the ranged/cached waveform path.
- Confirm the Windows one-hour package opens interactively after the cursor-preview pass: `cursor-preview.json` should load instead of full `cursor.json`, waveform should prepare in idle time, and auto zoom should not block the editor.
- Treat the layout panel as intentionally disabled when no webcam sidecar exists; this is not a Windows layout bug unless a recording includes webcam media and `webcamVideoPath` is still missing.
- Confirm the standalone settings window opens from both the launch HUD gear and editor top-bar gear, then persists and applies recording/project/cache directories, cache cleanup, quality, FPS, editable cursor, microphone, system audio, and webcam defaults.
- Confirm the OBS-style recording controls persist and apply: Standard/High/Ultra preset routes, the separate Custom route, source/1080p/1440p/4K/custom resolution, preset/custom FPS, and custom Mbps capped at `60`. On macOS, verify source mode records backing pixels and explicit modes record requested dimensions. On Windows, verify FPS and bitrate apply while resolution remains WGC source-size until the GPU scaling pass is implemented.
- Validate FFmpeg MP4 export on longer real projects: renderer compositing feeds frames, FFmpeg handles hardware-first encoding, audio muxing, and temp-file/streaming output.
- Keep the legacy WebCodecs MP4 exporter only as a compatibility fallback; do not reintroduce Blob-based final MP4 saves as the main path.
- Keep source-aware FPS on the export track: current MP4 export is fixed at 60 FPS, so long 30 FPS recordings can do unnecessary work.
