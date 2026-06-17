# Project Overview

LikelySnap is an Electron + Vite + React/TypeScript desktop screen recorder and editor forked from OpenScreen. The current product direction is a commercial-ready macOS-first recorder with durable disk writes, recoverable recording packages, and polished editor/export behavior.

## Main App Layers

- `electron/main.ts`: app lifecycle, tray, menu, permissions, and top-level IPC registration.
- `electron/windows.ts`: HUD, editor, source selector, and countdown BrowserWindow creation.
- `electron/preload.ts`: exposes the renderer-facing `window.electronAPI`.
- `electron/ipc/handlers.ts`: most recording, project, file, native capture, cursor telemetry, and export filesystem IPC.
- `src/App.tsx`: selects the renderer experience by `windowType`.
- `src/components/launch/LaunchWindow.tsx`: floating recording HUD.
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

- Cursor samples are written beside the video as `<screenVideoPath>.cursor.json`.
- Auto zoom suggestions are derived from telemetry in `src/components/video-editor/timeline/zoomSuggestionUtils.ts`.
- Preview/export follow cursor telemetry through `src/components/video-editor/videoPlayback/zoomRegionUtils.ts` and `src/lib/exporter/frameRenderer.ts`.

The key contract is:

- final video time starts at `0`;
- cursor sample `timeMs` is relative to the final video timeline;
- pause ranges are removed from cursor time;
- any recording start warmup is subtracted from cursor time.

## Recording Storage Model

Current implementation:

- New macOS recordings still write loose files in the selected recording directory.
- `screen.mp4` is continuously written by the ScreenCaptureKit helper.
- `recording-<id>-webcam.webm` is continuously written through a main-process stream when webcam is enabled.
- `recording-<id>.mp4.cursor.json` is created at recording start and updated in throttled live snapshots.
- `recording-<id>.session.json` is created at recording start and updated at stop/attach.

Next implementation target:

- New recordings should be grouped into one `recording-<id>.likelysnap/` package directory.
- Package files should be `manifest.json`, `screen.mp4`, `webcam.webm`, and `cursor.json`.
- The manifest should use relative paths so the package can be moved.
- Legacy loose recordings must remain loadable.
