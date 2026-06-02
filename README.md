# Event Control Panel

A browser-based AV control panel for live events. Manage music, display visuals on a second screen, run intercom announcements, and coordinate a full show from one interface.

Built by [MagmaLabs](https://magmalabs.dev/). Support the project on [Ko-fi](https://ko-fi.com/magmalabs).

---

## Getting Started

### 1. Start a local server

Open a terminal in the ECP folder and run one of:

```bash
python3 -m http.server 8000
```
```bash
npx serve .
```

### 2. Open ECP

```
http://localhost:8000
```

### 3. Open the Display Window

On the **Visuals** page, click **Open Display Window**. A second browser window opens — move it to your projector or secondary display and go fullscreen.

> **Microphone access:** The browser will ask for microphone permission the first time you use the Intercom. Grant it once; the browser remembers.

---

## Pages

| Page | Description |
|------|-------------|
| [Announce](docs/announce.md) | Intercom, clock/timer, typed on-screen announcements, soundboard |
| [Audio](docs/audio.md) | Music queue, YouTube/Spotify playback, soundboard |
| [Control Panel](docs/control-panel.md) | Show-runner overview: session management, intercom, clock, music mini, visuals mini |
| [Visuals](docs/visuals.md) | Image/video/PDF/PPTX display, web embeds, presenter mirror, slide notes |
| [Settings](docs/settings.md) | Appearance: light/dark mode, high contrast, icon navigation, realistic buttons |

---

## Key Features

### Session files (`.ecp`)

Export and import the entire app state — music queue, soundboard, media queue, volumes, settings, and notes — as a `.ecp` file. All media is embedded, making files self-contained and portable. Import presets from the **Control Panel** and switch between them during a show.

### Breakpoints

Any music or media queue item can be marked as a **breakpoint** (✋ button). Autoplay silently stops before reaching a breakpoint. Manual navigation (click, Next, Previous) shows a confirmation prompt. Use breakpoints to divide a show into acts and prevent accidental runaway autoplay.

### Queue Next

Each queue item has a **▶ Queue** button. Click it to designate that item as "play next" — it will be shown immediately after the current item finishes, bypassing normal sequential advance for one step.

### Starred Sounds

Star any soundboard sound (⭐ button) to pin it to the **Starred Sounds** section on the Control Panel for one-click access during a show.

### Sync

The Announce page and Control Panel share intercom settings and the clock widget — changes on one are reflected on the other in real time.

---

## Supported Media

| Type | Formats |
|------|---------|
| Audio files | MP3, WAV, OGG, M4A, AAC, FLAC |
| Audio streams | YouTube video/playlist, Spotify track/album/playlist |
| Images | JPEG, PNG, GIF, WebP, BMP, SVG (local file or direct URL) |
| Video | MP4, WebM, MOV |
| PDF | Local file or URL — each page becomes a separate queue item |
| PowerPoint | `.pptx` — each slide becomes a separate queue item |
| YouTube | Video embed in Display Window |
| Google Drive | File preview (must be publicly shared) |
| Google Slides | Presentation embed (must be published to the web) |
