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
- Auto zoom suggestions choose time spans separately from Follow Mouse behavior. Ordinary dwell/click suggestions use stable fixed-position zooms; held mouse-button spans default to Follow Mouse.
- Suggestion duration is data-driven: dwell spans use real dwell duration plus context padding, nearby same-area dwell runs merge, click-only suggestions stay short, and durations are clamped to bounded limits.

The key contract is:

- final video time starts at `0`;
- cursor sample `timeMs` is relative to the final video timeline;
- pause ranges are removed from cursor time;
- any recording start warmup is subtracted from cursor time.

## Recording Storage Model

Current implementation:

- New native recordings are grouped into one user-visible `recording-<id>.likelysnap/` package directory in the selected recording directory.
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
- Run `npm run generate:icons` to regenerate `public/likelysnap.png`, `public/openscreen.png`, Linux PNG icons, macOS `.icns`, and Windows `.ico`.
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
- MP4 export uses `StreamingVideoDecoder` to decode frames, `FrameRenderer` to composite zoom/background/webcam/cursor/annotations, WebCodecs `VideoEncoder` for H.264, `AudioProcessor` for audio, and `VideoMuxer` for MP4 muxing.
- The current MP4 muxer uses `mediabunny` `BufferTarget`, then returns a Blob that the renderer passes to `write-export-to-path`. Final MP4 export output is still memory-backed and is not yet a temp-file/streaming writer.
- A source-copy fast path exists for no-op MP4 exports when dimensions and effects allow it, but normal edited projects with webcam, cursor overlay, zoom, annotations, padding, crop, blur, shadow, trim, or speed changes must re-render and re-encode frame by frame.
- Windows export currently tries WebCodecs `prefer-software` before `prefer-hardware`; macOS/Linux try hardware first. This makes Windows exports likely CPU-bound until an explicit encoder policy is added.
- MP4 export currently targets 60 FPS from `VideoEditor.tsx`; source-aware/default export FPS is still a P1 optimization.
