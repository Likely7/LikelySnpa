# LikelySnap Recording Package Plan

## Goal

Move new recordings from four loose sibling files to one Finder-friendly recording package:

```text
recording-<id>.likelysnap/
  manifest.json
  screen.mp4
  webcam.webm
  cursor.json
```

On macOS this should behave like a single user-facing document/package while staying a normal directory internally. This preserves continuous disk writing and crash recovery.

## Why Package Directory, Not Zip Or Single Binary

- A directory package allows `screen.mp4`, `webcam.webm`, `cursor.json`, and `manifest.json` to be written during capture.
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
    "webcamVideoPath": "webcam.webm",
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
- `webcam.webm` is written through the existing renderer `MediaRecorder` to main-process file stream.
- `cursor.json` is created at start and refreshed in throttled snapshots.
- `manifest.json` is created at start and updated as paths/status/diagnostics become available.

On stop:

- Flush/close screen and webcam streams.
- Patch `webcam.webm` duration if streamed WebM needs it.
- Finalize cursor telemetry with pause/warmup offsets applied.
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
4. Attach `webcam.webm` if present.
5. Attach `cursor.json` if present.
6. Mark as `recoverable` if stop/finalize did not complete cleanly.

Legacy recovery should still scan loose `recording-<id>.mp4` files and infer sibling sidecars.

## Implementation Steps

1. Add package path helpers in the main process:
   - create package directory path;
   - resolve `screen.mp4`, `webcam.webm`, `cursor.json`, `manifest.json`;
   - validate paths stay inside the package.
2. Change native macOS recording output path to package `screen.mp4`.
3. Change macOS webcam stream file name/path to package `webcam.webm`.
4. Change cursor live telemetry path to package `cursor.json`.
5. Change session manifest writer to write package `manifest.json`.
6. Add package open/load IPC and dialog filter for `.likelysnap` packages.
7. Update editor media normalization to resolve manifest-relative media paths.
8. Keep legacy loose-file loader as a compatibility path.
9. Add startup recovery scan for packages and legacy loose recordings.
10. Register macOS document/package metadata in electron-builder so Finder treats `.likelysnap` as one app document.

## Acceptance Criteria

- A new recording creates exactly one visible `recording-<id>.likelysnap` package in the recording directory.
- During active recording, package contents are present and growing/updating.
- Opening the package loads screen, webcam, cursor telemetry, and webcam offset.
- Moving the package to another folder still opens correctly because manifest paths are relative.
- Deleting `manifest.json` and reopening the package rebuilds a usable manifest.
- Legacy loose MP4 recordings still open and recover sidecars when present.
- Killing the app mid-recording leaves a recoverable package with at least `screen.mp4` and partial metadata.
