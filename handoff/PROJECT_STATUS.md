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
- Local machine was observed with newer Node/npm, but implementation verification should use the declared project toolchain.

## Confirmed Code Facts

- macOS native recording writes MP4 with `AVAssetWriter`; it is already a disk-writing path, not renderer-memory-first.
- Browser fallback uses `MediaRecorder` and has a streaming-to-disk wrapper, but still keeps an in-memory fallback path.
- Recording directory is currently hard-coded around `RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings")`.
- Project persistence already stores real media paths via `screenVideoPath` and optional `webcamVideoPath`.
- Cursor telemetry is separate from video bytes and is required for auto zoom and cursor-follow zoom.

## Current Risk Summary

- Long recordings can still fail if the renderer fallback path accumulates Blob chunks in memory.
- The user cannot choose a recording directory.
- macOS source audio/video sync has not yet been instrumented or proven.
- Export audio/video sync has not yet been instrumented or proven.
- Cursor telemetry is mostly finalized at stop time; a crash can lose telemetry even if media exists.
