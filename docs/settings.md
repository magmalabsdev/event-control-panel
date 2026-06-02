# Settings Page

The Settings page controls the visual appearance of ECP. All settings are saved automatically and restored every time the page is opened.

---

## GitHub Repository

A banner at the top of the page links to the [Event Control Panel GitHub repository](https://github.com/MagmaSpeedCubes/event-control-panel). Click it to open the repo in a new tab.

---

## Appearance

### Light Mode

Switches between the default **dark** theme and a **light** theme. Dark mode is suited for dim backstage environments; light mode works better in brightly lit rooms.

The logo and branding panel on the Control Panel always stays dark regardless of this setting.

---

### High Contrast

Inverts button colours relative to the background, making interactive controls more visually distinct from panels.

| Theme | Button appearance |
|-------|-------------------|
| Dark + High Contrast | Light buttons on dark panels |
| Light + High Contrast | Dark buttons on light panels |

Active buttons (green for playing, red for paused, amber for frozen) are exempt — their status colours are always preserved.

The logo and branding panel is exempt from High Contrast.

---

### Icon Navigation

When enabled, all **action buttons** (play, pause, next, previous, shuffle, etc.) replace their text labels with icons from [Font Awesome Free](https://fontawesome.com/search?ic=free-collection).

- Icons follow all theme changes: light/dark, high contrast, active states.
- The navigation tabs (**Announce**, **Audio**, etc.) are **not** affected — they always show text.
- Utility buttons (up/down/delete in queues, soundboard star/delete, breakpoint, queue-next) always show icons regardless of this setting.

---

### Realistic Buttons

Expands all action buttons into a taller aviation-panel style with LED bar indicators above the label.

| LED state | Meaning |
|-----------|---------|
| Dark green (unlit) | Idle |
| Bright green with glow | Playing / active / running |
| Amber with glow | Paused |

Button colour stays constant regardless of Light Mode or High Contrast — the LED bars communicate state instead.

Compatible with Icon Navigation: the LED bars appear above the icon.

---

## Feedback

A feedback form at the bottom of the page can be used to submit bug reports or feature requests.
