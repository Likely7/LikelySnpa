# Agent Instructions

- Do not ship temporary workarounds. The user explicitly wants final, durable fixes only.
- Current primary platform is macOS. Prioritize ScreenCaptureKit, AVAssetWriter, macOS permissions, Finder-visible recording directories, and the `.likelysnap` recording package model.
- Treat long recordings as first-class. A 20-minute recording must not depend on renderer memory or a final all-at-once save.
- Preserve editor behavior while changing storage: cursor telemetry, auto zoom, per-zoom Follow Mouse, webcam sidecar video, captions, trim/speed regions, project save/load, and MP4 export must continue to work.
- Before changing recording code, identify whether a path affects source recording, editor preview, or export. Audio/video sync can break independently in each layer.
- Keep files recoverable. During recording/export, use streamable package-internal files plus manifest state; on crash, preserve recoverable media rather than deleting partial output.
- Prefer focused tests and instrumentation over guessing. Add diagnostics that can prove track presence, duration, packet timestamp ranges, and audio/video offset.
