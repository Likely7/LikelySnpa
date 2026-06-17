# Current Goal

Build a durable macOS-first LikelySnap recorder/editor that can record long videos safely, write directly to a user-selected directory, preserve audio/video sync, package each recording as one user-facing `.likelysnap` document, and keep cursor-driven zoom/edit/export features intact.

## Hard Requirements

1. Recordings write continuously to disk during capture.
2. The user can choose the recording directory before recording.
3. Stopping a long recording must not lose the video.
4. macOS recordings must preserve audio/video sync in the source file.
5. MP4 exports must preserve audio/video sync from the edited timeline.
6. Cursor telemetry must remain aligned with video time so auto zoom and auto-focus zoom continue to work.
7. Crash recovery must leave inspectable and recoverable media files.
8. New recordings must appear to users as one `.likelysnap` package, while internally preserving live-write files.
9. Legacy loose recordings must remain loadable.

## Current Priority

Validate the implemented `.likelysnap` recording package model on macOS:

- Record with microphone, webcam, and editable cursor enabled.
- Confirm package contents live-update while recording.
- Confirm editor/open dialogs load `.likelysnap` package directories as recordings.
- Confirm moved packages reopen from relative `manifest.json` paths.
- Confirm missing-manifest recovery rebuilds a usable package session.
- Confirm editor preview and exported MP4 stay in sync.
