# Settings Page

The Settings page controls visual appearance and links to project resources. All appearance settings are persisted in `localStorage` and restored on every page load.

---

## GitHub Repository

A banner at the top of the page links to the [Event Control Panel GitHub repository](https://github.com/MagmaSpeedCubes/event-control-panel). Click it to open the repo in a new tab.

---

## Appearance

### Light Mode

Switches between the default dark theme and a light theme.

- **Off (default)**: Dark background (`#101010`), light text. Suited for dim environments such as event backstage areas.
- **On**: Light background (`#f0f2f5`), dark text. Suited for well-lit environments.

The logo and branding panel on the Control Panel always renders in dark mode regardless of this setting.

---

### High Contrast

Inverts button colours relative to the background, making interactive controls more visually distinct from panels.

| Theme + High Contrast | Button background | Button text |
|-----------------------|------------------|-------------|
| Dark + HC | Light grey (`#d8d8dc`) | Dark (`#111`) |
| Light + HC | Dark charcoal (`#1e1e22`) | Light (`#eee`) |

Active buttons (green/red for play/pause/announcement states) are exempt — their indicator colours are preserved.

The logo and branding panel is exempt from High Contrast.

---

### Icon Navigation

When enabled, all **action buttons** (play, pause, next, previous, shuffle, etc.) replace their text labels with Font Awesome SVG icons from the [free collection](https://fontawesome.com/search?ic=free-collection).

- Icons respond to all theme changes: light/dark, high contrast, active states.
- The navigation tabs (**Announce**, **Audio**, etc.) are **not** affected — they always show text.
- Utility buttons (up/down/delete in queues, soundboard star/delete, breakpoint, queue-next) always show icons regardless of this setting.

---

### Realistic Buttons

Expands all action buttons into a taller aviation-panel style with LED bar indicators above the label.

| State | LED colour |
|-------|-----------|
| Idle / inactive | Dark green (unlit) |
| Playing / active / running | Bright green with glow |
| Paused | Amber with glow |

Button body colour is always dark charcoal (`#25272b`) regardless of Light Mode or High Contrast — the LEDs communicate state instead of background colour changes.

Compatible with Icon Navigation mode: the LED bars appear above the icon.

---

## Feedback

A Fillout embed form at the bottom of the page is available for submitting feedback, bug reports, or feature requests directly within ECP.
