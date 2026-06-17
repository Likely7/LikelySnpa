# LikelySnap Handoff

This folder contains the working handoff for the macOS-first LikelySnap改造.

Read in this order:

1. `AGENTS.md`
2. `CURRENT_GOAL.md`
3. `PROJECT_STATUS.md`
4. `PROJECT_OVERVIEW.md`
5. `RECORDING_PACKAGE_PLAN.md`
6. `AUDIO_VIDEO_SYNC_INVESTIGATION.md`
7. `REMAINING_ISSUES_AND_TODOS.md`
8. `PROJECT_PROGRESS.md`

The central direction is final-product repair, not temporary workaround:

- recording directory must be user selectable;
- long recordings must continuously write to disk;
- new recordings should become a single `.likelysnap` package while keeping internal files streamable;
- media must be recoverable after crashes;
- macOS audio/video sync must be measurable and fixed;
- cursor telemetry must remain aligned so zoom features do not regress.
