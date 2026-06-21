# LikelySnap Recording Package Plan

## Goal

Implementation status: package model is implemented in code and now needs real macOS/Windows recording validation.

New recordings are grouped into one Finder-friendly recording package:

```text
recording-YYYY-MM-DD-HH-mm-ss-SSS.likelysnap/
  manifest.json
  screen.mp4
  webcam.mov   # macOS native webcam; Windows native uses webcam.mp4
  cursor.json
  cursor-preview.json
```

On macOS this behaves like a single user-facing document/package while staying a normal directory internally. This preserves continuous disk writing and crash recovery.

## Why Package Directory, Not Zip Or Single Binary

- A directory package allows `screen.mp4`, native webcam sidecars (`webcam.mov` on macOS, `webcam.mp4` on Windows), fallback `webcam.webm`, `cursor.json`, `cursor-preview.json`, and `manifest.json` to be written during capture.
- Zip would only exist after capture, so a crash before finalization still leaves loose partial files or no package.
- Embedding everything into MP4 or a custom binary container would make live writes, recovery, and editor reads much more fragile.

## Product Contract

- Users should open or move one `.likelysnap` package, not manually choose four files.
- The package is the canonical recording unit for new recordings.
- The app must continue to open legacy loose recordings:
  - `recording-<id>.mp4`
  - `recording-<id>-webcam.webm`
  - `recording-<id>.mp4.cursor.json`
  - `recording-<id>.session.json`
- Export remains separate: exported MP4/GIF files are normal media files outside the package unless the user chooses otherwise.

## Manifest Shape

Use relative paths so packages can be moved between folders and machines:

```json
{
  "schemaVersion": 1,
  "createdAt": 1780000000000,
  "brand": "LikelySnap",
  "media": {
    "screenVideoPath": "screen.mp4",
    "webcamVideoPath": "webcam.mov",
    "webcamStartOffsetMs": 120,
    "cursorTelemetryPath": "cursor.json"
  },
  "recording": {
    "cursorCaptureMode": "editable-overlay",
    "status": "recording"
  },
  "diagnostics": {}
}
```

Status transitions:

- `recording`: package was created and capture is active.
- `finalizing`: stop was requested and files are being closed/patched.
- `ready`: package finalized and editor can load everything normally.
- `recoverable`: package was found after a crash and enough files exist to open it.
- `failed`: package exists but no readable screen video is available.

## Write Model

During recording:

- `screen.mp4` is written by the macOS ScreenCaptureKit helper.
- Native macOS recordings write package-local `webcam.mov` through the ScreenCaptureKit helper's `AVCaptureVideoDataOutput -> AVAssetWriterInput.append(sampleBuffer)` path; native Windows recordings write package-local `webcam.mp4` through the WGC helper webcam path.
- macOS native `webcam.mov` is only advertised in `manifest.json` after the helper has finalized the writer and verified samples, non-zero bytes, and a readable video track. The abandoned `AVAssetWriterInputPixelBufferAdaptor` webcam writer and the later `AVCaptureMovieFileOutput` attempt must not be reintroduced as the default path.
- Browser/fallback recordings may still write package-local `webcam.webm`.
- `cursor.json` is created at start and refreshed in throttled snapshots.
- `cursor-preview.json` is created/refreshed beside `cursor.json` as a bounded editor-open index. It stores package-relative source identity so moving the `.likelysnap` package does not invalidate the cache.
- `manifest.json` is created at start and updated as paths/status/diagnostics become available.

On stop:

- Flush/close screen and webcam streams. On macOS, webcam finalization happens before the helper emits the native `recording-stopped` event so the main process cannot race ahead and mark a 0-byte webcam as missing/successful incorrectly.
- Patch `webcam.webm` duration if a fallback streamed WebM needs it and is below the safe whole-file threshold.
- Finalize cursor telemetry with pause/warmup offsets applied.
- Finalize `cursor-preview.json` from the corrected cursor telemetry so the next editor open can avoid full `cursor.json` parsing.
- Update `manifest.json` to `ready`.
- Open editor using the package manifest.

On discard:

- Delete the whole `.likelysnap` package directory.

## Recovery Model

Startup or editor-open recovery should scan selected recording directories for `.likelysnap` packages.

For each package:

1. Read `manifest.json` if present.
2. If missing, rebuild it from files in the package.
3. Require readable `screen.mp4`; without it the package is failed.
4. Attach `webcam.mov`, `webcam.mp4`, or fallback `webcam.webm` only if present and safe to mount. Do not attach a 0-byte native sidecar; preserve failed artifacts for inspection if the writer failed.
5. Attach `cursor.json` if present and prefer `cursor-preview.json` for editor preview when it matches the source file size/mtime.
6. Mark as `recoverable` if stop/finalize did not complete cleanly.

Legacy recovery should still scan loose `recording-<id>.mp4` files and infer sibling sidecars.

## Implementation Status

Implemented:

1. Added package path helpers in the main process:
   - create package directory path;
   - resolve `screen.mp4`, `webcam.mov`, `webcam.mp4`, fallback `webcam.webm`, `cursor.json`, `manifest.json`;
   - validate paths stay inside the package.
2. Changed native macOS recording output path to package `screen.mp4`.
3. Changed native webcam sidecars to package-local native files: `webcam.mov` on macOS and `webcam.mp4` on Windows.
4. Changed cursor live telemetry path to package `cursor.json`.
5. Added package-local `cursor-preview.json` and native bridge preview loading so long recordings open from bounded cursor samples instead of parsing full `cursor.json`.
6. Changed session manifest writer to write package `manifest.json`.
7. Added package open/load IPC and dialog filter for `.likelysnap` packages.
8. Updated editor media normalization to resolve manifest-relative media paths.
9. Kept legacy loose-file loader as a compatibility path.
10. Added missing-manifest package recovery.
11. Registered macOS document/package metadata in electron-builder so Finder treats `.likelysnap` as one app document.

Still pending:

- Real macOS long-recording validation against package-local native `webcam.mov` after abandoning both the PixelBufferAdaptor writer and the `AVCaptureMovieFileOutput` attempt for direct sample-buffer appends into `AVAssetWriter`.
- Real Windows validation of WGC package-local `webcam.mp4`.
- Interrupted-recording/kill-process recovery validation on real packages.

## Acceptance Criteria

- A new recording creates exactly one visible `recording-YYYY-MM-DD-HH-mm-ss-SSS.likelysnap` package in the recording directory.
- New macOS packages receive a Finder custom icon from `public/likelysnap.png` so the package itself shows the LikelySnap icon even when LaunchServices document-icon caching is stale.
- During active recording, package contents are present and growing/updating.
- Opening the package loads screen, validated safe webcam sidecar, cursor telemetry, and webcam offset.
- Opening the package uses `cursor-preview.json` for cursor preview/auto zoom when valid, while full `cursor.json` remains available for export.
- Moving the package to another folder still opens correctly because manifest paths are relative.
- Deleting `manifest.json` and reopening the package rebuilds a usable manifest.
- Legacy loose MP4 recordings still open and recover sidecars when present.
- Killing the app mid-recording leaves a recoverable package with at least `screen.mp4` and partial metadata.
