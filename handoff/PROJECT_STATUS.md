# Current Project Status

## Repository

- Local path: `/Users/macbook/Desktop/LikelySnap/openscreen`
- Upstream remote: `https://github.com/siddharthvaddem/openscreen.git`
- Checked commit before local handoff docs: `71622a2`
- Upstream package version: `1.5.0`
- License: MIT

## Environment Notes

- User platform for this work: macOS.
- Project declares Node `22.22.1` and npm `10.9.4`.
- Local machine currently uses Node `24.14.1` and npm `11.11.0`, which emits an engine warning against the declared project toolchain.
- Full native helper build currently requires full Xcode; this machine has Command Line Tools active.

## Confirmed Code Facts

- macOS native recording writes MP4 with `AVAssetWriter`; it is already a disk-writing path, not renderer-memory-first.
- Browser fallback uses `MediaRecorder` and has a streaming-to-disk wrapper, but still keeps an in-memory fallback path.
- Recording directory is now user-selectable and persisted in `recording-settings.json` under Electron `userData`.
- macOS default recording directory is now `~/Movies/OpenScreen`; non-macOS default is `~/Videos/OpenScreen`.
- Legacy `RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings")` remains trusted for reading old recordings.
- Project persistence already stores real media paths via `screenVideoPath` and optional `webcamVideoPath`.
- Cursor telemetry is separate from video bytes and is required for auto zoom and cursor-follow zoom.

## Current Risk Summary

- Disk-streamed renderer recordings now fail fast if the main-process stream cannot open/write; they no longer silently fall back to unbounded memory for file-backed recordings.
- The user can choose a recording directory from the HUD before recording.
- macOS source audio/video sync is instrumented in the native helper and persisted to the session manifest, but real recording data has not yet been collected on this machine.
- Export audio/video sync has not yet been instrumented or proven.
- Cursor telemetry is mostly finalized at stop time; a crash can lose telemetry even if media exists.
