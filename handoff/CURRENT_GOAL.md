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

Continue with macOS validation after the webcam offset fix:

- Record real source files into the selected directory with webcam and microphone enabled.
- Use the session manifest to inspect raw MP4 diagnostics plus `webcamStartOffsetMs`.
- Confirm editor preview and exported MP4 keep webcam video aligned with mic audio.
- Replace the remaining macOS webcam sidecar memory blob with a disk stream.
- Add export-side audio/video sync validation after raw source sync is proven.
