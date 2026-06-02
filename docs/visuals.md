# Visuals Page

The Visuals page manages everything shown on the audience display: images, videos, PDFs, PowerPoint slides, and web embeds. It includes a full-featured presenter view with a mirror display, slide notes, and preview cards for adjacent items.

## Layout

| Panel | Contents |
|-------|----------|
| Left | Media queue, playback controls, file/URL input |
| Right | Presenter view — mirror display, preview cards, presenter notes |

---

## Display Window

Click **Open Display Window** to open a separate browser window (`media.html`) that shows the currently selected media full-screen. Position this window on a projector or secondary display.

- The Display Window remembers its position between sessions.
- If closed, ECP reopens it automatically the next time you show a media item.
- The Display Window operates independently — it does not require ECP to be visible.

### Freeze and Hide

Two toggle buttons sit alongside **Open Display Window** (and are also available in the Visuals mini-panel on the Control Panel):

| Button | Active state | Behaviour |
|--------|-------------|-----------|
| **Freeze** | Amber — labelled **Unfreeze** | Locks the Display Window to whatever is currently shown. Subsequent navigation updates the local mirror and queue, but nothing is sent to the Display Window. On release, the most recently selected item is sent immediately. |
| **Hide** | Near-black — labelled **Show** | Covers the Display Window with a solid black overlay. New content continues loading behind it. Releasing Hide reveals the latest loaded content instantly. If the Display Window is closed and reopened while Hide is active, the blackout is automatically restored. |

> **Tip:** Use Freeze to hold a slide while preparing the next cue without the audience seeing you navigate. Use Hide for a full blackout between segments.

---

## Adding media

### Local files

Use the file picker or drag files onto it. Supported formats:

| Type | Formats |
|------|---------|
| Images | JPEG, PNG, GIF, WebP, BMP, SVG, and any browser-renderable image |
| Video | MP4, WebM, MOV, and any browser-playable video format |
| PDF | Each page becomes a separate queue item |
| PowerPoint | Each slide becomes a separate queue item |

### URLs

Paste a link into the URL input and click **Add** (or press Enter).

| Source | Behaviour | Warning |
|--------|-----------|---------|
| YouTube video | Embedded via YouTube's iframe player | ⚠️ Amber — mirror not in sync; autoplay may be blocked |
| Google Drive file | Embedded via Drive preview iframe | ⚠️ Amber — file must be publicly shared |
| Google Slides | Embedded via Slides embed URL | 🔴 Red — must be published to the web; slide timing and navigation are controlled by Google, not ECP |
| Direct image URL (`.jpg`, `.png`, `.gif`, `.webp`, `.svg`, `.avif`, `.tiff`) | Loaded as a normal image item | ⚠️ Amber — displayed from external URL; will break if source goes offline |
| Remote PDF (`.pdf`) | Fetched and converted to pages | ⚠️ The file must be publicly accessible; some servers will block the request |
| Remote PPTX (`.pptx`) | Fetched and rendered to slides | ⚠️ The file must be publicly accessible; some servers will block the request |

> **Mirror sync warning:** YouTube, Google Drive, and Google Slides items render inside iframes. ECP cannot control or synchronise the mirror display for these — the mirror shows the iframe content but the Display Window must be controlled manually. A red warning banner appears on the Presenter mirror when an embed is active.

---

## Playback controls

| Control | Description |
|---------|-------------|
| **Autoplay** | Starts automatic sequential playback through the queue. |
| **Pause** | Stops automatic advance. The current item remains on screen. |
| **Previous** | Shows the previous non-skipped item. |
| **Next** | Advances to the next non-skipped item. |
| **Loop mode** | **Off** — stop at end of queue. **Loop single** — repeat current item indefinitely. **Loop all** — loop the entire queue. |
| **Transition (s)** | How long each image or slide is shown before ECP automatically advances. Does not apply to video or embed items (those advance on video end, or not at all for embeds). |
| **Fade transition** | Fades the mirror display and Display Window between items. |
| **Mute video audio** | Mutes the audio track on video items when sent to the Display Window. |

---

## Queue items

Each item shows its name, type badge, and action row. Click the item to display it immediately.

| Control | Description |
|---------|-------------|
| **Skip checkbox** | Excludes the item from autoplay and navigation. Item remains visible but dimmed. |
| **▶ Queue** | Queues this item to show immediately after the current item finishes, overriding sequential advance for one step. Click again to dequeue. |
| **✋ (Breakpoint)** | Marks this item as a stop point. **Autoplay halts before a breakpoint item.** Manual navigation (click, Next, Previous, preview cards) shows a confirmation dialog before proceeding. The item is highlighted with a red left border. |
| **↑ / ↓** | Reorders the item in the queue. |
| **🗑 (Delete)** | Removes the item from the queue. |

### Source badges

| Badge | Colour | Meaning |
|-------|--------|---------|
| YouTube | Red | YouTube embed |
| Google Drive | Blue | Google Drive iframe |
| Google Slides | Blue | Google Slides embed |
| Web Image | Blue | External image URL |

---

## Per-item notes

Select any item to enable its notes field in the **Selected slide notes** textarea. Notes are free text, saved per item, and included in `.ecp` exports. They are also mirrored to the Control Panel's notes field.

---

## Presenter panel

### Mirror Display

Shows a live thumbnail of the currently displayed item:
- **Images**: rendered directly.
- **Video**: shows the video name (a full video preview is not shown to avoid double-playback).
- **Web embeds**: shows the embed iframe. A red banner appears with a warning that the mirror is not in sync with the Display Window.

### Preview cards

Two buttons below the mirror show thumbnails of the **Previous** and **Next** items in the queue relative to what is currently shown. Click either card to navigate to that item (breakpoint confirmation applies).

### Presenter notes

A separate free-text textarea independent of per-item notes. Use it for speaker cues, run-of-show notes, or any other information the operator needs during the presentation. Not saved in `.ecp` exports.
