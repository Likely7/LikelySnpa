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
52. Added a settings center entry from the launch HUD gear button beside the language switch.
53. Persisted app settings in Electron `userData/app-settings.json`, including recording directory, project directory, cache directory, recording quality, frame rate, and default recording toggles.
54. Wired recording quality and frame-rate settings into macOS native recording, Windows native recording, and browser fallback recording.
55. Wired project file save/open dialogs to prefer the configured project directory and cache operations to the configured cache directory.
56. Moved app settings out of the transparent HUD overlay into a standalone Electron settings BrowserWindow so the lower half is visible and all controls remain clickable.
57. Added the same settings entry to the editor top bar beside the language selector, sharing the standalone settings window and persisted `app-settings.json` behavior.
58. Detached the repository from the original upstream remote and aligned the README as a professional LikelySnap document while keeping attribution that the codebase is based on OpenScreen 1.5.0.
59. Set the LikelySnap package/app version to `1.0.0`, updated package metadata and handoff status, committed `b3ae601 chore: set version to 1.0.0`, and pushed it to `origin/main`.
60. Built a macOS ARM64-only 1.0.0 DMG and copied it to `/Users/macbook/Desktop/LikelySnap-Mac-arm64-1.0.0-Installer.dmg`; the build is ad-hoc signed and not notarized.
61. Reviewed Windows MP4 export performance at source level. Current edited MP4 export uses WebCodecs plus canvas/Pixi frame compositing, but Windows prefers `prefer-software` before `prefer-hardware`, so exports are likely CPU-encoded unless software fails. The final MP4 mux target is still in-memory `BufferTarget`, not a temp-file/streaming writer.
62. Pruned public GitHub packaging noise: removed old release/build workflows that still referenced upstream signing/notarization/Nix/Discord automation and removed macOS/Windows packaging command sections from the public README.
63. Created archive `archive/before-nle-editor-architecture-20260618-000347` before starting the long-recording editor architecture pass.
64. Documented the new NLE-style editor architecture plan in `handoff/NLE_EDITOR_ARCHITECTURE_PLAN.md` after a one-hour Windows recording stayed non-interactive for more than five minutes despite low CPU/GPU/memory utilization.
65. Implemented the first editor-open architecture pass: added native bridge `CursorPreviewData`, preview cursor loading, main-process cursor parse cache, single-source `useCursorEditorData()`, idle auto zoom suggestion generation, idle waveform generation startup, and editor-open timing logs.
66. Preserved full-fidelity export behavior by loading full cursor recording data only when export starts, while keeping editor preview and auto zoom on bounded preview samples.
67. Restored cursor rendering and mouse settings after the staged editor-open pass hid the full native cursor asset table from preview data. Preview cursor rendering now falls back to built-in themed cursor assets, while export can still load full cursor data.
68. Added the FFmpeg MP4 export pipeline: `FfmpegVideoExporter`, FFmpeg resolver, main-process FFmpeg service, IPC start/write/finish/cancel handlers, preload/native bridge contracts, audio timeline filter generation, temp-file output, and hardware-first encoder selection with CPU fallback.
69. Switched `VideoEditor` MP4 export to the FFmpeg path. GIF export remains on the existing GIF path, and the old WebCodecs MP4 exporter remains in the codebase as compatibility/fallback.
70. Added `CHANGELOG.md` and synchronized README plus handoff docs with the current baseline: staged long-recording editor open, restored cursor UI/rendering, FFmpeg streaming MP4 export, and remaining validation work.
71. Fixed macOS raw recording quality regression: ScreenCaptureKit display capture now uses display mode backing pixels instead of logical display size, H.264 output includes BT.709 color metadata, helper events/manifest diagnostics include actual width/height/FPS/bitrate/color data, macOS bitrate is computed in the helper from the actual output dimensions and quality multiplier, and the local dev helper binary was rebuilt.
72. Added package-local `cursor-preview.json` as a movable preview index for cursor data. The main process now writes and validates it by package-relative source identity, the editor uses it instead of parsing full `cursor.json` on open, and package paths/tests now include it as a first-class package file.
73. Reopened the macOS dev app against `recording-1781685552950.likelysnap` and confirmed the new cursor preview path in real logs: `[editor-open] cursor preview cache hit` completed in 13ms.
74. Rolled GitHub `main` back to `2458939` after the later MP4 faststart/webcam sidecar cleanup attempt made Windows long-project open behavior worse. The stable baseline is the staged-editor-open/cursor-preview version.
75. Clarified the long-video architecture status: the project has implemented the first NLE-style staged-open pass, but it has not implemented true preview proxy media yet. There is no generated `proxy-screen.mp4` / `proxy-webcam.mp4`, no proxy playback switch, and no package-local `cache/media-info.json` pipeline yet.
76. Compared LikelySnap Auto Zoom selection with OpenScreen v1.5.0/current upstream and Screen Studio public behavior. OpenScreen is simple dwell-based selection; Screen Studio publicly emphasizes click-position-driven auto zoom; LikelySnap's current mixed dwell/click/long-span model can choose odd spots because it combines multiple philosophies without a clear intent score.
77. Planned the durable Auto Zoom/Follow Mouse refinement: per-zoom `Off`, `Smart Follow Mouse`, `Always Follow Mouse`; Smart Follow default on globally; global Smart Follow and global Always Follow mutually exclusive; Smart Follow safe area derived from actual/custom zoom scale; Always Follow slowed and eased to prevent tight camera shake.
78. Implemented the three-state zoom follow model. `focusMode` now supports `manual`, `smart`, and `auto`; selected zoom settings show `Off`, `Smart`, and `Always`; the timeline has separate Smart Follow and Always Follow global buttons; the global buttons are mutually exclusive; existing `focusMode: auto` projects remain Always Follow.
79. Implemented scale-aware Smart Follow Mouse in shared playback/export code. Smart Follow keeps the camera anchored while the cursor stays inside the zoom-scale-derived safe area, then eases the camera only when the cursor approaches the visible zoom boundary. Always Follow now uses slower damped motion so the cursor can lead and the picture catches up instead of shaking tightly.
80. Rebalanced Auto Zoom candidate selection into an intent-scored model: double click, repeated click, press/drag, and meaningful dwell are favored; isolated single click is no longer a standalone trigger; click-and-immediately-leave is rejected; long dwell zoom duration is bounded; accepted suggestions are sorted back into timeline order.
81. Tightened the Auto Zoom selector after real product-feel testing:
  - `1000ms` is now the short dwell confirmation window, so hover-based Zooms are confirmed later while still starting from the real dwell onset.
  - Ordinary single clicks are ignored because they catch too many app-close/button-click actions.
  - Repeated clicks and double-clicks still create short intentional zooms.
  - Press/drag detection still requires at least `450ms` of held-button overlap so slow normal clicks are less likely to become Smart Follow zooms.
  - Stable same-area cursor dwell longer than `8s` creates a long explanation zoom span based on the actual dwell duration plus context padding, capped at `45s`.
  - Nearby auto zoom suggestions within `1500ms` are merged into one longer span so the follow-follow camera motion can carry through very short gaps without over-merging separate explanation points.
  - This specifically covers article/script narration where the cursor rests on a paragraph for tens of seconds; the generated zoom should stay stable instead of jumping in and out every fixed short duration.
82. Fixed the macOS native webcam stop/finalize race that could leave `webcam.mp4` at 0 bytes with AVAssetWriter `.sb-*` side-band files. The ScreenCaptureKit helper now stops/finalizes webcam before emitting `recording-stopped`, reports `webcamPath` only when the webcam writer completed with samples, bytes, and a readable video track, and preserves failed side-band artifacts for diagnostics instead of deleting them.
83. Fixed the remaining macOS native webcam writer instability by changing webcam frame writing from retimed camera sample-buffer appends to `AVAssetWriterInputPixelBufferAdaptor` pixel-buffer appends. The user retested with `/Users/macbook/Movies/LikelySnap/recording-2026-06-19-20-24-41-248.likelysnap`: package has a valid `webcam.mp4` (`49,666,110` bytes), `manifest.json` includes `media.webcamVideoPath`, `ffprobe` reads H.264 1280x720 / ~196.99s / 5893 frames, and no `.sb-*` side-band files are present.
84. Refined Auto Zoom dwell detection after Windows testing feedback: final suggestion merge gap is now `1500ms`; dwell detection uses a small-region model (`0.035` normalized radius, `500ms` grace, `1200ms` max sample gap, minimum 3 samples) so normal hand jitter inside a tight explanation area still counts as one dwell; long-dwell generated spans now anchor to the dwell start plus context padding instead of centering and appearing late.

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
- `src/components/video-editor/videoPlayback/constants.ts`
- `src/lib/exporter/frameRenderer.ts`
- `src/components/video-editor/SettingsPanel.tsx`
- `scripts/generate-icons.mjs`
- `icons/source/logo.png`
- `icons/icons/*`
- `public/likelysnap.png`
- `handoff/LONG_RECORDING_NATIVE_WEBCAM_PLAN.md`
- `electron/recording/webm-duration.ts`
- `electron/native/wgc-capture/src/main.cpp`
- `src/lib/nativeWindowsRecording.ts`
- `src/hooks/useAudioPeaks.ts`
- `electron/ipc/handlers.ts`
- `electron/ipc/recordingPackage.ts`
- `electron/ipc/recordingPackage.test.ts`
- `electron/ipc/nativeBridge.ts`
- `electron/native-bridge/cursor/telemetryCursorAdapter.ts`
- `src/native/hooks/useCursorEditorData.ts`
- macOS native webcam finalize fix:
  - `electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift`
  - `electron/ipc/handlers.ts`
  - `src/lib/nativeMacRecording.ts`
- macOS native webcam PixelBufferAdaptor fix:
  - `electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift`

## 2026-06-18 Package Size Cleanup Pass 1

- Created checkpoint commit `6ee1bfd` before size cleanup.
- Kept auto captions and bundled caption assets intact.
- Replaced remaining `react-icons` usage in the launch UI with existing `lucide-react` icons so the full `react-icons` package can be removed from production dependencies.
- Removed unused production dependencies with no runtime imports: `react-icons`, `emoji-picker-react`, `gsap`, `mp4box`, `@pixi/filter-drop-shadow`, and `fix-webm-duration`; moved `@types/gif.js` and `tailwindcss-animate` to dev-only usage.
- Removed unused public/demo assets that were copied into `dist`/`app.asar`: `public/openscreen.png`, `public/preview3.png`, `public/preview4.png`, `public/sample.png`, `public/demo.png`, and `public/vite.svg`.
- Removed old Nix packaging files (`flake.nix`, `flake.lock`, `nix/`) from the LikelySnap mainline because current deliverables are macOS/Windows packages.
- Updated `scripts/generate-icons.mjs` so future icon generation only writes `public/likelysnap.png` plus platform icons.
- Set the package/app version to `1.1.0` and built an ARM64-only macOS DMG after the first safe cleanup pass. Output: `/Users/macbook/Desktop/LikelySnap-Mac-arm64-1.1.0-Installer.dmg`. Verification: `lipo -archs` returns `arm64`; `Info.plist` reports `1.1.0`; packaged `.app` is about `784M`, down from the previous about `869M`, with bundled offline auto captions retained.
- `src/components/video-editor/timeline/BackgroundWaveform.tsx`
- `src/components/video-editor/timeline/TimelineEditor.tsx`
- `src/components/launch/AppSettingsDialog.tsx`
- `src/lib/appSettings.ts`
- `src/components/video-editor/editorDefaults.ts`
- `electron/windows.ts`
- `src/App.tsx`
- `src/main.tsx`
- `handoff/PROJECT_STATUS.md`
- `handoff/PROJECT_OVERVIEW.md`
- `handoff/CURRENT_GOAL.md`
- `handoff/REMAINING_ISSUES_AND_TODOS.md`
- `handoff/NLE_EDITOR_ARCHITECTURE_PLAN.md`
- `src/native/contracts.ts`
- `src/native/client.ts`
- `src/native/hooks/useCursorEditorData.ts`
- `electron/ipc/nativeBridge.ts`
- `electron/native-bridge/cursor/adapter.ts`
- `electron/native-bridge/cursor/telemetryCursorAdapter.ts`
- `electron/native-bridge/services/cursorService.ts`
- `electron/ffmpeg/ffmpegResolver.ts`
- `electron/native-bridge/services/ffmpegService.ts`
- `src/lib/exporter/ffmpegVideoExporter.ts`
- `src/lib/exporter/ffmpegExportTypes.ts`
- `src/lib/exporter/exportTimeline.ts`
- `CHANGELOG.md`
- `.github/workflows/build.yml`
- `.github/workflows/bump-nix-package.yml`
- `.github/workflows/discord.yaml`

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
- `swiftc -O -parse-as-library -framework AVFoundation -framework CoreGraphics -framework CoreMedia -framework Foundation -framework ScreenCaptureKit electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift -o electron/native/screencapturekit/build/openscreen-screencapturekit-helper` passes and refreshes the local macOS helper binary after the native webcam finalize fix.
- `swiftc -O -parse-as-library -framework AVFoundation -framework CoreGraphics -framework CoreMedia -framework Foundation -framework ScreenCaptureKit electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift -o electron/native/screencapturekit/build/openscreen-screencapturekit-helper` passes and refreshes the local macOS helper binary after the native webcam PixelBufferAdaptor fix.
- Manual macOS recording validation after the native webcam PixelBufferAdaptor fix produced a valid package-local webcam sidecar: `/Users/macbook/Movies/LikelySnap/recording-2026-06-19-20-24-41-248.likelysnap/webcam.mp4` is readable by `ffprobe`, present in `manifest.json`, and no `.sb-*` files exist in the package.
- `npx tsc --noEmit` passes after the native webcam finalize fix.
- `npm test -- electron/ipc/recordingPackage.test.ts electron/ipc/recordingStream.test.ts src/lib/nativeMacRecording.test.ts src/lib/nativeWindowsRecording.test.ts` passes after the native webcam finalize fix.
- `npm run build-vite` passes after the native webcam finalize fix.
- `npm run generate:icons -- /Users/macbook/Downloads/logo.png` passes and regenerates all app icon assets from the stored source logo.
- `npm run lint` and `./node_modules/.bin/tsc --noEmit` pass after the settings footer simplification.
- `npm run build-vite` passes after the ranged/cached waveform refactor.
- `npm test -- src/components/video-editor/timeline/zoomSuggestionUtils.test.ts src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts` passes after the ranged/cached waveform refactor.
- `npx tsc --noEmit` passes after the app settings center work.
- `npm test -- src/lib/userPreferences.test.ts src/components/video-editor/editorDefaults.test.ts` passes after the app settings center work.
- `npm run build-vite` passes after the app settings center work.
- `npx tsc --noEmit` passes after moving app settings into a standalone Electron window.
- `npm test -- src/lib/userPreferences.test.ts src/components/video-editor/editorDefaults.test.ts` passes after moving app settings into a standalone Electron window.
- `npm run build-vite` passes after moving app settings into a standalone Electron window.
- `npm run build:native:mac` is blocked by the local machine using Command Line Tools instead of full Xcode.
- `npm run i18n:check` still fails on pre-existing translation drift; the new `tooltips.chooseRecordingDirectory` key is no longer listed as missing.
- Latest verified checkpoint before this handoff update: `7d1a3c2 fix: open app settings in standalone window`.
- Archive before app settings center work: `archive/before-app-settings-20260617`.
- `npx tsc` passes after the 1.0.0 version update.
- `npx vite build` passes during the 1.0.0 macOS ARM64 DMG build.
- `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --arm64 --config.npmRebuild=false` produced `release/1.0.0/LikelySnap-Mac-arm64-1.0.0-Installer.dmg`.
- `lipo -archs release/1.0.0/mac-arm64/LikelySnap.app/Contents/MacOS/LikelySnap` returns `arm64`.
- The built app `Info.plist` reports `CFBundleShortVersionString = 1.0.0` and `CFBundleVersion = 1.0.0`.
- `npx tsc --noEmit` passes after the first NLE editor-open architecture pass.
- `npm test -- src/components/video-editor/timeline/zoomSuggestionUtils.test.ts src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts src/lib/cursor/nativeCursor.test.ts src/lib/cursor/cursorPathSmoothing.test.ts` passes after the first NLE editor-open architecture pass.
- `npm run build-vite` passes after the first NLE editor-open architecture pass.
- `npx tsc --noEmit` passes after the FFmpeg MP4 export path and cursor preview fallback.
- `npm test -- src/components/video-editor/timeline/zoomSuggestionUtils.test.ts src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts src/lib/cursor/nativeCursor.test.ts src/lib/exporter/audioEncoder.test.ts src/lib/exporter/streamingDecoder.test.ts src/lib/exporter/timestampedVideoFrameQueue.test.ts` passes after the FFmpeg MP4 export path and cursor preview fallback.
- `npx biome check electron/ffmpeg/ffmpegResolver.ts electron/native-bridge/services/ffmpegService.ts electron/ipc/handlers.ts electron/ipc/nativeBridge.ts electron/preload.ts electron/electron-env.d.ts src/lib/exporter/ffmpegVideoExporter.ts src/lib/exporter/ffmpegExportTypes.ts src/lib/exporter/exportTimeline.ts src/lib/exporter/audioEncoder.ts src/lib/exporter/streamingDecoder.ts src/lib/exporter/types.ts src/lib/exporter/index.ts src/lib/cursor/nativeCursor.ts src/native/client.ts src/native/contracts.ts src/components/video-editor/VideoEditor.tsx` passes after the FFmpeg MP4 export path and cursor preview fallback.
- User manually tested the current app before this archive checkpoint and reported no obvious functional issue.
- `swiftc -parse-as-library -typecheck electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift` passes after the macOS raw recording quality fix with existing deprecation warnings only.
- `swiftc -parse-as-library electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift -o electron/native/screencapturekit/build/openscreen-screencapturekit-helper` passes after the macOS raw recording quality fix and refreshes the local dev helper.
- `npx tsc --noEmit` passes after the macOS raw recording quality fix.
- `npx biome check electron/ipc/handlers.ts electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift` passes after the macOS raw recording quality fix.
- Direct helper validation recorded the same built-in display at `3420x2224` with `yuv420p(tv, bt709, progressive)`, replacing the previous `1710x1112` raw source output. The later OBS-style settings validation confirmed High quality requests an explicit `8 Mbps` target for `3420x2224 @ 60fps` instead of applying any fixed 4K-derived target.

## Next Engineering Step

Continue validation and hardening from the current staged editor-open + FFmpeg export baseline:

1. Validate FFmpeg MP4 export on real long macOS and Windows x64 projects, with microphone/system audio/webcam/cursor/zoom/trims/speed changes.
2. On Windows x64, confirm whether FFmpeg uses `h264_nvenc` on the RTX 5070 machine or falls back to CPU, then expose that result in the UI/diagnostics.
3. Run an in-app macOS recording with webcam/mic/system audio/editable cursor enabled and confirm the package `screen.mp4` is full Retina/backing-pixel size with BT.709 metadata.
4. Add package-local `cache/media-info.json` and `cache/cursor-index.json` so cold app launches do not need to recompute preview metadata/indexes.
5. Add source-aware export FPS so 30 FPS recordings do not export at a fixed 60 FPS unless the user explicitly asks for it.
6. Add visible background preparation state for long media and preview proxy generation for very long/high-resolution recordings.
7. Keep validating `.likelysnap` package recovery: moved packages, missing manifest, interrupted recording, native `webcam.mp4`, and legacy oversized `webcam.webm` skip behavior.

## 2026-06-18 OBS-Style Recording Settings Update

- Created archive tag `archive/before-obs-style-recording-settings-20260618-100000` before changing the recording settings path.
- Replaced the hidden fixed-4K/native bitrate assumption with explicit preset bitrates: Standard `5 Mbps`, High `8 Mbps`, Ultra `15 Mbps`.
- Added persistent OBS-style recording controls: source/1080p/1440p/4K/custom resolution, preset/custom FPS, and preset/custom bitrate Mbps.
- Updated the settings UI so quality presets apply coherent bundles: Standard `1080p / 30 FPS / 5 Mbps`, High `source / 60 FPS / 8 Mbps`, Ultra `source / 60 FPS / 15 Mbps`. A separate Custom card unlocks manual resolution/FPS/bitrate controls, with custom bitrate capped at `60 Mbps`.
- Updated macOS native recording requests to pass `resolutionMode` and explicit `bitrate` in bps. Source mode preserves ScreenCaptureKit backing pixels; explicit resolution modes request the chosen output size.
- Updated Windows native recording requests and WGC helper parsing to consume explicit bitrate and FPS. Windows native resolution remains source-size because the current WGC path copies same-size textures; a real GPU scaling pass is required before Windows can honestly honor downscale/custom output sizes.
- Refreshed the local macOS ScreenCaptureKit dev helper binary with `swiftc -parse-as-library ... -o electron/native/screencapturekit/build/openscreen-screencapturekit-helper`.
- Direct macOS helper validation on the built-in Retina display passed:
  - Source request recorded `3420x2224` with requested `8,000,000` bps and BT.709 metadata; High is now defined as the source / `60 FPS` / `8 Mbps` preset.
  - Explicit 1080p request recorded `1920x1080 @ 30fps` with requested `5,000,000` bps and BT.709 metadata.
- Verification passed:
  - `npx tsc --noEmit`
  - `npx biome check src/lib/appSettings.ts src/hooks/useScreenRecorder.ts src/components/launch/AppSettingsDialog.tsx src/lib/nativeMacRecording.ts src/lib/nativeWindowsRecording.ts electron/ipc/handlers.ts`
  - `swiftc -parse-as-library -typecheck electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift` with existing warnings only.

## 2026-06-18 Recording Settings UI Follow-Up

- User tested the settings UI and approved the follow-up after these refinements:
  - High preset is now `source / 60 FPS / 8 Mbps`.
  - Recording routes are now four top-level cards: Standard, High, Ultra, and Custom.
  - Manual resolution/FPS/bitrate controls are visually disabled unless Custom is selected, avoiding the previous confusion where a preset looked selected while custom controls were editable.
  - Custom bitrate is capped at `60 Mbps` in the UI, settings normalization, macOS helper clamp, and Windows WGC helper clamp.
  - The bitrate slider uses a dark themed track instead of the native white range input.
  - The frameless standalone settings window has a draggable header region, with the close button marked as no-drag.
- Verification passed again after this follow-up:
  - `npx tsc --noEmit`
  - `npx biome check src/lib/appSettings.ts src/hooks/useScreenRecorder.ts src/components/launch/AppSettingsDialog.tsx electron/ipc/handlers.ts electron/native/wgc-capture/src/main.cpp`
  - `swiftc -parse-as-library -typecheck electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift` with existing warnings only.

## 2026-06-19 Smart Follow Mouse / Auto Zoom Intent Pass

- Created checkpoint `95c5269 docs: plan smart mouse follow zoom` before code changes.
- Implemented three per-zoom follow modes:
  - `manual` = Off / 禁用
  - `smart` = Smart Follow Mouse / 智能
  - `auto` = Always Follow Mouse / 始终
- Added a global Smart Follow Mouse timeline button. It defaults on for new editor state and is mutually exclusive with the existing global Always Follow Mouse button.
- Kept per-zoom override in the selected Zoom settings panel, so users can change any individual segment to Off, Smart, or Always regardless of the global batch/default control.
- Implemented scale-aware Smart Follow Mouse in preview and export through shared cursor-follow utilities. The safe area derives from the actual effective zoom scale, including custom scale.
- Slowed Always Follow Mouse and added stronger damping/dead-zone behavior so the cursor leads slightly and the camera catches up instead of tightly shaking.
- Reworked Auto Zoom scoring:
  - isolated single click is ignored because it is too noisy for UI-control recordings;
  - repeated click, double click, press/drag, and meaningful dwell score higher;
  - click-and-immediately-leave produces no suggestion;
  - held mouse-button spans default to Smart Follow Mouse instead of Always Follow Mouse;
  - long same-area dwell uses its real explanation span plus padding, capped at 45 seconds to avoid runaway default zoom spans;
  - final suggestions are sorted in timeline order after scoring/selection.
- Follow-up refinement after user testing:
  - raised held-button detection from `250ms` to `450ms`;
  - removed ordinary single-click standalone suggestions;
  - added a separate long-dwell candidate so a 30 second article explanation can become one stable long zoom instead of one short auto zoom;
  - short hover zooms now wait for a `1000ms` confirmation window before appearing;
  - nearby suggestions within `1500ms` merge into one longer span so narration can carry through short gaps without over-merging unrelated explanation points.
  - dwell detection now uses a small-region model rather than requiring the cursor to be perfectly still, and long-dwell spans start at the dwell onset plus context padding instead of being centered around the dwell midpoint.
- Preserved preview/export consistency by updating both `VideoPlayback` and `FrameRenderer`.
- Verification passed:
  - `./node_modules/.bin/tsc --noEmit --pretty false`
  - `npm test -- src/components/video-editor/timeline/zoomSuggestionUtils.test.ts src/components/video-editor/videoPlayback/cursorFollowUtils.test.ts src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts src/components/video-editor/projectPersistence.test.ts src/components/video-editor/editorDefaults.test.ts`
  - `npx biome check src/components/video-editor/SettingsPanel.tsx src/components/video-editor/VideoEditor.tsx src/components/video-editor/VideoPlayback.tsx src/components/video-editor/projectPersistence.ts src/components/video-editor/projectPersistence.test.ts src/components/video-editor/timeline/TimelineEditor.tsx src/components/video-editor/timeline/zoomSuggestionUtils.ts src/components/video-editor/timeline/zoomSuggestionUtils.test.ts src/components/video-editor/videoPlayback/constants.ts src/components/video-editor/videoPlayback/cursorFollowUtils.ts src/components/video-editor/videoPlayback/cursorFollowUtils.test.ts src/lib/exporter/frameRenderer.ts src/hooks/useEditorHistory.ts src/i18n/locales/en/settings.json src/i18n/locales/en/timeline.json src/i18n/locales/zh-CN/settings.json src/i18n/locales/zh-CN/timeline.json`
  - latest dwell-region follow-up: `npm test -- src/components/video-editor/timeline/zoomSuggestionUtils.test.ts src/components/video-editor/videoPlayback/cursorFollowUtils.test.ts src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts`, `npx tsc --noEmit`, and `npm run build-vite` pass.
  - `npm run build-vite`
- Additional follow-up verification passed:
  - `npm test -- src/components/video-editor/timeline/zoomSuggestionUtils.test.ts`
  - `npm test -- src/components/video-editor/timeline/zoomSuggestionUtils.test.ts src/components/video-editor/videoPlayback/cursorFollowUtils.test.ts src/components/video-editor/videoPlayback/zoomRegionUtils.test.ts src/components/video-editor/projectPersistence.test.ts src/components/video-editor/editorDefaults.test.ts`
  - `./node_modules/.bin/tsc --noEmit --pretty false`
  - `npx biome check src/components/video-editor/timeline/zoomSuggestionUtils.ts src/components/video-editor/timeline/zoomSuggestionUtils.test.ts`
  - `npm run build-vite`
