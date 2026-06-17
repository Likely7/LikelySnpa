# Current Goal

Build a durable macOS/Windows LikelySnap recorder/editor that can record long videos safely, write directly to a user-selected directory, preserve audio/video sync, package each recording as one user-facing `.likelysnap` document, keep cursor-driven zoom/edit/export features intact, and open long recordings without loading multi-GB sidecars into memory.

## Hard Requirements

1. Recordings write continuously to disk during capture.
2. The user can choose the recording directory before recording.
3. Stopping a long recording must not lose the video.
4. macOS recordings must preserve audio/video sync in the source file.
5. MP4 exports must preserve audio/video sync from the edited timeline.
6. Cursor telemetry must remain aligned with video time so auto zoom and auto-focus zoom continue to work.
7. Cursor-driven zoom must remain stable and controllable: auto zoom suggestions choose candidate time spans, per-zoom focus mode decides whether that span follows cursor telemetry, and macOS window capture must normalize cursor positions against the captured window bounds.
8. Crash recovery must leave inspectable and recoverable media files.
9. New recordings must appear to users as one `.likelysnap` package, while internally preserving live-write files.
10. Legacy loose recordings must remain loadable.
11. Webcam sidecars must be long-recording safe: native MP4 sidecars where supported, bounded fallback WebM where necessary, and editor-side degradation if a sidecar is too large or unhealthy.
12. The editor must reference large media like an NLE: no whole-file media reads on open, non-blocking sidecars, and incremental export paths for long videos.

## Current Priority

Push the package model from "recording works" to "long recordings remain editable":

- Record with microphone, webcam, and editable cursor enabled.
- Confirm package contents live-update while recording.
- Confirm editor/open dialogs load `.likelysnap` package directories as recordings.
- Confirm moved packages reopen from relative `manifest.json` paths.
- Confirm missing-manifest recovery rebuilds a usable package session.
- Confirm editor preview and exported MP4 stay in sync.
- Validate the updated auto zoom focus model: normal auto zoom suggestions should default to stable manual focus, suggestions created from held mouse-button spans should default to cursor-follow, and every selected zoom must remain individually switchable between Manual and Auto in the settings panel.
- Validate the implemented long-recording native webcam plan in `handoff/LONG_RECORDING_NATIVE_WEBCAM_PLAN.md`: macOS native `webcam.mp4`, Windows native `webcam.mp4`, legacy `webcam.webm` compatibility, and editor-side degradation for huge sidecars.
- Confirm the existing 4.4 GB `webcam.webm` package opens the main video without freezing by skipping the unsafe webcam sidecar.
- Keep export durability on the next P1 track: MP4 export still needs streaming/temp-file output before claiming multi-hour export support.
