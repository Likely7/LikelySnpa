# Long Recording Native Webcam Plan

## Problem Statement

A real macOS recording of roughly 32 minutes produced a valid `.likelysnap` package, but the editor became unusable when opening it.

Observed package:

```text
screen.mp4    ~310 MB
webcam.webm   ~4.0 GB
cursor.json   ~10 MB / ~43k samples
manifest.json ~2 KB
```

At that time, the main screen recording was healthy and the failure was caused by the old webcam sidecar:

1. The macOS webcam path still uses renderer `MediaRecorder` and writes `webcam.webm`.
2. The webcam stream is not bounded tightly enough for long recordings.
3. Stop/finalize tries to patch WebM duration by reading the entire file.
4. Node rejected the 4 GB file with `ERR_FS_FILE_TOO_LARGE`.
5. The editor then tries to mount the huge, unpatched WebM as a synced `<video>` sidecar.

The `.likelysnap` package directory itself is not the bottleneck. The problem is large media handling and long-recording editor architecture.

## Implementation Status

Implemented on 2026-06-17:

- macOS native recordings now request a package-local `webcam.mov` path and the ScreenCaptureKit helper records webcam video with `AVCaptureSession + AVCaptureVideoDataOutput`, writing camera sample buffers directly through `AVAssetWriterInput.append(sampleBuffer)`.
- Superseded macOS webcam stabilization attempt on 2026-06-19:
  - helper stop now finalizes webcam before emitting the native `recording-stopped` result;
  - manifest only includes `webcamPath` after the webcam writer completed with samples, non-zero bytes, and a readable video track;
  - webcam frames temporarily appended via `AVAssetWriterInputPixelBufferAdaptor` from camera pixel buffers instead of retimed camera sample-buffer copies.
- Short real-device macOS validation initially passed after the PixelBufferAdaptor attempt: `/Users/macbook/Movies/LikelySnap/recording-2026-06-19-20-24-41-248.likelysnap` contains a valid package-local `webcam.mp4` (`49,666,110` bytes, H.264 1280x720, ~196.99s, 5893 frames), no `.sb-*` files, and `manifest.json` includes `media.webcamVideoPath`. This is historical validation only; it is not the current macOS webcam architecture.
- Follow-up on 2026-06-21: the PixelBufferAdaptor path was abandoned after newer packages reproduced `webcam-writer-failed`, `AVFoundationErrorDomain -11800`, underlying `NSOSStatusErrorDomain -16364`, and unfinalized `webcam.mp4` files missing `moov atom`. The later `AVCaptureMovieFileOutput` attempt was also abandoned after `/Users/macbook/Movies/LikelySnap/recording-2026-06-21-15-39-20-754.likelysnap` produced a readable but truncated `webcam.mov` (~11.07s webcam vs ~69.08s screen). macOS webcam recording now uses direct sample-buffer appends into `AVAssetWriter` and still needs real 1/5/20+ minute validation.
- Windows native recordings now pass package-local `webcam.mp4` to the WGC helper and rely on the existing Media Foundation/DirectShow webcam path instead of a renderer `MediaRecorder` sidecar.
- Native start paths no longer create renderer webcam recorders on macOS or Windows. The renderer only performs permission/device preflight, then releases the preview stream so the native helper can own the camera.
- Windows stop/finalize no longer reads the native `screen.mp4` back into an `ArrayBuffer` and no longer repackages the recording after stop.
- New package helpers use `webcam.mov` as the canonical macOS webcam sidecar and `webcam.mp4` as the canonical Windows webcam sidecar while keeping legacy `webcam.mp4` and `webcam.webm` package children loadable.
- Editor package/session loading stats webcam sidecars before mounting them and skips files above the safe 2 GB threshold so the main screen video remains editable.
- WebM duration patching now refuses whole-file reads above the 2 GB safe threshold.
- Windows native webcam sidecar bitrate was lowered to editor-appropriate values.

Still requiring real-device validation:

- macOS 20-30+ minute recording with screen, system audio, microphone, native webcam, editable cursor, and auto zoom.
- Windows real-machine recording with webcam sidecar, because this macOS machine cannot compile or run the Windows WGC helper.
- Long export durability, because edited MP4 export still needs a streaming/temp-file path before claiming multi-hour export support.

## Product Contract

LikelySnap should behave like a lightweight NLE for long recordings:

- Project/package files reference media on disk; they do not inline or copy whole media into memory.
- Preview decodes only the currently needed timeline region.
- Sidecars are optional at open time; a broken or huge webcam file must not prevent editing the main screen video.
- Generated caches/proxies are allowed, but the original package remains the source of truth.
- Export writes to disk incrementally and never builds full output media in memory.

## Target Package Model

New native recordings should converge on:

```text
recording-<id>.likelysnap/
  screen.mp4
  webcam.mov   # macOS native webcam; Windows native uses webcam.mp4
  cursor.json
  manifest.json
```

Compatibility remains required:

```text
recording-<id>.likelysnap/
  screen.mp4
  webcam.webm
  cursor.json
  manifest.json
```

The editor must treat `manifest.media.webcamVideoPath` as format-agnostic.

## Platform Strategy

### macOS

- Keep screen capture on `ScreenCaptureKit + AVAssetWriter`.
- Webcam sidecar now records natively with `AVCaptureSession + AVCaptureVideoDataOutput` and direct sample-buffer appends into `AVAssetWriter`; neither the abandoned PixelBufferAdaptor writer nor the later MovieFileOutput attempt should be reintroduced as the default path.
- New native macOS recordings write package-local `webcam.mov`.
- Limit webcam capture to editor-appropriate settings:
  - target max resolution: 1280x720;
  - target fps: 30;
  - target bitrate: about 1.5-2.5 Mbps.
- Emit webcam path/format diagnostics from the helper.

### Windows

- Keep screen capture on WGC helper.
- Use the existing Media Foundation webcam capture path already present in `electron/native/wgc-capture`.
- Electron passes package-local `webcam.mp4` as `webcamPath`.
- Stop/finalize attaches the native webcam sidecar directly and does not read the main MP4 into memory.
- Native webcam sidecar bitrate has been lowered from the previous high settings (`8 Mbps` for 720p+) to an editor-appropriate target.
- Keep DirectShow fallback for virtual cameras.

### Fallback

When native webcam capture is unavailable:

- Use renderer `MediaRecorder` only as fallback.
- Write `webcam.webm`.
- Apply strict webcam constraints and bitrate.
- Never run whole-file WebM duration patch on files over the safe size threshold.

## Immediate Stabilization

Implemented:

1. Add a safe file-size guard around `patchWebmDurationOnDisk`.
2. Skip WebM duration patch for files over 2 GB.
3. Add editor-side sidecar guard:
   - if webcam sidecar is huge or metadata load is slow, open the main video without webcam;
   - show a non-blocking warning;
   - keep manifest/session intact.
4. Keep old packages recoverable even if their webcam sidecar is skipped.

## Five-Hour Recording Expectations

With native sidecars and bounded webcam settings:

- `screen.mp4` may be several GB.
- Native webcam sidecars (`webcam.mov` on macOS, `webcam.mp4` on Windows) may be several GB depending on bitrate, but should be linear and seekable.
- `cursor.json` may approach 100 MB if sampled densely.
- Opening the package must not read media files fully into memory.
- Auto zoom must not repeatedly scan cursor telemetry with unbounded work.
- Export must be streaming/temp-file based before claiming five-hour export support.

The goal is not "files stay tiny"; the goal is "large files remain referenced, seekable, and incremental."

## Implementation Phases

### Phase 1: Guard Current Long Recordings

- Skip whole-file WebM duration patch above a safe threshold.
- Add editor webcam sidecar size/metadata guard.
- Allow main screen edit when webcam sidecar is skipped.
- Document the skipped sidecar in diagnostics.

Status: implemented, pending user-facing app verification with the existing 4.4 GB package.

### Phase 2: Native Webcam Sidecars

- macOS: use `AVCaptureSession + AVCaptureVideoDataOutput` plus direct `AVAssetWriterInput.append(sampleBuffer)` sidecar writing in the ScreenCaptureKit helper.
- Windows: wire the existing native webcam sidecar into the package/session path and lower bitrate.
- Change new native sidecar filenames to `webcam.mov` on macOS and `webcam.mp4` on Windows.
- Keep `webcam.webm` as compatibility/fallback.

Status: implemented in code. macOS helper typecheck/build passes locally after switching to direct sample-buffer webcam writing, but real 1/5/20+ minute macOS webcam validation is still required. Windows code path is implemented but still requires Windows compile/run validation.

### Phase 3: Long-Recording Editor Architecture

- Lazy-load webcam sidecar and make it non-blocking.
- Add cursor telemetry indexing/downsampling for long files.
- Bound auto zoom suggestion generation on multi-hour telemetry.
- Add package diagnostics for file sizes, codecs, duration, and skipped sidecars.

### Phase 4: Export Durability

- Move edited MP4 export to an FFmpeg-based streaming/temp-file output pipeline.
- Keep renderer compositing, but hand off final encoding/muxing to FFmpeg.
- Prefer hardware encoders when available, with explicit CPU fallback and actual encoder diagnostics.
- Preserve audio explicitly or fail loudly.
- Add export sync diagnostics for long recordings.

## Acceptance Criteria

1. A 30+ minute macOS recording with webcam opens in the editor without freezing.
2. A 30+ minute Windows recording with webcam writes a package-local sidecar and opens in the editor.
3. New native webcam sidecars are movie files handled by the native platform stack: `webcam.mov` on macOS, `webcam.mp4` on Windows.
4. Old `webcam.webm` packages still open; huge/broken webcam sidecars are skipped without blocking main video editing.
5. The manifest keeps relative paths and `webcamStartOffsetMs`.
6. No stop/finalize path reads multi-GB media files into memory.
7. Preview and export still align webcam with the screen timeline.
8. The app can record for at least 20 minutes with screen, system audio, mic, webcam, editable cursor, and auto zoom enabled.
