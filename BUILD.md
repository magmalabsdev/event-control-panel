# Building the desktop apps

The Event Control Panel web app is wrapped with [Electron](https://www.electronjs.org/) and
packaged with [electron-builder](https://www.electron.build/).

## Prerequisites

```bash
npm install
```

## Develop / run locally

```bash
npm start
```

## Build installers / archives

| Command | Output (in `dist/`) |
| --- | --- |
| `ADHOC_SIGN=1 npm run dist:mac -- --x64 --arm64` | per-arch `…-<ver>.dmg`/`…-mac.zip` (Intel) + `…-arm64.dmg`/`…-arm64-mac.zip` (Apple Silicon) |
| `npm run dist:win -- --x64` | `Event Control Panel Setup <ver>.exe` (NSIS installer — registers `.ecp` as default) + `…-win.zip` (portable) |
| `npm run dist:linux -- --x64` | `Event Control Panel-<ver>.AppImage` (portable; `chmod +x` and run) |

> **macOS is built per-architecture, not universal.** Unsigned builds are **ad-hoc code-signed**
> (see "Microphone permission" below), and a universal binary cannot be ad-hoc signed without
> breaking the `@electron/universal` merge. Two small per-arch artifacts replace one large universal
> one. With a real Developer ID (`CSC_LINK` set, `ADHOC_SIGN` unset) you can build `--universal`.

Windows produces an **NSIS installer** (registers the app as the default `.ecp` handler) plus a
**portable ZIP**; Linux is a **portable AppImage**. All build natively on macOS — electron-builder
bundles its own `makensis`, so no system Wine/Docker is needed.

### `.ecp` file association

Double-clicking a `.ecp` preset in the file explorer launches the app (or focuses the running one)
and loads that preset. The association is declared via `build.fileAssociations` and registered by the
OS: macOS from the app bundle (move to `/Applications` and launch once), Windows by the NSIS
installer, Linux by AppImage desktop integration. The Windows/macOS icon is built from
`build/icon.ico` (regenerate with `node scripts/make-ico.js` if the logo changes).

## Versioning

Two schemes, kept deliberately separate:

- **Web app** (served from `main` via GitHub Pages) shows a **dynamic** version, `YY.M.<commit count>`,
  derived at runtime from the repo's commit history (see `initVersionTag` in [app/app.js](app/app.js)).
  Every push that redeploys the site bumps the number automatically — nothing to edit by hand.
- **Desktop builds** carry a **static** version, the build date as `YY.M.D`, stamped at build time.
  The `dist:*` scripts pass it to electron-builder via
  `-c.extraMetadata.version=$(node scripts/build-version.js)`, so each packaged artifact records
  *when it was built*. The apps don't self-update, so the number stays fixed for that build. The
  packaged app reads it back through `app.getVersion()` over the preload bridge to show in its
  version tag. (The `version` field in `package.json` is only the `npm start` dev fallback — builds
  override it.)

The landing page download links and version note track the **latest GitHub release** automatically,
so publishing a new release surfaces the new build without editing `index.html`.

The finished, user-facing artifacts are collected in the git-ignored **`releases/`** folder.

## Microphone permission (macOS)

macOS binds a microphone (TCC) grant to the app's **code signature**. An unsigned bundle has no
stable identity and no `com.apple.security.device.audio-input` entitlement, so macOS re-prompts on
**every launch** after you click Allow. To fix this for unsigned builds, [build/after-pack.js](build/after-pack.js)
**ad-hoc signs** the app (`codesign --sign -`) with the hardened runtime and
[build/entitlements.mac.plist](build/entitlements.mac.plist) (which includes `audio-input`). This is
gated by the `ADHOC_SIGN=1` env var, so a real Developer ID build is never overwritten.

For a `.zip`-distributed app there is one more macOS quirk — **app translocation**: a quarantined app
launched from Downloads runs from a randomized read-only path, which also defeats the saved grant.
End users should therefore **move the app to `/Applications`** (a Finder drag clears translocation),
or clear quarantine once: `xattr -dr com.apple.quarantine "/path/Event Control Panel.app"`.

Windows and Linux are unaffected: Windows mic access is a global Settings toggle (no per-launch
prompt) and Linux (PulseAudio/PipeWire) has no per-app prompt.

## Code signing

Builds are **unsigned** unless the following credentials are present in the environment. When they
are set, electron-builder signs (and, for macOS, notarizes) automatically.

Fill the credentials into the git-ignored **`.env`** file (a template is committed-as-ignored at the
repo root), then load it before building:

```bash
set -a; source .env; set +a
npm run dist
```

### macOS (Developer ID + notarization)

- A *Developer ID Application* certificate in the login keychain
  (or set `CSC_LINK` to a `.p12` file and `CSC_KEY_PASSWORD` to its password).
- Notarization credentials:

```bash
export APPLE_ID=""
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID=""
npm run dist:mac
```

Verify: `spctl -a -vv "/Applications/Event Control Panel.app"` → `accepted` / `source=Notarized`.

### Windows (Authenticode)

electron-builder's bundled signing tool can sign the Windows `.exe` from macOS using a `.pfx`:

```bash
export WIN_CSC_LINK="/path/to/cert.pfx"
export WIN_CSC_KEY_PASSWORD="your-pfx-password"
npm run dist:win -- --x64
```

## Offline behavior

The app is fully offline-capable for its core features: JSZip (`vendor/jszip.min.js`) and PDF.js
(`vendor/pdfjs/`) are bundled locally rather than loaded from a CDN. Online *features* (YouTube /
Spotify / Google Slides embeds and their APIs) still require a connection by nature.
