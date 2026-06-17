# Remaining Issues And Todos

## P0

1. Validate a real macOS recording with microphone, webcam, and editable cursor enabled.
2. Validate a long macOS recording stops cleanly and leaves a ready `.likelysnap` package.
3. Validate moving a package to another folder and reopening it.
4. Validate deleting `manifest.json` and reopening the package rebuilds a recoverable manifest.
5. Validate killing the app mid-recording leaves recoverable package artifacts.

## P1

1. Add MP4 export sync diagnostics.
2. Make MP4 export write to a temp file instead of an in-memory `BufferTarget`.
3. Ensure exported MP4 with source audio fails loudly if audio cannot be preserved.
4. Add broader automated tests for custom recording directories and interrupted package recovery.
5. Add real macOS long-recording validation evidence.

## P2

1. Add "Show Recording Folder" action after recording.
2. Add recording directory management to editor settings.
3. Add project relink flow if a media file moves.
4. Add UI affordance to reveal package contents for diagnostics.

## Validation Checklist

1. Record 20 minutes on macOS and stop successfully.
2. Confirm selected recording directory shows one `recording-<id>.likelysnap` package.
3. Confirm package contains `screen.mp4`, optional `webcam.webm`, `cursor.json`, and `manifest.json`.
4. Confirm raw source file plays in Finder/QuickTime with audio in sync.
5. Confirm editor auto zoom suggestions still appear from cursor telemetry.
6. Confirm manual zoom with Auto-Focus follows cursor.
7. Confirm export MP4 remains in sync.
8. Kill the app mid-recording and verify the package is recoverable.
