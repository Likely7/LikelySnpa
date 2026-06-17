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
- Latest local checkpoint before native webcam long-recording work: `7c59ac4 fix: stabilize auto zoom follow model`
- Archive before native webcam sidecar work: `archive/before-native-webcam-sidecar-20260617-131845`
- App icon source of truth: `icons/source/logo.png`, generated through `npm run generate:icons` into the public favicon, Linux PNG set, macOS `.icns`, and Windows `.ico`.

## Environment Notes

- User platform for this work: macOS.
- Project declares Node `22.22.1` and npm `10.9.4`.
- Local machine currently uses Node `24.14.1` and npm `11.11.0`, which emits an engine warning against the declared project toolchain.
- Full native helper build currently requires full Xcode; this machine has Command Line Tools active.

## Confirmed Code Facts

- macOS native recording writes MP4 with `AVAssetWriter`; it is already a disk-writing path, not renderer-memory-first.
- macOS native webcam sidecar now records in the ScreenCaptureKit helper with `AVCaptureSession + AVAssetWriter` and writes package-local `webcam.mp4`.
- Windows native webcam sidecar now uses the WGC helper's Media Foundation/DirectShow path and writes package-local `webcam.mp4`; renderer webcam recording is no longer used on the native Windows path.
- Cursor telemetry now creates a package-local `cursor.json` file at recording start and refreshes it in throttled snapshots, with final corrected telemetry written at stop. Legacy loose recordings still use `.cursor.json`.
- Session manifests are now created at recording start and updated after stop/attach. New packages use `manifest.json`; legacy loose recordings still use `.session.json`.
- Browser fallback uses `MediaRecorder` and has a streaming-to-disk wrapper, with in-memory allowed only when no file-backed stream is requested.
- Recording directory is now user-selectable and persisted in `recording-settings.json` under Electron `userData`.
- macOS default recording directory is now `~/Movies/LikelySnap`; non-macOS default is `~/Videos/LikelySnap`.
- Legacy `RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings")` remains trusted for reading old recordings.
- Project persistence already stores real media paths via `screenVideoPath` and optional `webcamVideoPath`.
- Project persistence now also stores optional `webcamStartOffsetMs` when a webcam sidecar exists.
- Cursor telemetry is separate from video bytes and is required for auto zoom and Follow Mouse zoom.
- Auto zoom suggestions now separate span selection from Follow Mouse behavior: ordinary dwell/click suggestions use stable fixed-position zooms, held mouse-button spans default to `focusMode: auto`, and the selected zoom's settings panel can override Follow Mouse per region.
- Auto zoom suggestion duration is no longer one fixed value: dwell suggestions use the real cursor dwell span plus context padding, nearby same-area dwell runs merge into one longer zoom, click-only suggestions stay short, and durations are clamped to a maintainable bounded range.
- Follow Mouse remains stored internally as `focusMode` for project compatibility, but user-facing UI and docs call it Follow Mouse / 跟随鼠标.
- macOS native window recordings now use ScreenCaptureKit-reported window capture bounds for editable cursor normalization, avoiding display-bounds offset in Follow Mouse zoom.
- User retest after this fix reported the Follow Mouse behavior is close enough to continue; treat Follow Mouse zoom as implemented unless a new concrete offset sample appears.
- New project files use `.likelysnap`; legacy `.openscreen` project files remain loadable.
- New native recordings now write into `recording-<id>.likelysnap/` package directories with `screen.mp4`, optional `webcam.mp4`, `cursor.json`, and `manifest.json`. Browser fallback and legacy packages may still use `webcam.webm`.
- A real ~32 minute macOS test produced healthy `screen.mp4` but a ~4 GB `webcam.webm`; stop-time WebM duration patch failed with `ERR_FS_FILE_TOO_LARGE`, and the editor could freeze when mounting that sidecar.
- Long-recording direction is now implemented and documented in `handoff/LONG_RECORDING_NATIVE_WEBCAM_PLAN.md`: native `webcam.mp4` sidecars on macOS/Windows, bounded WebM fallback, sidecar degradation in editor, and NLE-style large media handling.
- Stop/finalize paths no longer whole-file patch WebM sidecars over the 2 GB safe threshold.
- Windows native stop/finalize no longer reads the main `screen.mp4` into JS memory to repackage a webcam sidecar.
- Editor open paths now stat webcam sidecars and skip unsafe files over the 2 GB threshold, allowing the main screen video to open without the webcam.
- Package manifests use relative paths and can be reopened after moving the package.
- Opening a `.likelysnap` package through the video picker/project picker resolves the package session, including webcam path and webcam offset.
- If `manifest.json` is missing, package open/recovery can rebuild a recoverable manifest from package files.
- macOS build metadata now registers `.likelysnap` as a document package type.

## Current Risk Summary

- Disk-streamed renderer recordings now fail fast if the main-process stream cannot open/write; they no longer silently fall back to unbounded memory for file-backed recordings.
- The user can choose a recording directory from the HUD before recording.
- macOS source audio/video sync is instrumented in the native helper and persisted to the session manifest.
- macOS native recordings with webcam now persist a webcam start offset and apply it in editor preview plus MP4/GIF export.
- New package recording has passed type, targeted unit tests, and Swift helper typecheck/build verification; it still needs real macOS recording validation on the user's machine.
- Export audio/video sync diagnostics have not yet been instrumented or proven.
- Cursor telemetry is live-written, and package open can recover missing manifests; interrupted-session UX still needs real-world validation.
- Follow Mouse zoom has targeted automated coverage and is now being refined for product feel: upstream behavior was confirmed to mix tight zoom-in tracking with smoother full-zoom tracking, so LikelySnap uses stable fixed-position auto zoom by default plus explicit per-zoom Follow Mouse.
- Current highest remaining long-recording risk is export and multi-hour editor scale, not recording package write-out. Main screen MP4 can remain large but referenced on disk; webcam sidecars are now native MP4 for native capture and unsafe legacy WebM files are skipped at editor open.
- Windows native webcam code is implemented but not truth-tested on Windows hardware from this macOS machine.
