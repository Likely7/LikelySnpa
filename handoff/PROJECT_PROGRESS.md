# Project Progress

## Completed

1. Cloned upstream OpenScreen into `/Users/macbook/Desktop/LikelySnap/openscreen`.
2. Reviewed README, package scripts, Electron entrypoints, recording hooks, native bridge docs, and export pipeline.
3. Identified the core durability direction: replace memory-fallback recording behavior with a main-process disk session model.
4. Confirmed cursor-driven zoom is compatible with continuous disk writing, as long as cursor telemetry timing remains aligned to final video time.
5. Corrected the audio issue framing: the user's actual problem is audio/video desync, not missing audio.
6. Confirmed the current user target platform is macOS.
7. Added a user-selectable recording directory persisted in Electron userData settings.
8. Changed recording output defaults to `~/Movies/OpenScreen` on macOS and `~/Videos/OpenScreen` elsewhere, while still allowing reads from the legacy app-data recordings directory.
9. Added a HUD folder button that opens the recording directory picker and shows the selected path in the tooltip.
10. Made disk-streamed `MediaRecorder` paths fail fast instead of silently falling back to renderer memory when stream open/write fails.
11. Stored the main-process stream's actual file path and used it when finalizing sessions, so changing the configured folder after recording starts cannot make stop/finalize look in the wrong directory.
12. Added macOS ScreenCaptureKit helper diagnostics for AVAssetWriter append/drop counts and final MP4 audio/video track timing.
13. Persisted macOS recording diagnostics into the `.session.json` manifest and returned them from stop/attach IPC results.

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
- `src/i18n/locales/*/launch.json`

## Verification

- `npm test -- src/hooks/recorderHandle.test.ts` passes.
- `./node_modules/.bin/tsc --noEmit` passes.
- `swiftc -parse-as-library -typecheck ... main.swift` passes with deprecation warnings only.
- `npm run build:native:mac` is blocked by the local machine using Command Line Tools instead of full Xcode.
- `npm run i18n:check` still fails on pre-existing translation drift; the new `tooltips.chooseRecordingDirectory` key is no longer listed as missing.

## Next Engineering Step

Run macOS truth tests with full Xcode active and real recordings:

1. Build native helpers with full Xcode.
2. Record short and long macOS captures with system audio and/or microphone.
3. Inspect `.session.json` diagnostics for audio/video start offsets and dropped samples.
4. If raw MP4 diagnostics show offset/drift, fix helper timestamp handling using the measured values.
5. Then move to export-side MP4 sync validation.
