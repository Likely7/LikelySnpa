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

Initial assessment:

- The macOS helper is structurally capable of sync because ScreenCaptureKit sample timestamps should share a coherent time base.
- The code does not currently prove sync after recording. There is no post-recording track timestamp validation.
- If the user's desync appears in the raw recording before export, inspect actual packet/sample timestamp ranges first.

## macOS Webcam Sidecar Risk

Relevant renderer code:

- `src/hooks/useScreenRecorder.ts`

For native macOS screen recording, webcam sidecar recording is still started through renderer `MediaRecorder` before or around native helper startup. This can desync webcam video from the native screen recording if the sidecar starts earlier than the screen timeline.

This is not the same as audio/video sync, but it is a timeline sync risk and must be preserved when changing disk writing.

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

Before large behavior changes, add diagnostics that can report:

- source file video track start/end/duration;
- source file audio track start/end/duration;
- detected audio/video offset;
- whether mic/system audio was requested;
- whether audio samples were actually written;
- export file video/audio track start/end/duration.

For macOS source files, prefer lightweight native or main-process validation after `AVAssetWriter.finishWriting`.

## Working Hypotheses

1. If desync exists in the raw macOS recording, the bug is in ScreenCaptureKit/AVAssetWriter timing or post-recording interpretation.
2. If raw recording is in sync but exported MP4 is out of sync, the bug is in `AudioProcessor` or `VideoMuxer`.
3. If only webcam is out of sync, the bug is likely native screen recording plus renderer webcam sidecar start-time mismatch.
4. If desync grows over time, suspect independent clocks or sample-rate drift.
5. If desync is constant, suspect start-time offset or pre-roll handling.
