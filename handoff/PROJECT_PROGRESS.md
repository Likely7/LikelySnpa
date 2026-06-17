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
22. Implemented `recording-<id>.likelysnap/` packages for new recordings.
23. Moved new package outputs to package-local `screen.mp4`, `webcam.webm`, `cursor.json`, and `manifest.json`.
24. Added package manifest path helpers, safe package-child path validation, relative manifest normalization, and missing-manifest recovery.
25. Updated editor/video/project open paths so `.likelysnap` package directories load as recordings while `.likelysnap` files still load as projects.
26. Registered `.likelysnap` as a macOS document/package association in Electron Builder.
27. Restored Follow Mouse zoom for auto-generated zoom regions by storing cursor-follow mode where appropriate.
28. Corrected macOS native window cursor normalization by passing ScreenCaptureKit capture bounds from the helper to the Electron cursor recorder.
29. Restarted the local dev app after refreshing the macOS helper binary so the Follow Mouse fix is active for user testing.
30. Captured the Follow Mouse fix in Git checkpoint `2ecbca8 fix: restore cursor-follow zoom focus`.
31. User reported the result is approximately acceptable, so the current project state is ready to move past Follow Mouse repair.
32. Compared upstream OpenScreen auto zoom/Follow Mouse implementation against LikelySnap. Upstream only detects cursor dwells, drops dwells longer than 2600ms, ignores click intent for suggestions, and smooths Follow Mouse only after zoom-in has completed.
33. Clarified the product model: auto zoom suggestions choose spans, while each zoom region independently controls whether the camera follows cursor telemetry. The global Follow Mouse toggle is a batch control, not a permanent lock.
34. Added auto zoom Follow Mouse inference from mouse-button hold spans: click-to-mouseup intervals inside a suggested zoom default that zoom to Follow Mouse; ordinary dwells/clicks default to stable fixed-position zoom.
35. Investigated a real ~32 minute macOS recording that opened poorly in the editor. Main `screen.mp4` was healthy (~310 MB), but `webcam.webm` was ~4 GB and stop-time WebM duration patch failed above Node's 2 GB read limit.
36. Documented the long-recording native webcam plan in `handoff/LONG_RECORDING_NATIVE_WEBCAM_PLAN.md`, covering macOS `AVCaptureSession + AVAssetWriter`, Windows Media Foundation sidecars, WebM fallback, editor degradation, and NLE-style large media handling.
37. Implemented macOS native webcam sidecar recording in the ScreenCaptureKit helper with `AVCaptureSession + AVAssetWriter`, producing package-local `webcam.mp4`.
38. Wired Windows native recordings to use the WGC helper's native webcam sidecar path and package-local `webcam.mp4`, with lower webcam bitrate.
39. Removed native Windows/macOS renderer webcam recorder attachment paths so native recordings do not create large renderer `webcam.webm` sidecars.
40. Removed the Windows native stop-time readback/repackage path that loaded `screen.mp4` into JS memory.
41. Added a 2 GB safety guard for whole-file WebM duration patching.
42. Added editor-side webcam sidecar stat checks so huge legacy webcam files are skipped without blocking main screen editing.
43. Kept legacy `webcam.webm` packages loadable while making `webcam.mp4` the canonical package webcam sidecar.
44. Replaced the app logo/icon chain from the user-provided square logo and added a reproducible `npm run generate:icons` pipeline that creates rounded-corner PNG, macOS `.icns`, Windows `.ico`, and public favicon assets.
45. Changed user-facing zoom wording from Focus Mode/Auto-Focus to Follow Mouse/跟随鼠标 while keeping the internal `focusMode` field for old project compatibility.
46. Refined auto zoom span generation so long explanations produce longer stable zooms instead of repeated fixed-length jumps: dwell spans use their real duration plus padding, nearby same-area dwell runs merge, click-only suggestions stay short, and held mouse-button spans default to Follow Mouse.
47. Simplified the editor settings footer by removing report bug, save diagnostics, and GitHub star buttons, replacing them with the centered contact line `抖音小红书：Likely7  反馈问题`.
48. Updated README and handoff docs to reflect the current package/webcam/auto-zoom/branding state instead of the earlier pre-package plan.
49. Investigated a real ~17 minute package that opened but stayed unresponsive for roughly 10 seconds. The package was not pathological by itself (`screen.mp4` ~429 MB, `webcam.mp4` ~243 MB, `cursor.json` ~5.9 MB); the recurring editor cost was the trim waveform path reading and decoding the whole source video in the renderer.
50. Reworked trim waveform generation into a lazy, long-video-safe path: local files are read through bounded 1 MB ranged IPC reads, `mediabunny` decodes audio incrementally in the renderer, and generated peak arrays are cached on disk keyed by source path/size/mtime.
51. Re-enabled waveform display by default per user request while keeping the ranged/cached generation path.
52. Added a HUD settings center opened by a gear button beside the language switch.
53. Persisted app settings in Electron `userData/app-settings.json`, including recording directory, project directory, cache directory, recording quality, frame rate, and default recording toggles.
54. Wired recording quality and frame-rate settings into macOS native recording, Windows native recording, and browser fallback recording.
55. Wired project file save/open dialogs to prefer the configured project directory and cache operations to the configured cache directory.

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
- `electron/ipc/recordingPackage.ts`
- `electron/ipc/recordingPackage.test.ts`
- `src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts`
- `README.md`
- `public/likelysnap.png`
- `handoff/RECORDING_PACKAGE_PLAN.md`
- `src/i18n/locales/*/launch.json`
- `src/hooks/useScreenRecorder.ts`
- `src/components/video-editor/EditorEmptyState.tsx`
- `src/components/video-editor/timeline/zoomSuggestionUtils.ts`
- `src/components/video-editor/timeline/zoomSuggestionUtils.test.ts`
- `src/components/video-editor/videoPlayback/cursorFollowUtils.ts`
- `src/components/video-editor/videoPlayback/cursorFollowUtils.test.ts`
- `src/components/video-editor/SettingsPanel.tsx`
- `scripts/generate-icons.mjs`
- `icons/source/logo.png`
- `icons/icons/*`
- `public/likelysnap.png`
- `public/openscreen.png`
- `handoff/LONG_RECORDING_NATIVE_WEBCAM_PLAN.md`
- `electron/recording/webm-duration.ts`
- `electron/native/wgc-capture/src/main.cpp`
- `src/lib/nativeWindowsRecording.ts`
- `src/hooks/useAudioPeaks.ts`
- `src/components/video-editor/timeline/BackgroundWaveform.tsx`
- `src/components/video-editor/timeline/TimelineEditor.tsx`
- `src/components/launch/AppSettingsDialog.tsx`
- `src/lib/appSettings.ts`
- `src/components/video-editor/editorDefaults.ts`

## Verification

- `npm test -- src/hooks/recorderHandle.test.ts` passes.
- `npm test -- src/components/video-editor/projectPersistence.test.ts src/hooks/recorderHandle.test.ts` passes.
- `npm test -- src/hooks/recorderHandle.test.ts electron/ipc/recordingStream.test.ts src/components/video-editor/projectPersistence.test.ts` passes.
- `npm test -- electron/ipc/recordingPackage.test.ts electron/ipc/recordingStream.test.ts src/hooks/recorderHandle.test.ts src/components/video-editor/projectPersistence.test.ts` passes.
- `./node_modules/.bin/tsc --noEmit` passes.
- `npm run build-vite` passes.
- `npm run lint` passes.
- `swiftc -parse-as-library -typecheck ... main.swift` passes with deprecation warnings only.
- `swiftc -parse-as-library ... main.swift -o electron/native/screencapturekit/build/openscreen-screencapturekit-helper` passes and refreshes the local dev helper binary.
- `npm test -- src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts src/components/video-editor/projectPersistence.test.ts electron/ipc/recordingPackage.test.ts src/hooks/recorderHandle.test.ts electron/ipc/recordingStream.test.ts` passes.
- `npm test -- src/components/video-editor/videoPlayback/cursorFollowUtils.test.ts src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts src/components/video-editor/timeline/zoomSuggestionUtils.test.ts src/lib/exporter/videoExporter.test.ts src/lib/exporter/videoExporter.browser.test.ts` passes after the auto-follow smoothing and per-suggestion focus-mode updates.
- `npm test -- electron/ipc/recordingPackage.test.ts src/components/video-editor/timeline/zoomSuggestionUtils.test.ts src/components/video-editor/videoPlayback/cursorFollowUtils.test.ts src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts` passes with 14 tests after native webcam package compatibility coverage.
- `./node_modules/.bin/tsc --noEmit` passes after native webcam sidecar refactor.
- `swiftc -parse-as-library -typecheck electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift` passes after native webcam sidecar refactor with deprecation warnings only.
- `swiftc -parse-as-library electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift -o electron/native/screencapturekit/build/openscreen-screencapturekit-helper` passes and refreshes the local macOS helper binary.
- `npm run generate:icons -- /Users/macbook/Downloads/logo.png` passes and regenerates all app icon assets from the stored source logo.
- `npm run lint` and `./node_modules/.bin/tsc --noEmit` pass after the settings footer simplification.
- `npm run build-vite` passes after the ranged/cached waveform refactor.
- `npm test -- src/components/video-editor/timeline/zoomSuggestionUtils.test.ts src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts` passes after the ranged/cached waveform refactor.
- `npx tsc --noEmit` passes after the app settings center work.
- `npm test -- src/lib/userPreferences.test.ts src/components/video-editor/editorDefaults.test.ts` passes after the app settings center work.
- `npm run build-vite` passes after the app settings center work.
- `npm run build:native:mac` is blocked by the local machine using Command Line Tools instead of full Xcode.
- `npm run i18n:check` still fails on pre-existing translation drift; the new `tooltips.chooseRecordingDirectory` key is no longer listed as missing.
- Latest verified checkpoint before this handoff update: `ba701c2 fix: simplify settings footer contact copy`.
- Archive before app settings center work: `archive/before-app-settings-20260617`.

## Next Engineering Step

Run real macOS durability validation against the native `webcam.mp4` path:

1. Record with microphone, webcam, and editable cursor enabled.
2. Confirm the selected folder shows one `recording-<id>.likelysnap` package.
3. Confirm package contents grow/update during capture and end as `screen.mp4`, `webcam.mp4`, `cursor.json`, `manifest.json`.
4. Confirm opening/moving the package keeps webcam, cursor telemetry, and `webcamStartOffsetMs`.
5. Confirm editor preview and exported MP4 remain in sync.
6. Confirm normal auto-generated zooms are stable by default, long same-area explanations become one longer zoom, held-click/drag suggestions default to Follow Mouse, and selected zooms can still be manually switched between Follow Mouse off/on in the settings panel.
7. Open the known package `/Users/macbook/Movies/LikelySnap/recording-1781670268254.likelysnap`; the editor should open `screen.mp4` and skip the 4 GB legacy `webcam.webm` with a warning instead of freezing.
8. Validate the native Windows webcam sidecar on a Windows machine with `npm run build:native:win` and `npm run test:wgc-full:win`.
9. Open `/Users/macbook/Movies/LikelySnap/recording-1781685552950.likelysnap`, confirm the editor remains interactive with waveform visible by default, and confirm the waveform uses cached peaks on the next load.
10. Open the HUD settings gear and verify recording/project/cache directories, cache size/clear, quality, FPS, and default recording toggles persist across app restarts and affect the next recording.
