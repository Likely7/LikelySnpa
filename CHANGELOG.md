# Changelog

## 1.0.0 - Current Development Baseline

This baseline is based on OpenScreen 1.5.0 and has been rebuilt as LikelySnap.

### Added

- `.likelysnap` recording packages with `screen.mp4`, optional `webcam.mp4`, `cursor.json`, and `manifest.json`.
- User-selectable recording, project, and cache directories through a standalone settings window.
- Persistent recording defaults for quality, frame rate, editable cursor, microphone, system audio, and webcam.
- macOS ScreenCaptureKit native recording helper and Windows x64 WGC helper integration.
- Native MP4 webcam sidecars on macOS and Windows native recording paths.
- Cursor preview loading, cursor parse caching, idle auto zoom generation, and idle waveform preparation for long recordings.
- FFmpeg-backed MP4 export that streams rendered RGBA frames to a main-process FFmpeg session and writes through a temporary MP4 before renaming to the final export path.
- Hardware-first FFmpeg encoder selection where the packaged/system FFmpeg supports it, with CPU fallback.

### Changed

- MP4 export no longer saves the final edited video through a full in-memory Blob on the primary path.
- Editor preview no longer needs full cursor assets at open time; it can render from preview cursor samples and built-in cursor assets.
- Automatic zoom now separates span detection from Follow Mouse behavior, and each zoom segment can be controlled individually.
- Long audio waveform generation is ranged, lazy, and cache-backed while remaining visible by default.
- Huge legacy `webcam.webm` sidecars are skipped instead of blocking the main screen video from opening.

### Fixed

- Fixed blurry/washed macOS native source recordings by using the display mode backing-pixel dimensions for ScreenCaptureKit output instead of the scaled logical display size, writing BT.709 H.264 color metadata, and computing macOS native recording bitrate from the actual output dimensions/FPS instead of a fixed 4K assumption.
- Restored cursor rendering and cursor settings after the staged editor-open optimization hid full cursor assets from preview data.
- Preserved full cursor data for export while keeping editor open fast.
- Avoided Windows native stop/finalize paths that loaded the main screen MP4 into JavaScript memory.
- Persisted Windows webcam sidecar timeline offset for preview and export sync.

### Still To Validate

- Multi-hour edited MP4 export on real macOS and Windows machines.
- Windows x64 FFmpeg hardware encoder behavior on NVIDIA/Intel/AMD machines.
- Package-local media and cursor indexes for even faster cold opens.
- Preview proxy generation for very long or high-resolution recordings.
- GIF export remains on the legacy renderer path and should not be treated as the multi-hour export target.
