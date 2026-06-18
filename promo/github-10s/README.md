# LikelySnap GitHub Promo

This folder contains the source and exports for the 10 second GitHub README / release promo.

## Files

- `director-notes.md` - creative and motion brief.
- `index.html` - reproducible animation source.
- `keyframes/` - verification stills.
- `LikelySnap-github-promo.mp4` - final MP4 export.
- `LikelySnap-github-promo.gif` - README-friendly GIF.
- `poster.png` - static poster frame.

## Re-export

From the repository root:

```bash
node scripts/render-promo-video.mjs
```

The script captures keyframes, renders MP4 with Playwright + FFmpeg, derives the GIF, and writes the poster frame.

When the local `huashu-design` skill assets are present, the MP4 also gets a subtle BGM and sparse UI SFX track. If those assets are missing, the script still exports a silent MP4 and GIF.
