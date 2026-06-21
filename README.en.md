![LikelySnap promo animation](./promo/github-15s/LikelySnap-github-promo.gif)

![LikelySnap promo](./promo/github-15s/poster.png)

English | [简体中文](./README.md)

# LikelySnap

A screen recorder and lightweight editor built for long recordings. LikelySnap is based on OpenScreen 1.5.0, but the recording storage, project package, webcam sync, cursor zoom, and MP4 export paths have been rebuilt for more durable long-form recording.

## Features

- Record screens or windows with microphone, system audio, and webcam.
- Continuously write recording files to disk instead of depending on the final stop action.
- Save each recording as a `.likelysnap` project package that can be moved, reopened, and recovered.
- Store cursor telemetry for editable cursor effects, Auto Zoom, and Follow Mouse zooms.
- Generate Auto Zoom suggestions from interaction intent instead of zooming every ordinary click.
- Edit trims, crop, speed, background, annotations, blur, captions, webcam layout, and zoom regions.
- Export MP4 through an FFmpeg-backed streaming file path designed for longer videos.
- Support macOS and Windows x64.

## Installation

Ready-to-use builds are available on GitHub Releases. You do not need to download the source code or compile the app yourself.

[Download LikelySnap from Releases](https://github.com/Likely7/LikelySnpa/releases/latest)

### macOS

1. Download the macOS `.dmg` installer.
2. Open the `.dmg` and drag `LikelySnap.app` into the `Applications` folder.
3. On first launch, grant Screen Recording, System Audio, Microphone, and Camera permissions when prompted.
4. If macOS asks you to restart the app, fully quit LikelySnap and open it again.

### Windows

1. Download the Windows portable `.zip`.
2. Extract the full zip to a normal folder.
3. Run `LikelySnap.exe` from the extracted folder.

Do not run the app directly from inside the zip file. Recording and export depend on bundled runtime files next to the executable.

## Best For

- Tutorials, courses, product demos, and software walkthroughs.
- Recordings that last dozens of minutes or longer.
- Capturing screen, webcam, microphone, and system audio together.
- Adjusting cursor effects, zoom regions, captions, and trims after recording.
- Exporting publishable MP4 videos or short GIF clips.

## Basic Workflow

1. Open LikelySnap.
2. Choose recording folder, quality, frame rate, microphone, system audio, webcam, and other defaults in settings.
3. Select a screen, window, or region and start recording.
4. Stop recording; LikelySnap opens the generated `.likelysnap` project package.
5. Edit trims, zooms, cursor effects, webcam layout, captions, and other details.
6. Export MP4 or GIF.

## How It Differs From OpenScreen

LikelySnap is not just a reskin. It is based on OpenScreen 1.5.0, but the product direction has shifted from a short-recording utility to a long-recording project workflow.

Main changes:

- From final stop-time packaging to continuous disk writing during recording.
- From loose video output to a `.likelysnap` project package.
- From renderer WebM webcam recording as the main path to native webcam sidecars.
- From final in-memory MP4 blobs to FFmpeg-backed temp-file MP4 export.
- From simple cursor dwell zooms to intent-aware Auto Zoom suggestions.
- From minimal settings to a standalone settings window for recording folder, project folder, cache folder, quality, frame rate, bitrate, and default recording toggles.

## Auto Zoom

Auto Zoom is not meant to blindly chase the cursor. It tries to decide whether the user is actually explaining or demonstrating something at that position.

It prioritizes:

- Cursor dwell inside a small explanation area.
- Small natural cursor movement that stays inside the same area.
- Long dwell on the same area.
- Mouse press, drag, selection, drawing, and underlining actions.
- Repeated clicks and double clicks.
- Nearby zoom suggestions that should be merged instead of jumping in and out.

It tries to avoid:

- Isolated single clicks.
- Click-and-leave actions where the cursor quickly moves away.
- Creating automatic zooms on top of manually edited zoom regions.

Each zoom region can be set to Off, Smart Follow Mouse, or Always Follow Mouse.

## Long Recording Notes

LikelySnap is designed to make long recordings safer, but long media is still heavy.

The current version has rebuilt the recording storage, project package, webcam sidecar, and MP4 export paths. The editor also has staged loading and caching improvements, but it is not yet a full Premiere Pro, DaVinci Resolve, or Final Cut Pro style NLE architecture.

If you record 30 minutes, one hour, or more, the first project open may still need time to prepare video metadata, waveform peaks, cursor preview data, and Auto Zoom suggestions. The goal is that the recording files are already safely on disk and the project can still be reopened, edited, and exported.

Current limits:

- Very long recordings may still take noticeable time on first open.
- GIF export is not meant for long videos; use MP4 for long exports.
- Windows behavior can vary across GPUs, drivers, and OS environments, so more real-device testing is still needed.
- Multi-hour projects are safer than the original flow, but still need more stress testing.

## Why This Project Exists

This project started from a simple failure: I recorded roughly 40 minutes with the original OpenScreen, clicked stop, and the file disappeared.

It was not corrupted or hidden in a recoverable temp folder. It was simply gone. That experience pushed LikelySnap toward a different foundation.

The goal is not a new name, color, or logo. The goal is to rebuild the failure-prone parts of long recording: keep files on disk during recording, store each session as a recoverable project, keep webcam/audio/cursor timing aligned, and export without holding the entire result in memory.

The editor will continue moving toward a fuller NLE-style architecture with media indexes, proxy files, background jobs, layered caches, and faster long-project opening.

## Development

Install dependencies:

```bash
npm install
```

Start development:

```bash
npm run dev
```

Run type checking:

```bash
npx tsc --noEmit
```

## License

MIT License. See [LICENSE](./LICENSE).
