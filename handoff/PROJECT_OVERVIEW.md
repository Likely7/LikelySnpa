# Project Overview

OpenScreen is an Electron + Vite + React/TypeScript desktop screen recorder and editor. It aims to be a free open-source alternative to Screen Studio.

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
