# Event Control Panel — v26.6.7

**Release date:** 2026-06-04
**Type:** First desktop application release

Event Control Panel (ECP) is now available as a standalone desktop app for **macOS, Windows, and
Linux**. Previously ECP ran only as a local web page served over `http://localhost`; this release
packages the full app — with native microphone access, a second display window, and `.ecp` file
association — into installable desktop builds that work offline.

---

## Highlights

- 🖥️ **Native desktop apps** for macOS (Intel + Apple Silicon), Windows, and Linux.
- 📂 **`.ecp` file association** — double-click a preset file in your file explorer to open it
  directly in ECP, and set ECP as the default handler for `.ecp` files.
- 📡 **Low-latency live intercom** — the announcement passthrough now runs through the Web Audio
  graph instead of a buffered media element, removing the noticeable delay on live mic audio.
- 🌐 **Works fully offline** — the PPTX (JSZip) and PDF (PDF.js) engines are bundled in the app, so
  presentation/PDF import no longer depends on a CDN.
- 🎛️ **Everything from the web app** — music queues, YouTube/Spotify playback, soundboard, second-
  screen visuals (images/video/PDF/PPTX/embeds), intercom, clock/timer, and `.ecp` sessions.

---

## Downloads

| Platform | File | Notes |
|----------|------|-------|
| **macOS (Apple Silicon)** | `Event Control Panel-26.6.7-arm64.dmg` | Recommended for M1/M2/M3/M4 Macs |
| macOS (Apple Silicon) | `Event Control Panel-26.6.7-arm64-mac.zip` | Zip alternative to the DMG |
| **macOS (Intel)** | `Event Control Panel-26.6.7.dmg` | For Intel Macs |
| macOS (Intel) | `Event Control Panel-26.6.7-mac.zip` | Zip alternative to the DMG |
| **Windows (x64)** | `Event Control Panel Setup 26.6.7.exe` | Installer — registers `.ecp` as default |
| Windows (x64) | `Event Control Panel-26.6.7-win.zip` | Portable; unzip and run the `.exe` |
| **Linux (x64)** | `Event Control Panel-26.6.7.AppImage` | Portable; `chmod +x` then run |

> macOS ships as **two per-architecture builds** rather than one universal binary (this is required
> for the unsigned-build microphone fix described below). Pick the one matching your Mac.

---

## Installation

### macOS
1. Open the `.dmg` and **drag the app into `/Applications`** (recommended — see *Microphone access*
   below for why this matters).
2. The app is **ad-hoc signed but not notarized**, so on first launch macOS Gatekeeper will warn it
   "cannot be opened." Right-click the app → **Open** → **Open**, or run once:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Event Control Panel.app"
   ```

### Windows
- **Installer (recommended):** run `Event Control Panel Setup 26.6.7.exe`. This installs the app and
  registers it as the default handler for `.ecp` files. The installer is unsigned, so SmartScreen
  may show "Windows protected your PC" — click **More info → Run anyway**.
- **Portable:** unzip `Event Control Panel-26.6.7-win.zip` and run `Event Control Panel.exe`. The
  portable build does not auto-register file associations.

### Linux
```bash
chmod +x "Event Control Panel-26.6.7.AppImage"
./"Event Control Panel-26.6.7.AppImage"
```
For `.ecp` association, integrate the AppImage with your desktop (e.g. via AppImageLauncher).

---

## `.ecp` session files

`.ecp` files capture the entire app state — music queue, soundboard, media queue, volumes, settings,
and notes — with all media embedded, making them self-contained and portable.

**New in the desktop app:** double-clicking a `.ecp` file in your file explorer launches ECP (or
focuses the already-running window) and loads that preset immediately. You can also set ECP as the
**default app** for `.ecp` files:

- **Windows** — automatic when installed via the installer.
- **macOS** — move the app to `/Applications` and launch it once so LaunchServices registers it; if
  another app claims `.ecp`, set it via Finder → Get Info → **Open with → Change All**.
- **Linux** — handled by AppImage desktop integration.

You can still export/import `.ecp` files from inside the app on the **Control Panel** page.

---

## Feature overview

| Page | What it does |
|------|--------------|
| **Announce** | Intercom, clock/timer, typed on-screen announcements, soundboard |
| **Audio** | Music queue, YouTube/Spotify playback, soundboard |
| **Control Panel** | Show-runner overview: session/preset management, intercom, clock, music & visuals minis |
| **Visuals** | Image/video/PDF/PPTX display, web embeds, presenter mirror, slide notes |
| **Settings** | Appearance: light/dark, high contrast, icon navigation, realistic buttons |

Plus: **Breakpoints** (✋ stop autoplay before an item), **Queue Next** (▶ play-next override),
**Starred Sounds** (⭐ pin to Control Panel), and real-time **Sync** between the Announce page and
Control Panel.

### Supported media
- **Audio files:** MP3, WAV, OGG, M4A, AAC, FLAC
- **Audio streams:** YouTube (video/playlist), Spotify (track/album/playlist)
- **Images:** JPEG, PNG, GIF, WebP, BMP, SVG
- **Video:** MP4, WebM, MOV
- **Documents:** PDF and PowerPoint `.pptx` (each page/slide becomes a queue item)
- **Embeds:** YouTube, Google Drive (public), Google Slides (published to web)

> Streaming and embed features (YouTube, Spotify, Google Drive/Slides) require an internet
> connection. Local audio/video, images, PDF, and PPTX work fully offline.

---

## System requirements

- **macOS:** 10.15 Catalina or newer (separate Intel / Apple Silicon builds).
- **Windows:** Windows 10 or 11, 64-bit.
- **Linux:** a modern x86-64 distribution with AppImage support.

---

## Important notes & known issues

### Microphone access (macOS)
macOS ties microphone permission to an app's code signature. These builds are **ad-hoc signed** (not
Developer-ID signed) specifically so the permission can persist — without it, macOS would re-prompt
for the microphone on every launch. For this to stick, the app must run from a **stable location**:

- **Move the app to `/Applications`** (a Finder drag clears macOS "app translocation"), or clear the
  quarantine flag with the `xattr` command above. Running directly from a downloaded `.zip` in
  Downloads can cause the mic prompt to reappear.
- Prefer the **DMG** for distribution — its drag-to-Applications flow avoids this automatically.

Windows and Linux are unaffected (no per-launch microphone prompt).

### Unsigned / not notarized
All builds are currently **unsigned** (macOS uses an ad-hoc signature; Windows/Linux are unsigned).
Expect Gatekeeper / SmartScreen warnings on first launch — see *Installation* for how to proceed.
Code-signed and notarized builds are planned once certificates are available.

### No auto-update
The desktop apps **do not self-update**. The version is fixed (`v26.6.7`); install newer releases
manually as they are published.

---

## Technical details

- Built on **Electron 33** (Chromium + Node) via electron-builder.
- macOS builds are ad-hoc code-signed with the hardened runtime and an `audio-input` entitlement.
- Windows installer is **NSIS**; the portable Windows and Linux builds are single-file (ZIP /
  AppImage).
- Bundled offline libraries: **JSZip 3.10.1** (PPTX) and **PDF.js** (PDF rendering).

---

## License

Event Control Panel is released under the **GNU General Public License v3.0** (see [LICENSE](LICENSE)).

Built by [MagmaLabs](https://magmalabs.dev/) · Support on [Ko-fi](https://ko-fi.com/magmalabs) ·
[Source on GitHub](https://github.com/MagmaSpeedCubes/event-control-panel)
