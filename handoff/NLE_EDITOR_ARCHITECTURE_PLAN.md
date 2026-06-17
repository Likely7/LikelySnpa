# NLE Editor Architecture Plan

## Why This Exists

A real Windows test on a high-end PC with an NVIDIA RTX 5070 opened a one-hour recording but stayed non-interactive for more than five minutes. Task Manager showed only about 500 MB memory, about 8% CPU, and very low GPU utilization.

That profile means the machine is not compute-bound. LikelySnap is underfeeding the hardware and blocking the UI on low-parallelism work: file reads, JSON parse, IPC transfer, promise chains, media scanning, and React state updates.

The durable fix is to move the editor toward the model used by mainstream NLEs such as Final Cut Pro, Premiere Pro, DaVinci Resolve, and CapCut:

- open the project/timeline first;
- make media preparation asynchronous;
- generate proxies, waveform, thumbnails, and cursor indexes in the background;
- use lightweight preview/cache assets for editing;
- keep full-resolution media for export.

## Product-Level Target

Long recordings must become editable quickly even when analysis is still running.

Target behavior for a one-hour `.likelysnap` package:

1. 0-3 seconds: read manifest, stat media files, mount the main video, show an interactive editor shell.
2. 3-10 seconds: video metadata, first frame, and basic timeline duration stabilize.
3. Background: waveform peaks, cursor index, auto zoom suggestions, thumbnails, and proxies are generated incrementally.
4. While background jobs run: the user can scrub, trim, zoom the timeline, inspect settings, and save/load projects.
5. Export uses original media unless a later explicit proxy-export mode is introduced.

## Current Blocking Problems

### Whole-File Video Reads

`src/lib/exporter/streamingDecoder.ts` currently loads local files through `window.electronAPI.readBinaryFile`, wraps the whole file in a Blob, then parses it with `web-demuxer`.

That is acceptable for export-time work on short files but must not be part of editor-open or metadata-open paths for long recordings.

### Packet Scanning For Metadata

`StreamingVideoDecoder.loadMetadata()` scans video packets to compute a validated duration. This can be useful for export correctness, but it is too expensive for the first editor screen.

Editor-open should trust package manifest metadata or `HTMLVideoElement.loadedmetadata` first, then refine metadata in the background if needed.

### Cursor JSON Double Load

This was the first concrete editor-open fix. `VideoEditor.tsx` now uses `useCursorEditorData()` as a single cursor load path for the editor. The main process caches parsed `cursor.json` by file path/size/mtime, and the renderer receives preview-level cursor samples for interaction instead of full recording data on first open.

Full cursor recording data is still loaded on demand for export, so preview responsiveness does not reduce final render quality.

### Waveform Still Scans Full Audio

The current waveform path is safer than before because it uses ranged reads and disk cache. First-time waveform generation can still decode the full audio timeline, but it now starts through an idle task and logs cache hit/generation timing so it does not compete with the first editor paint.

### Auto Zoom Runs From Full Telemetry

Auto zoom suggestion generation now runs after the editor is interactive using idle scheduling and preview-level cursor samples. It logs suggestion timing and source sample counts. This is the bootstrap path; package-local persisted suggestion caches remain a later phase.

## First Implementation Status

Implemented in the first architecture pass:

1. Created `CursorPreviewData` on the native bridge.
2. Added `cursor.getPreviewData(videoPath, sampleIntervalMs)` for bounded preview cursor samples.
3. Kept `cursor.getRecordingData(videoPath)` for full-fidelity export and future deep editing.
4. Replaced duplicate editor cursor loads with `useCursorEditorData()`.
5. Added main-process cursor parse caching keyed by telemetry file size/mtime.
6. Changed editor preview/auto zoom to use preview cursor data, while export loads full cursor data on demand.
7. Deferred automatic zoom suggestion generation with idle scheduling.
8. Deferred waveform generation with idle scheduling while keeping waveform visible by default.
9. Added timing logs for initial editor data load, cursor parse/load, waveform cache/generation, and auto zoom suggestion generation.

Remaining from the first phase:

1. Add video metadata ready timing from `VideoPlayback`.
2. Add package-local `cache/cursor-index.json` instead of recomputing preview data per cold app launch.
3. Add package-local `cache/media-info.json`.
4. Add visible background preparation status in the UI.
5. Validate the Windows one-hour package against the new staged load path.

## Target Package Cache Layout

Package-local cache is preferred for movable `.likelysnap` packages, with the global cache directory available for derived data that does not need to travel with the package.

```text
recording-xxxx.likelysnap/
  screen.mp4
  webcam.mp4
  cursor.json
  manifest.json
  cache/
    media-info.json
    waveform.peaks.json
    cursor-index.json
    auto-zoom-suggestions.json
    proxy-screen.mp4
    proxy-webcam.mp4
    thumbnails/
```

### `media-info.json`

Stores lightweight metadata needed for instant open:

- screen path, size, duration, frame rate, codec, size bytes, mtime;
- webcam path, size, duration, offset, health/skipped state;
- cursor file size, sample count if known;
- cache schema version.

### `cursor-index.json`

Stores a bounded, editor-friendly cursor representation:

- downsampled preview samples, e.g. 5-10 fps;
- click/drag/hold events;
- optional time chunks for future range reads;
- source cursor file size/mtime for invalidation.

### `waveform.peaks.json`

Stores fixed-size peaks for fast timeline display. Generation can be progressive, but rendering should tolerate partial results.

### Proxies

Long recordings should use proxy media for preview:

- default target: 720p or 1080p H.264 with bounded bitrate;
- create in background after open;
- editor preview switches to proxy when ready;
- export still uses original `screen.mp4` and `webcam.mp4`.

## First Implementation Phase

The first phase is about making long recordings interactive. It does not need to finish every NLE feature.

1. Add an editor media preparation state model:
   - `mediaReady`;
   - `waveformStatus`;
   - `cursorStatus`;
   - `autoZoomStatus`;
   - `proxyStatus`.
2. Stop doing heavy media analysis before showing the editor. Partially complete: cursor, waveform, and auto zoom no longer run as full first-screen blockers.
3. Make cursor loading single-source. Complete for the current editor:
   - one IPC call returns recording data and preview telemetry together;
   - no duplicate `cursor.json` parse for `useCursorTelemetry` plus `useCursorRecordingData`.
4. Add cursor downsampling for preview and auto zoom bootstrap. Complete as native bridge preview data.
5. Defer auto zoom suggestions until after the editor is interactive. Complete with idle scheduling.
6. Keep waveform visible by default, but ensure generation is cancelable/background and does not block editing. Partially complete with idle scheduling, abort support, ranged reads, and disk cache.
7. Avoid using `StreamingVideoDecoder.loadMetadata()` for editor-open metadata.
8. Instrument timings so slow phases are visible in logs and diagnostics. Partially complete for editor initial load, cursor, waveform, and auto zoom.

## Second Implementation Phase

1. Add package-local `cache/media-info.json`.
2. Add package-local `cache/cursor-index.json`.
3. Add progressive waveform writes.
4. Add preview proxy generation and proxy selection in playback.
5. Add package cache invalidation by source path/size/mtime.
6. Add UI status for background preparation.

## Third Implementation Phase

1. Move edited MP4 export to temp-file/streaming output.
2. Make MP4 export frame rate source-aware.
3. Add Windows hardware-first encoder policy with CPU fallback.
4. Add range/chunked export input readers so multi-hour exports do not require whole-file Blobs.

## Acceptance Criteria

### One-Hour Recording

- Editor shell appears and responds within 3 seconds after selecting a ready `.likelysnap` package.
- User can scrub or select a timeline region before waveform/cursor/auto zoom analysis finishes.
- No renderer freeze longer than 500 ms during cursor or waveform preparation.
- Cursor overlay may start with coarse preview samples and refine later.
- Auto zoom suggestions may appear later, but must not block editing.

### Existing 17-Minute Package

- Opens interactively without waiting about 10 seconds for waveform or cursor preparation.
- Waveform cache is reused on second open.

### Legacy Oversized Webcam Sidecar

- Main video opens even if legacy `webcam.webm` is skipped.
- The skipped sidecar state is visible in diagnostics.

### Telemetry

Add timing logs for:

- manifest/session load;
- file stat;
- video metadata ready;
- cursor parse/index;
- waveform cache hit/miss/generation;
- auto zoom suggestion generation;
- proxy generation.
