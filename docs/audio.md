# Audio Page

The Audio page manages background music playback and the shared soundboard. It supports local audio files, YouTube videos and playlists, and Spotify content.

## Layout

| Panel | Contents |
|-------|----------|
| Left | Music queue and playback controls |
| Right | Soundboard |

---

## Music

### Adding music

**Local files** — Use the file picker to add audio files from your computer. Supported formats: MP3, WAV, OGG, M4A, AAC, FLAC, and any browser-playable audio format. Duration is read automatically after loading.

**URLs** — Paste a link into the URL input and click **Add** (or press Enter). Supported URL types:

| Source | Example URL |
|--------|-------------|
| YouTube video | `https://www.youtube.com/watch?v=...` |
| YouTube playlist | `https://www.youtube.com/playlist?list=...` |
| Spotify track | `https://open.spotify.com/track/...` |
| Spotify album | `https://open.spotify.com/album/...` |
| Spotify playlist | `https://open.spotify.com/playlist/...` |

> **Spotify note:** Spotify items show an amber *"Full playback requires a Spotify login"* warning with a direct link to accounts.spotify.com. Log into Spotify in this browser before playback to get full tracks; free accounts receive 30-second previews via the embed player.

> **YouTube playlists:** When a playlist starts playing, ECP expands it into individual track cards. Real titles are fetched in the background.

---

### Playback controls

| Control | Description |
|---------|-------------|
| **Autoplay** | Starts playback from the current position (or first non-skipped item). |
| **Pause** | Pauses the current track. |
| **Previous** | Jumps to the previous non-skipped item. For YouTube playlist items, navigates within the active playlist. |
| **Next** | Advances to the next non-skipped item. |
| **Loop mode** | **Off** — stop at end of queue. **Loop single** — repeat the current track indefinitely. **Loop all** — loop the entire queue. |
| **Shuffle** | Randomises the queue order in place. |
| **Play on finish** | When unchecked, playback stops after each track rather than advancing to the next. |
| **Audio crossfade** | Fades the current track out and the next track in over ~0.3 s. Not available for YouTube or Spotify sources. |
| **Music volume** | Channel volume, multiplied by the master volume on the Control Panel. |

---

### Queue items

Each item in the queue shows its title, duration (or source badge), and a row of action controls:

| Control | Description |
|---------|-------------|
| **Skip checkbox** | Marks the item to be skipped by autoplay and navigation. The item remains in the queue but appears dimmed. |
| **▶ Queue** | Queues this item to play *immediately after the currently playing track*, overriding sequential advance for one step. Click again to dequeue. |
| **✋ (Breakpoint)** | Marks this item as a breakpoint. **Autoplay silently stops before reaching a breakpoint item.** Manual navigation (clicking, Next, Previous) shows a confirmation dialog before proceeding. The item is highlighted with a red left border. |
| **↑ / ↓** | Moves the item up or down in the queue. |
| **🗑 (Delete)** | Removes the item from the queue. |

Click the item title row to immediately start playback.

---

### Stream source limitations

| Source | Crossfade | Volume control | Next/Prev |
|--------|-----------|---------------|-----------|
| Local audio | ✅ | ✅ | ✅ |
| YouTube | ❌ | ✅ | ✅ (uses YT playlist nav) |
| Spotify | ❌ | ❌ (embed limitation) | ⚠️ advances ECP queue, not Spotify playlist |

Controls affected by these limitations show amber or orange styling with a tooltip explaining the restriction.

---

## Soundboard

The soundboard is **shared with the Announce page** — sounds loaded here appear there too, and vice versa.

### Adding sounds

Use the file picker to load audio files. Same format support as the music queue.

### Controls

| Control | Description |
|---------|-------------|
| **Soundboard volume** | Master volume for all soundboard clips. Synced with the Announce page slider. |
| **⭐ (Star button)** | Stars the sound. Starred sounds appear in the **Starred Sounds** section at the bottom of the Music panel on the Control Panel for instant access during a show. |
| **✕ (Delete button)** | Removes the sound from the soundboard. |

Click any sound button to play it. Sound routes to the selected output device at soundboard volume × master volume.
