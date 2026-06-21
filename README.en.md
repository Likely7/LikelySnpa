![LikelySnap promo](./promo/github-15s/poster.png)

![LikelySnap promo animation](./promo/github-15s/LikelySnap-github-promo.gif)

English | [简体中文](./README.md)

## Installation

Ready-to-use builds are available on GitHub Releases. You do not need to download the source code or compile the app yourself.

[Download LikelySnap from Releases](https://github.com/Likely7/LikelySnpa/releases/latest)

### macOS

Download the macOS `.dmg`, open it, and drag `LikelySnap.app` into the `Applications` folder.

On first launch, macOS may ask for Screen Recording, System Audio, Microphone, and Camera permissions. Grant the requested permissions, then fully quit and reopen LikelySnap if macOS asks you to restart the app.

### Windows

Download the Windows portable `.zip`, extract it to a normal folder, and run `LikelySnap.exe`.

Do not run the app directly from inside the zip file. Extract the full folder first, because recording and export depend on the bundled runtime files next to the executable.

# LikelySnap

LikelySnap is based on OpenScreen 1.5.0, but it is not a skin. The recording storage flow, project package format, webcam path, and long-video export path have been rebuilt so long recordings are much less likely to disappear and can still be reopened, edited, and exported.

## Why This Project Exists

This project started from a very ordinary failure.

I downloaded the original OpenScreen, thought it looked clean and promising, and recorded a roughly 40 minute screen video.

Then I clicked stop.

The recording disappeared.

Not corrupted. Not hidden in a temp folder. Not partially recoverable. I searched the usual folders, checked for leftovers, and found nothing useful. Forty minutes of real recording time was gone as if it had never happened.

That was the moment LikelySnap became necessary.

I did not want another short-recording toy. I wanted a recorder that keeps real files on disk, stores a recording as a project, keeps webcam/audio/cursor data aligned, lets me continue editing later, and exports without gambling the whole result in memory.

So LikelySnap rebuilds the original project around that goal.

## The Biggest Change: Recording And Export Rebuilt First

The most important upgrade is not the name, the color, or a new button.

The real change is that recording storage and export now follow a more durable model. The editor itself has not yet been fully rewritten into a Premiere Pro, DaVinci Resolve, or Final Cut Pro style NLE architecture. It still builds on the original browser-based editor architecture, with reliability and usability improvements layered on top.

The original app was closer to a small utility: record something, stop, and let the app package everything at the end. That can work for short clips. It becomes fragile when recordings grow to dozens of minutes or hours.

LikelySnap treats every recording as a real project.

Professional editors such as Premiere Pro, DaVinci Resolve, Final Cut Pro, and CapCut do not survive long media because they magically load everything into memory. They manage media as project assets: files stay on disk, timelines read what they need, waveform and preview data can be cached, heavy work moves to background jobs, and export writes continuously to files.

LikelySnap is moving in that direction, but the current version is not a full NLE yet. Recording and export have moved toward a project-based, file-backed flow first. The editor still has old-architecture limits, so long projects can still take a while to open.

Instead of creating one loose video and calling it done, LikelySnap stores the screen recording, webcam sidecar, audio, cursor telemetry, and project metadata inside one `.likelysnap` project package. The package can be moved, reopened, and edited again.

Editor opening has had some load-reduction and caching work, but the architecture problem is not solved. A 30 minute to 1 hour project, or anything longer, can still make the app pause for a noticeable amount of time, especially on Windows. That should not be marketed as instant editing. The long-term direction is to move the editor toward a real NLE model with media indexing, proxies, layered caches, and background jobs.

Export follows the same idea. Long exports should not be assembled as one giant in-memory result. LikelySnap writes processed output to a temporary file and promotes it to the final MP4 only after the export succeeds.

That is the current core of LikelySnap: recording no longer depends on the last second, project assets are kept together, webcam recording is treated as a real sidecar, and export no longer bets the entire video on memory. The editor is improved, but it is not the final architecture yet.

## What Changed

In one sentence: OpenScreen is a good lightweight short-recording tool; LikelySnap is being rebuilt around long recording reliability, recovery, and continued editing.

### 1. Recording No Longer Bets Everything On Stop

LikelySnap writes the important recording files while the recording is still running.

Screen video, microphone audio, system audio, webcam video, cursor telemetry, and manifest data are treated as project assets instead of a pile of data that only becomes real after stop is clicked.

This does not mean users should force quit the app for fun, but it does mean the recording flow is designed around real files existing on disk during the session.

### 2. Every Recording Is A Project Package

LikelySnap saves each recording as a `.likelysnap` folder.

It usually looks like this:

```text
recording-xxxx.likelysnap/
  screen.mp4
  webcam.mp4
  cursor.json
  manifest.json
```

Normal users do not need to care about these internal files. The important part is that the screen recording, webcam video, cursor data, and project metadata live together.

Move the whole `.likelysnap` package, and the project should still open.

### 3. Long Video Opening Is Still A Current Limit

Long recordings are heavy, and the current editor still uses the original browser-based architecture.

LikelySnap can open and edit long recordings, but it does not guarantee instant interaction on large projects. A 30 minute to 1 hour recording, or a longer one, may still pause while the app reads video information, prepares timeline state, loads cursor data, and handles waveform or Auto Zoom related data.

The honest target today is: the project should remain recoverable and editable. The long-term target is a deeper NLE architecture with media indexes, proxies, background jobs, layered caches, and true on-demand loading.

### 4. Webcam, Audio, And Cursor Stay On The Same Timeline

LikelySnap stores screen video, webcam sidecar video, audio, and cursor telemetry as parts of the same project.

That matters because zoom effects, cursor editing, webcam placement, and export all need to agree on the same timeline. Long recordings expose small sync mistakes quickly, so this project treats those streams as first-class assets instead of afterthoughts.

### 5. Auto Zoom Is Not Just Blind Magnification

LikelySnap keeps Auto Zoom, but makes it more deliberate.

Auto-generated zoom regions are only a starting point. Each zoom can still be selected and adjusted manually. Users can decide whether a single zoom should stay fixed, smart-follow the mouse, or always follow the mouse.

### 6. Export No Longer Holds The Whole Video In Memory

Long exports should behave like a production process, not a gamble.

LikelySnap writes export output progressively to a temporary file. After the export completes successfully, that file becomes the final MP4.

This is much safer than building a huge result in memory and only saving at the end.

## How Auto Zoom Decides What To Capture

The hard part of Auto Zoom is not zooming in. The hard part is deciding when zooming in is actually helpful.

During tutorials and demos, many cursor actions should not create a zoom. Closing a window, clicking a random button, or moving past an area can be visual noise. A good zoom should usually mean: the user is explaining this area, or the user is intentionally doing something here.

LikelySnap now looks for intent across cursor behavior instead of blindly zooming at every mouse position.

It detects:

- Cursor dwell inside a small area, useful for explaining an article, UI panel, button, or input.
- Small natural hand movement inside that area, so the cursor does not need to be perfectly still.
- Long dwell on the same area, which creates a longer explanation zoom instead of a fixed short zoom.
- Mouse press or drag, useful for whiteboard drawing, highlighting, selecting, underlining, or drag demos.
- Repeated clicks and double clicks, which are more likely to represent an intentional operation than a single click.
- Nearby generated zooms, which are merged so the video does not zoom out and immediately zoom back in.

It avoids:

- Isolated single clicks, because they are often just normal UI operations.
- Click-and-leave actions, where the cursor quickly moves away after a click.
- Creating auto zooms on top of existing manually edited zoom regions.

### Compared With Original OpenScreen

Original OpenScreen is lighter and simpler. Its public product behavior is closer to "auto zoom follows the cursor while you work." That is direct and understandable, and it works well for short demos.

For longer recordings, that model can become noisy:

- If the cursor moves, the zoom may chase it.
- If the detector mainly looks at cursor location or dwell, it can confuse "I am explaining this" with "I clicked here once."
- Fixed short zooms can feel jumpy when someone speaks about the same area for much longer.

LikelySnap takes a more editor-like approach:

- It first asks whether the cursor action looks intentional enough to deserve a zoom.
- It ignores ordinary isolated clicks by default.
- It keeps long same-area explanations zoomed for longer.
- It merges very close zooms so the camera can hold one continuous moment.
- It gives every zoom its own follow mode: Off, Smart Follow Mouse, or Always Follow Mouse.
- Smart Follow tries to keep the view stable and only moves when the cursor approaches the safe edge of the zoomed view.

In short: original OpenScreen is closer to "zoom where the cursor is"; LikelySnap is closer to "decide whether this moment deserves a zoom, then choose how long and how stable it should be."

## What LikelySnap Can Do Today

LikelySnap currently focuses on:

- Recording tutorials, demos, courses, and product walkthroughs.
- Recording for dozens of minutes or longer.
- Capturing screen, microphone, system audio, and webcam.
- Editing cursor effects and zoom regions after recording.
- Cutting unwanted parts from a recording.
- Exporting MP4 or GIF.

Current features include:

- Screen and window recording.
- Microphone recording.
- System audio recording.
- Webcam recording.
- Cursor telemetry recording and editable cursor effects.
- Auto Zoom suggestions.
- Per-zoom Follow Mouse control.
- Long-video waveform caching.
- Trim, crop, speed, background, annotations, blur, and captions.
- MP4 and GIF export.
- macOS and Windows x64 support.

## Compared With OpenScreen

LikelySnap is based on OpenScreen 1.5.0.

OpenScreen has a strong idea: a clean screen recorder with quick editing and zoom effects. It is friendly for short recordings.

The issue I hit was long recording reliability. Long recordings need recoverability, project structure, timeline consistency, and export safety.

LikelySnap changes the direction:

- From short-recording first to long-recording first.
- From "package everything after stop" to "write important files during recording."
- From loose video output to a complete project package.
- Editor work is still a staged improvement on the original architecture; long-video opening remains a known limit, and the future direction is a deeper NLE architecture.
- From one-size Auto Zoom to editable per-zoom behavior.
- From memory-heavy export to file-backed export.
- From minimal settings to configurable recording folders, project folders, cache folders, quality, frame rate, resolution, and bitrate.

## Long Recording Notes

LikelySnap is designed to make long recordings safer, but long media is still heavy.

If you record 30 minutes, one hour, or more, the first project open may still need time to prepare data such as waveform peaks, video metadata, cursor preview, and Auto Zoom suggestions.

Depending on the machine and project size, that can take seconds or longer. The point is that the app should be preparing the project, not losing it.

## Current Limits

This project is still being refined:

- Very long recordings may still take noticeable time on first open. This is especially true for 30 minute to 1 hour projects and beyond, because the editor has not yet been fully moved to an NLE architecture.
- GIF export is not meant for long videos. Use MP4 for long exports.
- Windows support exists, but GPU drivers, hardware, and OS differences need more real-device testing.
- Multi-hour projects are much safer than the original flow, but still need more stress testing.

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
