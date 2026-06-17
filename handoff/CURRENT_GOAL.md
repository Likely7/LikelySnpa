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
16. Edited MP4 export must move to a temp-file/streaming output path before LikelySnap claims multi-hour export support. Current recording writes are durable, but final edited exports still accumulate the muxed MP4 in memory.
17. Windows export should not be CPU-only by accident. The product needs an explicit encoder strategy with hardware-first default where supported, software fallback, and UI/diagnostics that report the actual encoder mode used.
18. The editor must move toward a mainstream NLE architecture: instant timeline open, asynchronous media preparation, package/cache indexes, waveform/proxy/background jobs, and original-media export.

## Current Priority

Push the package model from "recording works" to "long recordings remain editable", using the architecture in `handoff/NLE_EDITOR_ARCHITECTURE_PLAN.md`:

- Make editor-open interactive before waveform, cursor, auto zoom, thumbnails, and proxy generation finish.
- Keep the newly implemented staged editor-open path intact: cursor preview data, main-process cursor cache, idle auto zoom, idle waveform preparation, and first-screen timing logs.
- Add package-local media/cursor caches so cold app launches do not need to parse/index from scratch.
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
- Confirm the Windows one-hour package opens interactively after the first architecture pass: preview cursor samples should load instead of full cursor recording data, waveform should prepare in idle time, and auto zoom should not block the editor.
- Confirm the standalone settings window opens from both the launch HUD gear and editor top-bar gear, then persists and applies recording/project/cache directories, cache cleanup, quality, FPS, editable cursor, microphone, system audio, and webcam defaults.
- Keep export durability on the next P1 track: MP4 export still needs streaming/temp-file output before claiming multi-hour export support.
- Keep Windows export performance on the next P1 track: current WebCodecs MP4 export tries `prefer-software` before `prefer-hardware` on Windows, and MP4 export is fixed at 60 FPS, so long 30 FPS recordings can do unnecessary work.
