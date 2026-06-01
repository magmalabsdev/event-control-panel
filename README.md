# Event Control Panel

A browser-based, self-contained AV control panel for live events. Manage music playback, display visuals on a second screen, run intercom announcements, and coordinate a full show from a single interface — no installation, no server, no dependencies beyond a web browser.

Built by [MagmaLabs](https://magmalabs.dev/). Support the project on [Ko-fi](https://ko-fi.com/magmalabs).

---

## Getting Started

ECP is a static web app. It requires a local HTTP server because browser microphone access and some features require a secure context (`localhost` or `https`).

### 1. Start a local server

```bash
# Python 3
python3 -m http.server 8000

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8000
```

### 2. Open ECP

```
http://localhost:8000
```

### 3. Open the Display Window

On the **Visuals** page, click **Open Display Window**. A second browser window opens (`media.html`) — move it to your projector or secondary display and go fullscreen.

---

## Pages

| Page | Description |
|------|-------------|
| [Announce](docs/announce.md) | Intercom, clock/timer, typed on-screen announcements, soundboard |
| [Audio](docs/audio.md) | Music queue, YouTube/Spotify playback, soundboard |
| [Control Panel](docs/control-panel.md) | Dense show-runner overview: session management, intercom, clock, music mini, visuals mini |
| [Visuals](docs/visuals.md) | Image/video/PDF/PPTX display, web embeds, presenter mirror, slide notes |
| [Settings](docs/settings.md) | Appearance: light/dark mode, high contrast, icon navigation, realistic buttons |

---

## Key Features

### Session files (`.ecp`)

Export and import the entire app state — music queue, soundboard, media queue, volumes, settings, and notes — as a `.ecp` file (JSON). All media is embedded as base64, making files self-contained and portable. Import presets from the **Control Panel** and switch between them during a show.

### Breakpoints

Any music or media queue item can be marked as a **breakpoint** (✋ button). Autoplay silently stops before reaching a breakpoint. Manual navigation (click, Next, Previous) shows a confirmation prompt. Use breakpoints to divide a show into acts and prevent accidental runaway autoplay.

### Queue Next

Each queue item has a **▶ Queue** button. Click it to designate that item as "play next" — it will be shown immediately after the current item finishes, bypassing normal sequential advance for one step.

### Starred Sounds

Star any soundboard sound (⭐ button) to pin it to the **Starred Sounds** section on the Control Panel. Reach your most-used cues instantly without switching pages.

### Sync

The Announce page and Control Panel share intercom settings and the clock widget — changes on one are reflected on the other in real time.

---

## Supported Media

| Type | Source |
|------|--------|
| Audio | MP3, WAV, OGG, M4A, AAC, FLAC (local file) |
| Audio stream | YouTube video/playlist, Spotify track/album/playlist |
| Image | JPEG, PNG, GIF, WebP, BMP, SVG (local file or direct URL) |
| Video | MP4, WebM, MOV (local file) |
| PDF | Local file or remote URL — converted to page images in-browser |
| PowerPoint | `.pptx` local file or remote URL — rendered to slide images in-browser |
| YouTube | Video embed in Display Window |
| Google Drive | File preview embed in Display Window (must be publicly shared) |
| Google Slides | Presentation embed (must be published to the web) |

---

## Technical Notes

- **No build step.** Pure HTML, CSS, and vanilla JavaScript. No npm, no bundler.
- **No backend.** All processing (PDF rendering, PPTX conversion, session serialisation) runs entirely in the browser using PDF.js and JSZip.
- **GitHub Pages compatible.** Deployed as a static site. Page fragments are loaded via `fetch()` on startup, which requires HTTP — opening `index.html` directly via `file://` will not work.
- **Microphone access** requires a secure context (`localhost` or `https`). Granting permission once is sufficient; the browser remembers it.
- **CORS**: Fetching remote PDFs and PPTX files depends on the source server allowing cross-origin requests. Most CDN-hosted files work; institutional or private servers may block the request.
- **Icons** are Font Awesome 6 Free Solid SVGs, stored locally in `icons/`. No external CDN requests for icons.

---

## File Structure

```
index.html          Shell — loads page fragments and app.js
app.js              All application logic
style.css           All styles
media.html          The audience Display Window
pages/
  announce.html     Announce page fragment
  audio.html        Audio page fragment
  control.html      Control Panel page fragment
  visuals.html      Visuals page fragment
  settings.html     Settings page fragment
icons/              Font Awesome 6 Free Solid SVG icons
docs/
  announce.md       Announce page documentation
  audio.md          Audio page documentation
  control-panel.md  Control Panel documentation
  visuals.md        Visuals page documentation
  settings.md       Settings page documentation
```
