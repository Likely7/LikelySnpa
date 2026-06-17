# LikelySnap

LikelySnap is a desktop screen recorder and editor for macOS and Windows.

## What it does

- Records a screen or window
- Captures microphone, system audio, and webcam
- Supports zooms, cursor effects, annotations, trim, crop, and speed changes
- Saves recordings as portable `.likelysnap` packages

## Install

Download a release from the [LikelySnap releases page](https://github.com/Likely7/LikelySnpa/releases).

## Build

```bash
npm install
npm run build
```

## Windows portable build

```bash
npm run build:win:portable
```

## Notes

- Project settings, cache location, and recording defaults are persistent.
- Native recording is used on macOS and Windows when available.
- Large webcam sidecars are handled separately from the main screen video.
