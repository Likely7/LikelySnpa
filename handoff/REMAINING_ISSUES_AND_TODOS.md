# Remaining Issues And Todos

## P0

1. Fix long-recording editor open for packages with huge webcam sidecars: skip/degrade unhealthy webcam files so the main screen video remains editable.
2. Stop whole-file WebM duration patching for multi-GB sidecars.
3. Implement native macOS webcam sidecar recording as bounded `webcam.mp4`.
4. Wire and validate native Windows webcam sidecar recording as bounded `webcam.mp4`.
5. Validate a real macOS recording with microphone, system audio, webcam, editable cursor, and auto zoom enabled.
6. Validate a long macOS recording stops cleanly and leaves a ready `.likelysnap` package that opens in the editor.
7. Validate moving a package to another folder and reopening it.
8. Validate deleting `manifest.json` and reopening the package rebuilds a recoverable manifest.
9. Validate killing the app mid-recording leaves recoverable package artifacts.

## P1

1. Add MP4 export sync diagnostics.
2. Make MP4 export write to a temp file instead of an in-memory `BufferTarget`.
3. Ensure exported MP4 with source audio fails loudly if audio cannot be preserved.
4. Add broader automated tests for custom recording directories and interrupted package recovery.
5. Add real macOS long-recording validation evidence.
6. Validate the refined auto zoom focus model on real recordings: ordinary dwells/clicks should produce stable manual-focus zooms, held mouse-button spans should produce cursor-follow zooms, and per-zoom settings should override either result.
7. Add cursor telemetry indexing/downsampling for multi-hour recordings.
8. Add sidecar/proxy diagnostics for file size, duration, codec, and skipped webcam state.

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
6. Confirm selected zoom settings can switch a single zoom between Manual and Auto even when the global Auto-Focus button has been used.
7. Confirm held mouse-button spans default their suggested zoom to cursor-follow, while ordinary dwells/clicks default to stable manual focus.
8. Confirm export MP4 remains in sync.
9. Kill the app mid-recording and verify the package is recoverable.
