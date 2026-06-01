# Announce Page

The Announce page is the primary screen for making live or recorded announcements during an event. It combines intercom controls, a shared clock widget, a typed on-screen announcement tool, and the full soundboard — all accessible without leaving the page.

## Layout

| Column | Contents |
|--------|----------|
| Left | Intercom panel · Clock/Stopwatch/Timer · Typed Announcement |
| Right | Soundboard |

---

## Intercom

The intercom routes audio from a microphone to a speaker or audio output device.

### Modes

| Mode | Behaviour |
|------|-----------|
| **Live** | Microphone audio is passed through to the selected output device in real time. |
| **Recorded** | Audio is captured while the button is held active. When stopped, the recording is played back once through the output device. |

### Controls

| Control | Description |
|---------|-------------|
| **Vol** | Output volume of the intercom audio. |
| **Input** | Select the microphone source. Requires browser microphone permission (granted on first use). |
| **Output** | Select the speaker or audio interface to route intercom audio to. |
| **Pause music** | Pauses the music queue automatically when the intercom is active, and resumes it when stopped. |
| **Fade music** | Instead of hard-pausing, fades music out when the intercom starts and fades back in when it stops. |
| **Soundboard cue** | Choose a loaded soundboard sound to play automatically — at the start of a live announcement, or immediately before a recorded playback begins. Set to *None* to disable. |
| **Start/Stop Announcement** | Activates or deactivates the intercom. Label changes to **Start/Stop Recording** when in Recorded mode. |

> **Tip:** The Announce and Control Panel pages share all intercom settings. Changes made on either page are reflected immediately on the other.

---

## Clock / Stopwatch / Timer

A shared widget displaying one of three modes. The state is always in sync with the Control Panel clock widget.

### Switching modes

Click the **Clock**, **Stopwatch**, or **Timer** tab to switch.

### Clock

Displays the current local time, updated every second.

### Stopwatch

| Control | Description |
|---------|-------------|
| **Start / Pause** | Begins or pauses the stopwatch. |
| **Lap** | Records the current elapsed time as a lap entry. Only enabled while running. |
| **Reset** | Stops and resets the stopwatch; clears all laps. |

Lap times are listed below the display in chronological order.

### Timer

Set the countdown duration using the **Min** and **Sec** number inputs (editable while the timer is stopped). The display updates live as you type.

| Control | Description |
|---------|-------------|
| **Start / Pause** | Begins or pauses the countdown. |
| **Reset** | Stops and resets the timer to the configured duration. |

When the timer reaches zero, the clock panel pulses red as an alarm until reset.

---

## Typed Announcement

Sends a text overlay to the bottom of the [Display Window](../media.html). The overlay appears on top of whatever is currently being shown.

### Fields

| Field | Description |
|-------|-------------|
| **Text area** | The announcement message. Supports multi-line text. |
| **Text color** | Colour of the announcement text. Default: white. |
| **Background** | Fill colour of the announcement bar. Default: black. |
| **Opacity** | Transparency of the background (0% = fully transparent, 100% = solid). |
| **Linger (s)** | Seconds before the announcement auto-clears. Set to **0** to keep it on screen until manually cleared. |

### Buttons

| Button | Description |
|--------|-------------|
| **Show on Screen** | Sends the announcement to the Display Window. Opens the window if not already open. |
| **Clear** | Removes the announcement from the Display Window immediately. |

> **Note:** The Display Window must be open for announcements to appear. If it is not, clicking **Show on Screen** will open it first, which may cause a brief delay.

---

## Soundboard (right column)

The Announce page soundboard is **fully shared** with the Audio page soundboard — any sounds loaded on one page appear on both. Volume changes are synced across pages.

### Adding sounds

Click the file picker or drag audio files onto it. Supported formats: MP3, WAV, OGG, M4A, AAC, FLAC, and any other browser-playable audio format.

### Controls

| Control | Description |
|---------|-------------|
| **Soundboard volume** | Master volume for all soundboard playback. Synced with the Audio page slider. |
| **⭐ (Star)** | Marks a sound as starred. Starred sounds appear in the dedicated **Starred Sounds** section on the Control Panel for one-click access during a show. |
| **✕ (Delete)** | Removes the sound from the soundboard permanently (does not delete the file on disk). |

Click any sound button to play it immediately. Sounds play on the selected output device at the soundboard volume level.
