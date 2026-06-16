# Audio/Video Sync Investigation

The current user-reported issue is audio/video desync on macOS. Treat this as distinct from missing audio.

## macOS Source Recording Path

Relevant file:

- `electron/native/screencapturekit/Sources/OpenScreenScreenCaptureKitHelper/main.swift`

Current behavior:

- ScreenCaptureKit emits screen, system audio, and, when supported, microphone samples.
- The helper starts `AVAssetWriter` on the first complete screen frame.
- `writer.startSession(atSourceTime: presentationTime)` uses the first video sample time as the session start.
- Audio samples before `didStartWriting` are dropped by `appendAudioSampleBuffer`.
- During pause, both video/audio samples are retimed by subtracting `totalPausedDuration`.
- The helper now counts video append success/failure, audio append success/failure, audio drops before writer start, and audio drops when the writer input is not ready.
- After `AVAssetWriter.finishWriting`, the helper scans the written MP4 with `AVAssetReader` and emits `recording-diagnostics` before `recording-stopped`.
- The main process stores this diagnostics payload in the recording `.session.json` manifest.

Initial assessment:

- The macOS helper is structurally capable of sync because ScreenCaptureKit sample timestamps should share a coherent time base.
- The code now reports post-recording track timestamp ranges, but the data still needs to be collected from real macOS recordings.
- If the user's desync appears in the raw recording before export, inspect actual packet/sample timestamp ranges first.

## macOS Webcam Sidecar Risk

Relevant renderer code:

- `src/hooks/useScreenRecorder.ts`
- `src/lib/recordingSession.ts`
- `src/components/video-editor/VideoPlayback.tsx`
- `src/lib/exporter/videoExporter.ts`
- `src/lib/exporter/gifExporter.ts`

The likely user-visible issue is webcam video leading microphone audio when the user records with webcam enabled. The native macOS screen/audio MP4 diagnostics collected from local recordings showed audio tracks starting around 133-150 ms before the first video sample, not a clear "video ahead of audio" defect in the raw MP4. The higher-risk path was the renderer webcam sidecar starting before the native ScreenCaptureKit helper had confirmed its screen/audio timeline.

Implemented fix:

- The renderer now waits for the native macOS helper's `recording-started` event before starting the webcam `MediaRecorder`.
- The main process returns `captureStartedAtMs` from the helper's start event.
- The renderer stores `webcamStartOffsetMs = webcamStartedAtMs - captureStartedAtMs` in the recording session.
- Project/session normalization preserves `webcamStartOffsetMs` only when a webcam sidecar exists.
- Editor preview seeks webcam media at `currentTime - webcamStartOffsetMs` and hides it before its real start point.
- MP4 and GIF exports use the same offset when requesting webcam frames.

Still required:

- Re-record on macOS with webcam and microphone enabled and inspect the resulting `.session.json`.
- If the webcam still appears ahead/behind after this fix, compare mouth movement against mic audio in the editor and exported MP4, then add measured per-device calibration only if there is a repeatable residual device latency.

## Browser Fallback Risk

Relevant files:

- `src/hooks/useScreenRecorder.ts`
- `src/hooks/recorderHandle.ts`
- `electron/recording/webm-duration.ts`

Current behavior:

- Screen video and audio tracks are combined into one `MediaStream`.
- System audio and mic are mixed with a renderer `AudioContext` when both are enabled.
- `MediaRecorder` emits chunks.
- Streamed WebM duration is patched on disk using renderer wall-clock duration.

Risks:

- Wall-clock duration can differ from real packet timestamp duration if the encoder stalls, pauses, or drops frames.
- Patching duration with wall-clock time can make editor timelines disagree with actual audio/video packet timing.
- Renderer `AudioContext` clock and captured video track timing are not explicitly measured.

## Export Sync Risk

Relevant files:

- `src/lib/exporter/videoExporter.ts`
- `src/lib/exporter/audioEncoder.ts`
- `src/lib/exporter/muxer.ts`

Current behavior:

- Video frames are decoded, rendered, and re-encoded first.
- Audio is processed afterward and muxed into the MP4.
- Trim-only audio remaps timestamps by subtracting trim offsets.
- Speed-region audio is rendered via an HTML audio element, `playbackRate`, and a `MediaRecorder`.
- Final MP4 output is held in memory through `BufferTarget`.

Risks:

- Speed-region audio rendering uses browser playback timing, not the same deterministic frame timeline as video export.
- Source audio with unsupported decoder/encoder support can silently become video-only.
- There is no final exported-file audio/video sync validation.

## Required Diagnostics

Implemented for macOS source recordings:

- source file video track start/end/duration;
- source file audio track start/end/duration;
- detected audio/video offset;
- whether mic/system audio was requested;
- whether audio samples were actually written;
- AVAssetWriter append/drop/failure counts.

Still required for export:

- export file video/audio track start/end/duration.
- source-to-export audio timeline offset.
- loud failure when requested audio cannot be preserved.

## Working Hypotheses

1. If desync exists in the raw macOS recording, the bug is in ScreenCaptureKit/AVAssetWriter timing or post-recording interpretation.
2. If raw recording is in sync but exported MP4 is out of sync, the bug is in `AudioProcessor` or `VideoMuxer`.
3. If only webcam is out of sync, first inspect `webcamStartOffsetMs` in the session manifest; the native screen/audio plus renderer webcam sidecar start-time mismatch is now explicitly modeled.
4. If desync grows over time, suspect independent clocks or sample-rate drift.
5. If desync is constant, suspect start-time offset or pre-roll handling.

## How To Read The New Manifest Diagnostics

Open the `.session.json` next to the recorded MP4 and inspect:

- `diagnostics.audioStartOffsetsMs`: audio track start relative to the first video sample.
- `diagnostics.writerSamples.systemAudio.droppedBeforeWriterStart`: audio pre-roll dropped before first video frame.
- `diagnostics.writerSamples.*.appendFailures`: failed appends that must be treated as a source recording defect.
- `diagnostics.tracks.video[0].firstSampleMs` and `diagnostics.tracks.audio[*].firstSampleMs`: raw media timeline boundaries.
