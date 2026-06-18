# LikelySnap GitHub Promo · Director Notes

## Intent

This is a 10 second GitHub-first product film, not a social ad and not a full launch trailer. The job is to make a repository visitor understand LikelySnap in one glance: a practical screen recorder/editor rebuilt for long recordings, native capture, editable cursor data, automatic zoom, and disk-backed `.likelysnap` projects.

The film should feel like a polished open-source product artifact. It should not look like generic AI SaaS marketing. The product itself is the visual subject: a real package structure, a real editor-like workspace, cursor telemetry, zoom regions, export, and the LikelySnap brand.

Core line:

> Long recordings. Smooth editing.

## Visual System

- Canvas: 1920 x 1080, 16:9.
- Duration: 10 seconds.
- Base: near black `#07070a`, charcoal panels, subtle grid.
- Brand accent: dark pink `#ff4f8b`, with restrained green `#35d08a` for ready/export states.
- Typography: system sans for GitHub compatibility; monospaced file and telemetry labels.
- Motion: no frantic camera shakes. Cursor and zoom motion should be confident, eased, and readable.
- Texture: real app logo and existing product screenshot fragments may be used, but the core composition is custom built to fit GitHub.

## Story Arc

1. Brand seal, immediately.
2. `.likelysnap` package opens: screen, webcam, cursor, manifest.
3. Package becomes an editor timeline.
4. Cursor telemetry drives a smooth auto zoom moment.
5. Long recording promise resolves into native capture + FFmpeg export + GitHub CTA.

## Shot List

### Shot 01 · Brand Seal

Time: `0.0s - 1.1s`

Logo appears in a centered, rounded app tile. Wordmark and one-line promise enter below. The feel is quiet and precise, suitable for README top placement.

Text:

- `LikelySnap`
- `Long recordings. Smooth editing.`

### Shot 02 · Project Package

Time: `1.1s - 3.0s`

A `.likelysnap` package opens into four files. This is the product architecture moment: it tells the viewer the recording is a recoverable project, not one fragile blob.

Files:

- `screen.mp4`
- `webcam.mp4`
- `cursor.json`
- `manifest.json`

### Shot 03 · Editor Opens

Time: `3.0s - 5.2s`

The file package resolves into an editor surface: preview, side controls, timeline tracks. The timeline has zoom segments, webcam sidecar, cursor lane, and export state. This should read as a video editor, not a dashboard.

### Shot 04 · Cursor-Aware Auto Zoom

Time: `5.2s - 7.4s`

The cursor glides, the zoom frame follows a meaningful target, and the preview enlarges smoothly. The important claim is not "zoom exists"; it is that cursor telemetry and zoom editing are first-class.

Text:

- `Editable cursor`
- `Auto zoom`

### Shot 05 · Native + Disk + Export

Time: `7.4s - 8.9s`

Three short engineering chips land:

- `Native capture`
- `Disk-backed projects`
- `FFmpeg export`

The package and editor remain visible behind the chips to keep claims grounded in product context.

### Shot 06 · GitHub CTA

Time: `8.9s - 10.0s`

Return to the logo and final line. The CTA is for GitHub, so the tone is straightforward.

Text:

- `LikelySnap`
- `Open the repo. Try the build.`

## Audio Direction

Use a short tech BGM bed at low volume plus sparse UI SFX:

- logo reveal impact
- package file ticks
- editor snap
- cursor/zoom focus
- final brand stamp

Audio is optional for GitHub README playback, so the silent video must still work. SFX should enhance but never carry critical meaning.

## Anti-Slop Rules

- No purple-blue generic SaaS gradients.
- No fake AI dashboards.
- No fake metrics.
- No emoji icons.
- No random 3D blobs.
- No overlong copy.
- No jittery zoom movement.
- No player-style decorative progress bars inside the canvas.

## Production Checklist

- `index.html` is the source of truth.
- It supports `?t=<seconds>` freeze frames.
- It exposes `window.__seek(t)` for deterministic rendering.
- Keyframes should be captured at `0.4, 1.4, 2.6, 3.8, 5.8, 7.8, 9.5`.
- Exports should include MP4, GIF, and poster PNG.
