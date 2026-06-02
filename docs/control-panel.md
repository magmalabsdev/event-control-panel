# Control Panel Page

The Control Panel is the primary operating screen during a show. It provides a dense, no-scroll overview of all active systems in one place: branding, session management, intercom, clock, music mini-controls, and visuals mini-controls.

## Layout

The page is divided into two rows.

### Top row (fixed height)

| Panel | Contents |
|-------|----------|
| Logo & Banners | ECP branding, MagmaLabs link, Ko-fi link |
| Session / Intercom | Preset management and intercom controls |
| Clock | Stopwatch / Timer / Clock widget |

### Bottom row (fills remaining height)

| Panel | Contents |
|-------|----------|
| Music | Now-playing, playback controls, starred sounds |
| Visuals | Current media, mirror thumbnail, slide notes |
| Blank | Master volume, session notes, status |

---

## Logo & Banners

Click the **Event Control Panel** banner to reload the app. Links to [MagmaLabs](https://magmalabs.dev/) and [Ko-fi](https://ko-fi.com/magmalabs) open in new tabs.

This panel is always displayed in dark mode regardless of the active theme — its colour never changes.

A small **version tag** appears below the byline showing the current deployment version (e.g. `v26.6.3` = third release in June 2026). Useful when reporting issues.

---

## Session

Presets store the complete app state: music queue, soundboard, media queue, all settings, and notes. They are saved as `.ecp` files (JSON).

| Control | Description |
|---------|-------------|
| **Loaded preset** | Dropdown of all currently imported presets. Select one to apply it immediately. |
| **Export preset** | Saves the active preset (or the current session if none is loaded) to a `.ecp` file. All audio and image data is embedded as base64 data URIs so the file is self-contained. |
| **Export all** | Exports all loaded presets as a single `.zip` archive. |
| **Import preset(s)** | Load one or more `.ecp` or `.json` files. Multiple files can be selected at once. The first imported preset is applied immediately; subsequent ones are added to the dropdown for later selection. |

> **File size warning:** Exporting a session with many large audio or image files can produce very large `.ecp` files since all media is embedded. For live events, consider loading files fresh each session rather than serialising large assets.

---

## Intercom

A condensed version of the intercom controls from the [Announce page](announce.md). All settings are **bidirectionally synced** — changes here are immediately reflected on the Announce page and vice versa.

See [Announce → Intercom](announce.md#intercom) for full documentation of each control.

---

## Clock / Stopwatch / Timer

Same widget as the Announce page, fully synced. Clicking tabs or operating controls on either page updates both simultaneously.

See [Announce → Clock / Stopwatch / Timer](announce.md#clock--stopwatch--timer) for full documentation.

---

## Music (mini panel)

A compact version of the Audio page music controls for use during a show without switching pages.

| Control | Description |
|---------|-------------|
| **Now playing** | Title of the currently playing track. |
| **Progression** | Current position / total duration (`0:00 / 3:45`). |
| **Autoplay** | Start playback. |
| **Next / Previous** | Navigate the queue. |
| **Pause** | Pause playback. |
| **Vol** | Music volume slider. Synced with the Audio page. |
| **Play on finish** | When unchecked, stop after each track. Synced with Audio page. |
| **Crossfade** | Enable crossfade transitions. Synced with Audio page. |

### Starred Sounds

If any soundboard sounds are starred (via the ⭐ button in the Audio or Announce pages), they appear here as compact play buttons for quick one-click access without switching pages.

---

## Visuals (mini panel)

A compact view of the current visual media for use during a show.

| Control | Description |
|---------|-------------|
| **Current media** | Name of the currently displayed item. |
| **Mirror thumbnail** | A live miniature preview of what the Display Window is showing. Displays the image or video name for non-image types. |
| **Previous / Next** | Navigate the media queue. |
| **Freeze** | Locks the Display Window to the current content. Any navigation (Next, Previous, clicking items) updates the mirror and queue locally, but nothing is sent to the Display Window until Freeze is toggled off. On release, the most recent item is sent automatically. Button turns amber and relabels **Unfreeze** while active. |
| **Hide** | Blacks out the Display Window with a full-screen overlay. New content continues to load behind the overlay so it is ready the instant Hide is released. Button turns dark and relabels **Show** while active. If the Display Window is reopened while hidden, the blackout is restored automatically. |
| **Fade** | Enable fade transitions. Synced with Visuals page. |
| **Notes** | Shows the per-item notes for the currently selected item. Editable and synced with the Visuals page. |

---

## Blank panel (right)

| Control | Description |
|---------|-------------|
| **Status** | Shows a live summary: music play state and queue sizes. Also displays export/import progress messages. |
| **Master volume** | Global volume multiplier applied to music and soundboard. Does not affect intercom or system audio. |
| **Session notes** | Free-text notepad for the operator. Saved with `.ecp` exports. |
