# Changelog

## Unreleased

### Fixed

- Added a packaged macOS first-launch permission reset for GitHub/ad-hoc builds. Each app version clears stale LikelySnap/OpenScreen Screen Recording, Microphone, Camera, and Accessibility grants once before requesting new permissions, avoiding the "permission is enabled but recording still loops" state without resetting on every launch.
- Fixed macOS recording start with no selected source: clicking Record now opens the source picker instead of showing a raw untranslated `recording.selectSource` alert.
- Hardened the public-release first-run path after code review: Windows record now uses the default screen source before countdown as well as before capture, and the HUD no longer renders the record icon as disabled while that source is still being prepared.
- Fixed macOS Screen Recording permission gating when System Settings already shows LikelySnap as allowed but Electron still cannot enumerate capturable screens/windows. This now returns a restart-required state instead of opening an empty source picker.
- Fixed a dangerous cache cleanup boundary. User-selected cache locations are now treated as containers; LikelySnap only writes and clears its own managed cache subdirectory.
- Fixed long webcam sidecars being hidden purely because they exceed 2 GB. The editor now keeps valid webcam sidecar paths for preview/export instead of dropping them at open time.
- Fixed webcam export timeline sampling so webcam sidecars stay on their own original time axis and are sampled via `webcamStartOffsetMs`, matching preview behavior across trims and speed changes.
- Fixed Windows portable verification so it parses ZIP contents with Node directly instead of requiring a Unix `unzip` binary on the Windows build machine.
- Fixed a packaged macOS startup crash where the HUD could touch Electron's `screen` module before the app `ready` event.
- Fixed the Windows first-run recording button appearing disabled by preparing a default screen source automatically while keeping the manual source picker for switching displays/windows.
- Stabilized the current macOS native webcam sidecar path by replacing the unstable PixelBufferAdaptor writer and the later early-finishing MovieFileOutput attempt with direct camera sample-buffer appends into `AVAssetWriter`. New macOS native webcam sidecars remain package-local `webcam.mov` files and now carry better frame/drop/session diagnostics.
- Fixed healthy macOS `webcam.mov` sidecars being hidden from the editor when the main process misused `ffmpeg` as `ffprobe` and failed to write `media.webcamVideoPath` into the package manifest.
- Refined Auto Zoom dwell detection: nearby generated zooms now merge only within `1500ms`, long explanation zooms start at dwell onset, and natural small-area mouse movement still counts as one dwell instead of requiring the cursor to be perfectly still.

### Changed

- Added a Windows portable zip verification script so release builds fail if `LikelySnap.exe`, the WGC helper, cursor sampler, or bundled FFmpeg are missing from the package.
- Windows portable verification now also fails if the package contains duplicate `@ffmpeg-installer` FFmpeg binaries or non-target `onnxruntime-node` native binaries. Packaged builds use the explicit `resources/electron/ffmpeg` runtime; the installer package fallback is kept for development only.

## 1.1.0 - ARM64 Package Cleanup Release

This release keeps the long-recording architecture, FFmpeg MP4 export, and bundled offline auto captions while trimming the safest packaging weight.

### Changed

- Replaced the launch surface's remaining `react-icons` usage with the existing `lucide-react` icon set.
- Removed unused public/demo assets that were copied into packaged renderer output.
- Removed obsolete Nix packaging files from the current macOS/Windows mainline.
- Removed unused production dependencies while keeping build-only typing and Tailwind animation support in development dependencies.

### Preserved

- Bundled offline auto captions remain included.
- macOS ScreenCaptureKit recording, Windows x64 WGC recording, FFmpeg MP4 export, editable cursor, Follow Mouse zoom, webcam sidecars, and `.likelysnap` packages remain on the current architecture.

## 1.0.0 - Development Baseline

This baseline is based on OpenScreen 1.5.0 and has been rebuilt as LikelySnap.

### Added

- `.likelysnap` recording packages with `screen.mp4`, optional `webcam.mp4`, `cursor.json`, and `manifest.json`.
- User-selectable recording, project, and cache directories through a standalone settings window.
- Persistent recording defaults for quality, frame rate, editable cursor, microphone, system audio, and webcam.
- OBS-style recording controls with four clear routes: Standard `1080p / 30 FPS / 5 Mbps`, High `source / 60 FPS / 8 Mbps`, Ultra `source / 60 FPS / 15 Mbps`, and Custom for manually editing resolution/FPS/Mbps up to 60 Mbps.
- macOS ScreenCaptureKit native recording helper and Windows x64 WGC helper integration.
- Native MP4 webcam sidecars on macOS and Windows native recording paths.
- Cursor preview loading, cursor parse caching, idle auto zoom generation, and idle waveform preparation for long recordings.
- FFmpeg-backed MP4 export that streams rendered RGBA frames to a main-process FFmpeg session and writes through a temporary MP4 before renaming to the final export path.
- Hardware-first FFmpeg encoder selection where the packaged/system FFmpeg supports it, with CPU fallback.

### Changed

- MP4 export no longer saves the final edited video through a full in-memory Blob on the primary path.
- Recording quality no longer uses a fixed 4K bitrate assumption. macOS native recording receives explicit bitrate and resolution mode; Windows native recording receives explicit bitrate/FPS and keeps source dimensions until a GPU scaling pass is added.
- Editor preview no longer needs full cursor assets at open time; it can render from preview cursor samples and built-in cursor assets.
- Automatic zoom now separates span detection from Follow Mouse behavior, and each zoom segment can be controlled individually.
- Long audio waveform generation is ranged, lazy, and cache-backed while remaining visible by default.
- Unhealthy legacy `webcam.webm` sidecars should degrade without blocking the main screen video from opening; this must be based on readability/codec diagnostics instead of a blanket file-size cutoff.

### Fixed

- Fixed blurry/washed macOS native source recordings by using the display mode backing-pixel dimensions for ScreenCaptureKit output instead of the scaled logical display size, writing BT.709 H.264 color metadata, and computing macOS native recording bitrate from the actual output dimensions/FPS instead of a fixed 4K assumption.
- Fixed over-large native recording defaults by lowering preset bitrates to 5/8/15 Mbps, capping custom recording bitrate at 60 Mbps, and passing those values explicitly to the native recorders.
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
