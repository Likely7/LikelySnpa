# Current Goal

Build a durable macOS-first OpenScreen fork that can record long videos safely, write directly to a user-selected directory, preserve audio/video sync, and keep cursor-driven zoom/edit/export features intact.

## Hard Requirements

1. Recordings write continuously to disk during capture.
2. The user can choose the recording directory before recording.
3. Stopping a long recording must not lose the video.
4. macOS recordings must preserve audio/video sync in the source file.
5. MP4 exports must preserve audio/video sync from the edited timeline.
6. Cursor telemetry must remain aligned with video time so auto zoom and auto-focus zoom continue to work.
7. Crash recovery must leave inspectable and recoverable media files.

## Current Priority

Start with macOS:

- ScreenCaptureKit helper output.
- AVAssetWriter audio/video timing.
- Browser/renderer webcam sidecar timing when native macOS screen recording is used.
- User-selected recording directory.
- Source-file diagnostics before export work.
