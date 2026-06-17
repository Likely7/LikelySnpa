# Project Progress

## Completed

1. Cloned upstream OpenScreen into `/Users/macbook/Desktop/LikelySnap/openscreen`.
2. Reviewed README, package scripts, Electron entrypoints, recording hooks, native bridge docs, and export pipeline.
3. Identified the core durability direction: replace memory-fallback recording behavior with a main-process disk session model.
4. Confirmed cursor-driven zoom is compatible with continuous disk writing, as long as cursor telemetry timing remains aligned to final video time.
5. Corrected the audio issue framing: the user's actual problem is audio/video desync, not missing audio.
6. Confirmed the current user target platform is macOS.
7. Added a user-selectable recording directory persisted in Electron userData settings.
8. Changed recording output defaults to `~/Movies/LikelySnap` on macOS and `~/Videos/LikelySnap` elsewhere, while still allowing reads from legacy OpenScreen/app-data recording directories.
9. Added a HUD folder button that opens the recording directory picker and shows the selected path in the tooltip.
10. Made disk-streamed `MediaRecorder` paths fail fast instead of silently falling back to renderer memory when stream open/write fails.
11. Stored the main-process stream's actual file path and used it when finalizing sessions, so changing the configured folder after recording starts cannot make stop/finalize look in the wrong directory.
12. Added macOS ScreenCaptureKit helper diagnostics for AVAssetWriter append/drop counts and final MP4 audio/video track timing.
13. Persisted macOS recording diagnostics into the `.session.json` manifest and returned them from stop/attach IPC results.
14. Confirmed local macOS diagnostic manifests did not show raw MP4 video leading audio; the remaining user-visible desync is most likely webcam sidecar video leading native mic audio.
15. Added a durable webcam timeline offset model for macOS native recordings: helper capture start time is returned to the renderer, the webcam recorder starts only after native capture starts, and `webcamStartOffsetMs` is persisted.
16. Applied `webcamStartOffsetMs` consistently in project/session persistence, editor webcam preview, MP4 export, and GIF export.
17. Rebranded the app surface from OpenScreen to LikelySnap, including package name, Electron app id, app/window text, i18n copy, logo reference, and dark-pink primary UI color.
18. Changed macOS webcam sidecar from renderer-memory attachment to main-process streamed WebM chunks.
19. Added live cursor telemetry file creation and throttled `.cursor.json` snapshots during recording.
20. Added session manifest creation at recording start, with later stop/attach updates.
21. Documented the next `.likelysnap` package directory design in `handoff/RECORDING_PACKAGE_PLAN.md`.

## Implemented This Pass

- `electron/ipc/handlers.ts`
- `electron/ipc/recordingStream.ts`
- `electron/preload.ts`
- `electron/electron-env.d.ts`
- `electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift`
- `src/hooks/recorderHandle.ts`
- `src/hooks/recorderHandle.test.ts`
- `src/components/launch/LaunchWindow.tsx`
- `src/lib/nativeMacRecording.ts`
- `src/lib/recordingSession.ts`
- `src/components/video-editor/VideoEditor.tsx`
- `src/components/video-editor/VideoPlayback.tsx`
- `src/components/video-editor/projectPersistence.test.ts`
- `src/lib/exporter/videoExporter.ts`
- `src/lib/exporter/gifExporter.ts`
- `electron/native-bridge/cursor/recording/*`
- `src/components/video-editor/*`
- `src/components/ui/*`
- `src/i18n/locales/*/*.json`
- `package.json`
- `package-lock.json`
- `electron-builder.json5`
- `README.md`
- `public/likelysnap.png`
- `handoff/RECORDING_PACKAGE_PLAN.md`
- `src/i18n/locales/*/launch.json`

## Verification

- `npm test -- src/hooks/recorderHandle.test.ts` passes.
- `npm test -- src/components/video-editor/projectPersistence.test.ts src/hooks/recorderHandle.test.ts` passes.
- `npm test -- src/hooks/recorderHandle.test.ts electron/ipc/recordingStream.test.ts src/components/video-editor/projectPersistence.test.ts` passes.
- `./node_modules/.bin/tsc --noEmit` passes.
- `npm run build-vite` passes.
- `npm run lint` passes.
- `swiftc -parse-as-library -typecheck ... main.swift` passes with deprecation warnings only.
- `npm run build:native:mac` is blocked by the local machine using Command Line Tools instead of full Xcode.
- `npm run i18n:check` still fails on pre-existing translation drift; the new `tooltips.chooseRecordingDirectory` key is no longer listed as missing.

## Next Engineering Step

Implement and validate the `.likelysnap` recording package model:

1. Create package directories named `recording-<id>.likelysnap`.
2. Write `screen.mp4`, `webcam.webm`, `cursor.json`, and `manifest.json` inside the package during recording.
3. Load packages through the editor and retain legacy loose-file loading.
4. Add startup/open recovery for missing manifests and interrupted packages.
5. Validate package recording with webcam, microphone, cursor telemetry, preview, and exported MP4.
