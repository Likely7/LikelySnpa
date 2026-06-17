# Current Project Status

## Repository

- Local path: `/Users/macbook/Desktop/LikelySnap/openscreen`
- Upstream remote: `https://github.com/siddharthvaddem/openscreen.git`
- Checked commit before local handoff docs: `71622a2`
- Upstream package version: `1.5.0`
- License: MIT
- Current product name: `LikelySnap`
- Current npm package name: `likelysnap`
- Current Electron appId: `com.likelysnap.app`
- Latest local checkpoint: `2ecbca8 fix: restore cursor-follow zoom focus`

## Environment Notes

- User platform for this work: macOS.
- Project declares Node `22.22.1` and npm `10.9.4`.
- Local machine currently uses Node `24.14.1` and npm `11.11.0`, which emits an engine warning against the declared project toolchain.
- Full native helper build currently requires full Xcode; this machine has Command Line Tools active.

## Confirmed Code Facts

- macOS native recording writes MP4 with `AVAssetWriter`; it is already a disk-writing path, not renderer-memory-first.
- macOS webcam sidecar now streams through the renderer `MediaRecorder` into main-process file streams instead of returning one full in-memory blob.
- Cursor telemetry now creates a package-local `cursor.json` file at recording start and refreshes it in throttled snapshots, with final corrected telemetry written at stop. Legacy loose recordings still use `.cursor.json`.
- Session manifests are now created at recording start and updated after stop/attach. New packages use `manifest.json`; legacy loose recordings still use `.session.json`.
- Browser fallback uses `MediaRecorder` and has a streaming-to-disk wrapper, with in-memory allowed only when no file-backed stream is requested.
- Recording directory is now user-selectable and persisted in `recording-settings.json` under Electron `userData`.
- macOS default recording directory is now `~/Movies/LikelySnap`; non-macOS default is `~/Videos/LikelySnap`.
- Legacy `RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings")` remains trusted for reading old recordings.
- Project persistence already stores real media paths via `screenVideoPath` and optional `webcamVideoPath`.
- Project persistence now also stores optional `webcamStartOffsetMs` when a webcam sidecar exists.
- Cursor telemetry is separate from video bytes and is required for auto zoom and cursor-follow zoom.
- Auto-generated zoom regions now keep `focusMode: auto`, so suggested zooms follow cursor telemetry instead of locking to the initial focus point.
- macOS native window recordings now use ScreenCaptureKit-reported window capture bounds for editable cursor normalization, avoiding display-bounds offset in cursor-follow zoom.
- User retest after this fix reported the cursor-follow behavior is close enough to continue; treat cursor-follow zoom as implemented unless a new concrete offset sample appears.
- New project files use `.likelysnap`; legacy `.openscreen` project files remain loadable.
- New recordings now write into `recording-<id>.likelysnap/` package directories with `screen.mp4`, optional `webcam.webm`, `cursor.json`, and `manifest.json`.
- Package manifests use relative paths and can be reopened after moving the package.
- Opening a `.likelysnap` package through the video picker/project picker resolves the package session, including webcam path and webcam offset.
- If `manifest.json` is missing, package open/recovery can rebuild a recoverable manifest from package files.
- macOS build metadata now registers `.likelysnap` as a document package type.

## Current Risk Summary

- Disk-streamed renderer recordings now fail fast if the main-process stream cannot open/write; they no longer silently fall back to unbounded memory for file-backed recordings.
- The user can choose a recording directory from the HUD before recording.
- macOS source audio/video sync is instrumented in the native helper and persisted to the session manifest.
- macOS native recordings with webcam now persist a webcam start offset and apply it in editor preview plus MP4/GIF export.
- New package recording has passed type, lint, targeted unit tests, and build verification; it still needs real macOS recording validation on the user's machine.
- Export audio/video sync diagnostics have not yet been instrumented or proven.
- Cursor telemetry is live-written, and package open can recover missing manifests; interrupted-session UX still needs real-world validation.
- Cursor-follow zoom has targeted automated coverage, build verification, and initial user acceptance; future work should focus on long-recording/package recovery and export durability unless new cursor evidence appears.
