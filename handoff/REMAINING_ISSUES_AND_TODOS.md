# Remaining Issues And Todos

## P0

1. Run real macOS recording tests with webcam and microphone enabled.
2. Validate raw macOS MP4 sync with the new `.session.json` diagnostics.
3. Validate the persisted `webcamStartOffsetMs` in editor preview and exported MP4.
4. If diagnostics show constant offset or drift, fix ScreenCaptureKit/AVAssetWriter timestamp handling against measured data.
5. Introduce a main-process recording session manifest written before capture starts.
6. Preserve files as recoverable when stop/finalize fails.
7. Stream macOS native webcam sidecar to the selected directory instead of using a renderer in-memory sidecar blob.

## P1

1. Stream cursor telemetry incrementally instead of writing only at stop.
2. Attach cursor telemetry to the same recording session manifest.
3. Add recovery scanning for incomplete sessions on app startup.
4. Add MP4 export sync diagnostics.
5. Make MP4 export write to a temp file instead of an in-memory `BufferTarget`.
6. Ensure exported MP4 with source audio fails loudly if audio cannot be preserved.
7. Add automated tests for custom recording directories and manifest paths.

## P2

1. Add "Show Recording Folder" action after recording.
2. Add recording directory management to editor settings.
3. Add project relink flow if a media file moves.
4. Add focused automated tests for project persistence with custom recording directories.

## Validation Checklist

1. Record 20 minutes on macOS and stop successfully.
2. Confirm raw source file plays in Finder/QuickTime with audio in sync.
3. Confirm editor auto zoom suggestions still appear from cursor telemetry.
4. Confirm manual zoom with Auto-Focus follows cursor.
5. Confirm export MP4 remains in sync.
6. Confirm selected recording directory contains video, cursor JSON, session manifest, and macOS diagnostics.
7. Kill the app mid-recording and verify recoverable artifacts remain in the chosen folder.
