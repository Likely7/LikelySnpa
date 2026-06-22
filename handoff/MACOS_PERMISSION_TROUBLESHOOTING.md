# macOS Permission Troubleshooting

This document records the 2026-06 packaged-app permission incident so future agents do not rediscover it from scratch.

## Incident Summary

User-visible symptom:

- The dev app could record normally.
- The installed DMG app kept showing the macOS screen-recording permission prompt.
- System Settings already showed LikelySnap as allowed for Screen & System Audio Recording.
- The app still refused to enter region/window selection after reinstall attempts.
- The machine also had multiple stale LikelySnap/OpenScreen-looking entries in macOS privacy/app caches, making it unclear which bundle identity macOS was granting.

Final user validation:

- After the packaged-app screen-access probe fix and a full local cleanup of old app installs, userData, TCC entries, and LaunchServices registrations, the freshly installed DMG worked.
- The user confirmed: "我已经测试过了，现在OK了。"

## Root Cause Model

There were two separate problems that looked like one permission bug.

1. Packaged-app preflight could trust the wrong signal.

   The app previously leaned on `systemPreferences.getMediaAccessStatus("screen")`. In packaged Electron builds this status can be stale or less authoritative than a real capture probe. A packaged app may say permission is missing even when macOS has granted usable capture access.

   Durable code fix:

   - Commit: `afcd85c fix: trust mac screen capture probe for packaged app`
   - Added `electron/ipc/screenAccess.ts`.
   - Screen-access resolution now treats a successful `desktopCapturer.getSources({ types: ["screen", "window"] })` probe as authoritative.
   - If the probe succeeds, the app considers screen access granted even if the media-access status API is stale.

2. The user's macOS installation state was polluted by old bundle identities.

   The machine had older LikelySnap/OpenScreen app installs and stale LaunchServices/TCC records, including old `com.siddharthvaddem.openscreen` and `com.likelysnap.app` registrations from `/Applications`, mounted DMGs under `/Volumes`, and historical app data.

   macOS privacy UI can cache entries. A visible checked toggle in System Settings does not always prove the currently launched `.app` bundle is the same identity receiving that grant.

## Current App Identity

Current packaged identity:

- App name: `LikelySnap`
- Bundle id: `com.likelysnap.app`
- Current package version: `1.1.0`
- Expected install path for manual testing: `/Applications/LikelySnap.app`

Do not test permissions by launching from:

- A mounted DMG under `/Volumes/...`
- An old `/Applications/OpenScreen.app` or `/Applications/Openscreen.app`
- A dev Electron process when validating the packaged DMG

Dev and packaged builds are different macOS permission identities. A dev build working does not prove the packaged app's TCC identity is clean.

## Product-Level First-Launch Reset Policy

LikelySnap is currently distributed from GitHub without paid Developer ID signing. Packaged macOS builds are ad-hoc signed, so macOS can treat a new download/update as a different code-signing requirement even when the bundle id remains `com.likelysnap.app`. In practice this can leave System Settings showing an allowed toggle while the freshly installed app still cannot use ScreenCaptureKit.

Current durable product behavior:

- Packaged macOS builds run a minimal TCC reset once per app version on first launch.
- The reset targets only LikelySnap/OpenScreen privacy grants for `ScreenCapture`, `Microphone`, `Camera`, and `Accessibility`.
- The reset does not delete recordings, project files, app settings, cache directories, or user media.
- The reset is guarded by `macos-permission-reset.json` under Electron `userData`, so the same installed version does not clear permissions on every launch.
- Installing a later version can reset once again, intentionally forcing a clean re-authorization for ad-hoc GitHub builds.

Implementation:

- `electron/macosPermissionReset.ts`
- `electron/main.ts` calls `runMacosFirstLaunchPermissionReset(...)` before requesting microphone permission.

Do not move this reset after `askForMediaAccess("microphone")`; the point is to clear stale grants before macOS creates new permission state for the current app bundle.

## Fast Diagnosis Checklist

When the installed macOS app says screen-recording permission is missing even after the user enabled it:

1. Confirm the app being launched:

   ```bash
   mdls -name kMDItemCFBundleIdentifier /Applications/LikelySnap.app
   /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' /Applications/LikelySnap.app/Contents/Info.plist
   ```

   Expected bundle id: `com.likelysnap.app`.

2. Confirm the code has the packaged-app probe fix:

   ```bash
   git log --oneline -5
   sed -n '1,160p' electron/ipc/screenAccess.ts
   rg -n "resolveScreenAccessResult|desktopCapturer.getSources|getMediaAccessStatus\\(\"screen\"\\)" electron/ipc
   ```

   Expected: commit `afcd85c` or later exists, and screen-access checking resolves a real `desktopCapturer.getSources` success as granted.

3. Quit the app and System Settings before changing privacy state:

   ```bash
   osascript -e 'quit app "LikelySnap"' 2>/dev/null || true
   osascript -e 'quit app "System Settings"' 2>/dev/null || true
   pkill -x LikelySnap 2>/dev/null || true
   ```

4. Check for stale installed app copies:

   ```bash
   find /Applications "$HOME/Applications" -maxdepth 2 \
     \( -name 'LikelySnap.app' -o -name 'OpenScreen.app' -o -name 'Openscreen.app' \) \
     -print 2>/dev/null | sort
   ```

5. Check user TCC records:

   ```bash
   sqlite3 "$HOME/Library/Application Support/com.apple.TCC/TCC.db" \
   "select service,client,client_type,auth_value,last_modified from access where lower(client) like '%likelysnap%' or lower(client) like '%openscreen%' order by service, client;" 2>/dev/null || true
   ```

6. Check LaunchServices registrations:

   ```bash
   /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -dump 2>/dev/null \
     | egrep -i 'likelysnap|openscreen|com\.likelysnap|com\.siddharthvaddem\.openscreen' \
     | sed -n '1,240p'
   ```

Stale `/Volumes/...` records can remain visible for a while even after the actual DMG volume is gone. If installed apps, user data, and TCC are clean but LaunchServices still prints old volume records, reboot once before reinstalling.

## Full Local Reset Procedure

Use this only for a development/test machine where the user wants to clear the local app state completely.

Important:

- This removes app settings/caches/preferences.
- This does not delete source code or recordings unless the commands are expanded manually.
- Do not delete `~/Movies/LikelySnap` unless the user explicitly asks to remove recordings.

```bash
# Quit app/UI processes first.
osascript -e 'quit app "LikelySnap"' 2>/dev/null || true
osascript -e 'quit app "OpenScreen"' 2>/dev/null || true
osascript -e 'quit app "System Settings"' 2>/dev/null || true
pkill -x LikelySnap 2>/dev/null || true
pkill -x OpenScreen 2>/dev/null || true
pkill -x Openscreen 2>/dev/null || true

# Remove installed app copies.
rm -rf \
  "/Applications/LikelySnap.app" \
  "/Applications/OpenScreen.app" \
  "/Applications/Openscreen.app" \
  "$HOME/Applications/LikelySnap.app" \
  "$HOME/Applications/OpenScreen.app" \
  "$HOME/Applications/Openscreen.app"

# Remove app user state, preferences, caches, logs, and saved state.
rm -rf \
  "$HOME/Library/Application Support/likelysnap" \
  "$HOME/Library/Application Support/openscreen" \
  "$HOME/Library/Caches/com.likelysnap.app" \
  "$HOME/Library/Caches/com.siddharthvaddem.openscreen" \
  "$HOME/Library/Logs/LikelySnap" \
  "$HOME/Library/Logs/OpenScreen" \
  "$HOME/Library/Saved Application State/com.likelysnap.app.savedState" \
  "$HOME/Library/Saved Application State/com.siddharthvaddem.openscreen.savedState" \
  "$HOME/Library/Preferences/com.likelysnap.app.plist" \
  "$HOME/Library/Preferences/com.siddharthvaddem.openscreen.plist"

defaults delete com.likelysnap.app 2>/dev/null || true
defaults delete com.siddharthvaddem.openscreen 2>/dev/null || true
killall cfprefsd 2>/dev/null || true

# Reset relevant privacy grants for both current and historical bundle ids.
for service in ScreenCapture Microphone Camera Accessibility; do
  for bundle in \
    com.likelysnap.app \
    com.likelysnap.app.helper \
    com.likelysnap.app.helper.Renderer \
    com.siddharthvaddem.openscreen \
    com.siddharthvaddem.openscreen.helper \
    com.siddharthvaddem.openscreen.helper.Renderer; do
    tccutil reset "$service" "$bundle" 2>/dev/null || true
  done
done

# Rebuild LaunchServices registrations.
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
"$LSREGISTER" -u "/Applications/LikelySnap.app" 2>/dev/null || true
"$LSREGISTER" -u "/Applications/OpenScreen.app" 2>/dev/null || true
"$LSREGISTER" -u "/Applications/Openscreen.app" 2>/dev/null || true
"$LSREGISTER" -kill -r -domain local -domain system -domain user

# Restart cache/UI helpers.
killall sharedfilelistd lsd Finder Dock 2>/dev/null || true
```

If System Settings still shows old entries after this, reboot macOS before reinstalling. This is not a LikelySnap code workaround; it clears stale OS caches that can outlive app deletion.

## Clean Reinstall Validation

After cleanup:

1. Mount the latest DMG.
2. Drag `LikelySnap.app` to `/Applications`.
3. Eject the DMG.
4. Launch only `/Applications/LikelySnap.app`.
5. Grant Screen & System Audio Recording, Microphone, and Camera as prompted.
6. Fully quit and reopen LikelySnap after granting permissions if macOS asks for it.
7. Run a short recording with region/window selection, webcam, mic, system audio, and editable cursor.
8. Confirm the resulting `.likelysnap` package opens and exports.

Expected successful behavior:

- The app no longer loops on the screen-recording permission prompt.
- Region/window selection opens.
- The dev app and packaged app may still have separate permissions, but the packaged app works under `com.likelysnap.app`.

## Do Not Regress

- Do not remove the real `desktopCapturer.getSources` permission probe.
- Do not rely only on `systemPreferences.getMediaAccessStatus("screen")` for packaged app gating.
- Do not tell the user to reinstall repeatedly without checking bundle identity, TCC, and LaunchServices.
- Do not delete recordings while cleaning app install state unless the user explicitly asks.
