# Remaining Issues And Todos

## P0

1. Add user-selectable recording directory.
2. Replace hard-coded `RECORDINGS_DIR` call sites with a validated session directory.
3. Introduce a main-process recording session manifest written before capture starts.
4. Make browser `MediaRecorder` screen and webcam paths disk-required, not memory fallback.
5. Add macOS audio/video sync diagnostics for raw recordings.
6. Preserve files as recoverable when stop/finalize fails.

## P1

1. Stream cursor telemetry incrementally instead of writing only at stop.
2. Attach cursor telemetry to the same recording session manifest.
3. Add recovery scanning for incomplete sessions on app startup.
4. Add MP4 export sync diagnostics.
5. Make MP4 export write to a temp file instead of an in-memory `BufferTarget`.
6. Ensure exported MP4 with source audio fails loudly if audio cannot be preserved.

## P2

1. Improve UI to show current recording directory in the HUD or editor settings.
2. Add "Show Recording Folder" action after recording.
3. Add project relink flow if a media file moves.
4. Add focused automated tests for project persistence with custom recording directories.

## Validation Checklist

1. Record 20 minutes on macOS and stop successfully.
2. Confirm raw source file plays in Finder/QuickTime with audio in sync.
3. Confirm editor auto zoom suggestions still appear from cursor telemetry.
4. Confirm manual zoom with Auto-Focus follows cursor.
5. Confirm export MP4 remains in sync.
6. Confirm selected recording directory contains video, cursor JSON, and session manifest.
7. Kill the app mid-recording and verify recoverable artifacts remain in the chosen folder.
