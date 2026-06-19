# Project Overview

LikelySnap is an Electron + Vite + React/TypeScript desktop screen recorder and editor. The current product direction is a commercial-ready macOS-first recorder with durable disk writes, recoverable recording packages, and polished editor/export behavior.

## Main App Layers

- `electron/main.ts`: app lifecycle, tray, menu, permissions, and top-level IPC registration.
- `electron/windows.ts`: HUD, editor, source selector, countdown, and standalone app settings BrowserWindow creation.
- `electron/preload.ts`: exposes the renderer-facing `window.electronAPI`.
- `electron/ipc/handlers.ts`: most recording, project, file, native capture, cursor telemetry, and export filesystem IPC.
- `src/App.tsx`: selects the renderer experience by `windowType`.
- `src/components/launch/LaunchWindow.tsx`: floating recording HUD.
- `src/components/launch/AppSettingsDialog.tsx`: app settings UI for recording/project/cache directories, quality/FPS, recording defaults, cache size, and cache clearing.
- `src/hooks/useScreenRecorder.ts`: recording orchestration in the renderer.
- `src/components/video-editor/VideoEditor.tsx`: editor state, project load/save, export actions, captions, timeline integration.
- `src/lib/exporter/*`: decode, render, audio processing, muxing, MP4/GIF export.
- `src/native/*` and `electron/native-bridge/*`: newer unified native bridge scaffold.

## Native Capture

macOS uses ScreenCaptureKit through:

- `electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift`

Windows uses WGC/Media Foundation through:

- `electron/native/wgc-capture/src/*`

Linux/browser fallback uses Electron/Chromium capture and `MediaRecorder`.

## Cursor Zoom Model

The zoom system does not require zoom to be baked into the raw recording.

- New package recordings write cursor samples into package-local `cursor.json`; legacy loose recordings still use `<screenVideoPath>.cursor.json`.
- Auto zoom suggestions are derived from telemetry in `src/components/video-editor/timeline/zoomSuggestionUtils.ts`.
- Preview/export follow cursor telemetry through `src/components/video-editor/videoPlayback/zoomRegionUtils.ts` and `src/lib/exporter/frameRenderer.ts`.
- User-facing UI calls cursor-following zoom "Follow Mouse" / `跟随鼠标`; the persisted field remains `focusMode` for compatibility.
- Auto zoom suggestions choose time spans separately from camera-follow behavior. The product model is now three-state: `Off`, `Smart Follow Mouse`, and `Always Follow Mouse`.
- Smart Follow Mouse is designed as the default generated-zoom behavior. It keeps the camera stable while the cursor stays inside a scale-aware safe area, then eases the camera only when the cursor approaches the cropped boundary.
- Always Follow Mouse is a continuous follow mode, but should still be damped and eased so the cursor leads slightly and the picture catches up smoothly instead of locking tightly to every cursor sample.
- The global Smart Follow Mouse and global Always Follow Mouse controls are mutually exclusive. They are batch/default controls; each selected zoom can still override its own follow mode.
- Auto zoom suggestion generation should score user intent, not only cursor dwell duration. Click-and-stay, double click, long press, drag, and repeated interaction are stronger than accidental click-and-leave motion.
- Suggestion duration is bounded and explainable. Long dwell should not automatically become a huge zoom span unless there is sustained interaction that makes that behavior intentional.

The key contract is:

- final video time starts at `0`;
- cursor sample `timeMs` is relative to the final video timeline;
- pause ranges are removed from cursor time;
- any recording start warmup is subtracted from cursor time.

## Recording Storage Model

Current implementation:

- New native recordings are grouped into one user-visible timestamped package directory such as `recording-2026-06-19-20-34-56-789.likelysnap/` in the selected recording directory.
- Package files are `screen.mp4`, optional native `webcam.mp4`, `cursor.json`, and `manifest.json`.
- macOS `screen.mp4` is continuously written by the ScreenCaptureKit helper.
- macOS native webcam sidecars are written by the ScreenCaptureKit helper via `AVCaptureSession + AVAssetWriter` as package-local `webcam.mp4`.
- Windows native webcam sidecars use the WGC helper's Media Foundation/DirectShow path as package-local `webcam.mp4`.
- Cursor telemetry and the manifest are created at recording start and updated during/after capture.
- The manifest uses relative paths so moved packages can reopen.
- Missing `manifest.json` can be rebuilt from package files for recovery.
- Legacy loose recordings and legacy package `webcam.webm` sidecars remain loadable. Huge or unsafe legacy webcam sidecars are skipped so the main screen video can still open.

## Branding And Support UI

- Product-facing name is `LikelySnap`; the package is `likelysnap`; the Electron app id is `com.likelysnap.app`.
- The app icon source of truth is `icons/source/logo.png`.
- Run `npm run generate:icons` to regenerate `public/likelysnap.png`, Linux PNG icons, macOS `.icns`, and Windows `.ico`.
- The editor settings footer no longer exposes GitHub/report/diagnostic buttons. It now shows one centered contact line: `抖音小红书：Likely7  反馈问题`.

## App Settings

- App settings are persisted in Electron `userData/app-settings.json`.
- The recording directory is mirrored to legacy `recording-settings.json` for compatibility.
- The launch HUD gear and editor top-bar gear open the same standalone app settings window.
- Settings currently cover recording directory, project directory, cache directory, cache size/clear, recording quality, frame rate, editable cursor default, microphone default, system audio default, and webcam default.
- Recording quality/FPS settings are consumed by macOS native capture, Windows native capture, and browser fallback.
- Project open/save dialogs prefer the configured project directory, and waveform/preview cache paths use the configured cache directory.

## Export Pipeline

- MP4/GIF export lives in `src/lib/exporter/*` and is separate from raw recording. Recording durability does not automatically mean edited export durability.
- MP4 export now uses `FfmpegVideoExporter` as the primary path from `VideoEditor.tsx`.
- Renderer compositing stays in LikelySnap: `StreamingVideoDecoder` decodes source frames, `FrameRenderer` composites zoom/background/webcam/cursor/annotations, and the rendered RGBA frames are streamed to the main process.
- The main process owns the FFmpeg session: `electron/native-bridge/services/ffmpegService.ts` resolves FFmpeg, selects an encoder, receives frame chunks over IPC, writes them to FFmpeg `stdin`, lets FFmpeg mux audio/video into a temporary MP4, then renames the temp file to the final export path.
- The old WebCodecs + `mediabunny` `BufferTarget` MP4 exporter remains in the codebase as a compatibility path, but it is no longer the primary MP4 export path.
- A source-copy fast path exists for no-op MP4 exports when dimensions and effects allow it, but normal edited projects with webcam, cursor overlay, zoom, annotations, padding, crop, blur, shadow, trim, or speed changes must re-render and re-encode frame by frame.
- Windows export now has an explicit FFmpeg hardware-first selection path when FFmpeg exposes the matching encoder. Current implementation chooses `h264_nvenc` for Windows when available and falls back to `libx264`/`h264`.
- MP4 export currently targets 60 FPS from `VideoEditor.tsx`; source-aware/default export FPS is still a P1 optimization and should be folded into the FFmpeg path.
- GIF export still uses the legacy renderer/GIF path and is not considered multi-hour durable yet.

## NLE-Style Editor Direction

LikelySnap must stop treating editor open as a full media-preparation barrier. The target architecture is documented in `handoff/NLE_EDITOR_ARCHITECTURE_PLAN.md`.

- First screen should read only manifest/session data, file stats, and browser video metadata.
- Cursor telemetry, waveform peaks, auto zoom suggestions, thumbnails, and proxies should be background jobs.
- Long recordings need package-local cache/index files so moved `.likelysnap` packages remain self-contained.
- Preview should eventually use proxy media for long recordings; export should continue to use originals.
- The export compositor remains in the app, and the MP4 encoder/mux/output path is now FFmpeg-driven and temp-file based.
- A one-hour package should become interactive within seconds, not minutes.
- First implementation step is in place: editor cursor loading uses preview-level native bridge data, full cursor data is deferred to export, waveform and auto zoom start in idle time, and editor-open timing logs are emitted.
