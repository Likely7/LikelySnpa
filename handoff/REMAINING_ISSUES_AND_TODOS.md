# Remaining Issues And Todos

## P0

1. Implement `recording-<id>.likelysnap/` package directory creation for new recordings.
2. Move new recording outputs into package-relative files: `screen.mp4`, `webcam.webm`, `cursor.json`, `manifest.json`.
3. Make package `manifest.json` use relative paths and support move-safe loading.
4. Add editor/open dialog support for `.likelysnap` packages as the primary recording open path.
5. Keep legacy loose `recording-<id>.mp4` plus sidecar loading.
6. Add package recovery scanning and manifest rebuilding for interrupted recordings.
7. Register `.likelysnap` as a macOS document/package type in build metadata.
8. Validate package recording with webcam and microphone enabled.

## P1

1. Add MP4 export sync diagnostics.
2. Make MP4 export write to a temp file instead of an in-memory `BufferTarget`.
3. Ensure exported MP4 with source audio fails loudly if audio cannot be preserved.
4. Add automated tests for package path helpers, recovery scanning, custom recording directories, and manifest paths.
5. Add real macOS long-recording validation evidence after package model lands.

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
