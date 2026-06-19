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
20. Auto Zoom must use a maintainable intent model instead of one-off cursor dwell heuristics. Zoom regions must support three independent follow modes: `Off`, `Smart Follow Mouse`, and `Always Follow Mouse`.
21. Smart Follow Mouse is the default global follow behavior for generated zooms and must be mutually exclusive with the global Always Follow Mouse batch toggle. Enabling one global follow mode disables the other.
22. Smart Follow Mouse must respect each zoom region's effective scale/custom scale. Higher zoom levels have a smaller visible viewport, so the safe cursor area and edge-follow threshold must be derived from the actual zoom scale, not a fixed percentage.

## Current Priority

Push the package model from "recording works" to "long recordings remain editable", using the architecture in `handoff/NLE_EDITOR_ARCHITECTURE_PLAN.md`:

- Make editor-open interactive before waveform, cursor, auto zoom, thumbnails, and proxy generation finish.
- Keep the newly implemented staged editor-open path intact: package-local `cursor-preview.json`, preview cursor bridge data, main-process cursor cache, idle auto zoom, idle waveform preparation, and first-screen timing logs.
- Do not confuse the current staged-open work with a finished proxy-media pipeline. Actual preview proxy files and proxy playback selection have not been implemented yet.
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
- Replace the current two-state Follow Mouse behavior with the three-state model: `Off`, `Smart Follow Mouse`, and `Always Follow Mouse`. Smart follow should hold the camera still while the cursor remains inside a scale-aware safe area, then ease toward the cursor only when it approaches the cropped zoom boundary. Always follow should still follow continuously, but with slower eased camera motion so the cursor leads and the picture catches up instead of shaking tightly.
- Auto Zoom selection should be rebalanced against OpenScreen/Screen Studio behavior: isolated single clicks should not create zooms, repeated clicks/double-clicks/press-and-hold/drag/dwell intent should matter, long same-area explanation dwells should create longer stable zoom spans, and accepted regions should be explainable by interaction type.
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

## 2026-06-19 Rollback Note

`main` has been intentionally rolled back to `2458939` after the later MP4 faststart/webcam sidecar cleanup attempt made Windows long-project open behavior worse. The stable baseline contains the first staged editor-open pass, not a complete video-proxy pass. Future long-video work should start from explicit measurement and true media-cache/proxy architecture, not another isolated patch that changes package contents or MP4 finalization behavior.

## 2026-06-19 Auto Zoom / Follow Mouse Work

The next implementation pass starts from the stable rollback baseline and targets the product feel of Auto Zoom rather than package/media architecture. The intended durable model:

- Per zoom region: `Off`, `Smart Follow Mouse`, `Always Follow Mouse`.
- Global Smart Follow Mouse: default on; applies to generated zooms unless a region is manually changed.
- Global Always Follow Mouse: retained as a batch control for users who want every zoom to follow the cursor continuously.
- Global Smart Follow Mouse and global Always Follow Mouse are mutually exclusive to avoid conflicting camera instructions.
- Smart Follow Mouse uses a scale-aware safe area. At higher custom zoom scales, the visible area is smaller, so the cursor boundary threshold is tighter and the camera begins easing before the cursor is cropped.
- Always Follow Mouse is not a hard cursor lock. It should use slower damped motion with lead/lag, soft start, and soft settle so the view does not shake.
- Auto Zoom generation should move from raw dwell duration to intent scoring: isolated single clicks are ignored, repeated clicks/double-clicks and press/drag gestures are intentional short zooms, meaningful dwell is an intentional fixed zoom, long same-area dwell is an intentional long explanation zoom, and click-and-immediately-leave actions should not create distracting zooms.

Implementation status: code is now implemented and verified at type/test/build level. It still needs user-facing macOS recording/editor retest for product feel, especially Smart Follow boundary behavior at different custom zoom scales.

Follow-up status: after user testing, the auto zoom selector was tightened again. A plain single click is no longer a standalone trigger because it captures too many UI-control actions such as closing apps or clicking buttons. Long stable same-area cursor dwell is now a separate candidate class so article/script explanations can stay zoomed for the actual narrated section instead of producing one short fixed-length zoom. The dwell detector now uses a `1000ms` confirmation window for short hover zooms, and nearby auto zoom suggestions within `3000ms` can merge into one longer span so the follow-follow camera motion can carry the scene through the gap. Held mouse-button detection still requires at least `450ms` of press overlap to avoid treating ordinary slow clicks as press/drag intent.
