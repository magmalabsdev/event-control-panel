# One-Minute ECP Promo Video — Script, Shot List & Motion Graphics

## Context

The user wants a 60-second promotional video for **Event Control Panel** (ecp.magmalabs.dev) covering every major feature advertised on the landing page (`index.html`): single-panel control, supported media + Display Window, Announce page, music & soundboard, breakpoints, exportable `.ecp` sessions, and free & open source — ending with the app icon, ECP wordmark, and Magma Labs banner. Division of labor: the user records the in-app demo clips; I script the video and build the motion graphics. Decisions made: **music + on-screen text (no VO)**, **16:9 / 1920×1080**, **motion graphics delivered as self-contained HTML animation pages the user screen-records**.

Brand facts gathered in exploration: dark theme default (`#101010` bg, panels `#161616`), signature purple `#7055e5`, six module hues (blue `#3b82f6`, green `#22c55e`, red `#ef4444`, orange `#f97316`, white, yellow `#eab308`), fonts Saira / Saira Condensed / Space Mono. Brand assets in repo: `app/ecp-logo.png` (rainbow app icon), `app/ecp-banner.png` (wordmark), `app/by-magmalabs.png` (pinwheel "By Magma Labs"). Landing taglines to reuse: "Run the whole show from one screen", "One free tool instead of four paid ones", "No accounts. No server. Just open it."

## The 60-second beat sheet

| Time | Source | Content | On-screen text |
|---|---|---|---|
| 0:00–0:07 | **MG-1** | **Refreshed landing hero animation with light tunnel**: the six module cards (Audio, Visuals, Intercom, Soundboard, Timer, Notes) pop at hexagon vertices in their brand hues, then each is sucked into the purple core — each absorption leaving a colored light streak; the streaks multiply into a full warp-style light tunnel converging on the core, which swells and bursts into the ECP logo | "Audio. Visuals. Intercom." → "One control panel." |
| 0:07–0:13 | **Clip A** | Control Panel tab cockpit sweep | "Run the whole show from one screen" |
| 0:13–0:20 | **Clip B** | Visuals: drop in PPTX/PDF/video, Display Window opens on second screen, mirror + presenter notes | "Images · Video · PDF · PPTX · Web" |
| 0:20–0:27 | **Clip C** | Audio: queue mixing local + YouTube + Spotify, crossfade, soundboard pads, starred sounds | "One queue: local files, YouTube, Spotify — plus a soundboard" |
| 0:27–0:33 | **Clip D** | Announce: type message → appears on display; live mic with auto music ducking; shared timer | "Announce to the big screen · auto music ducking" |
| 0:33–0:39 | **Clip E** | Breakpoint stops autoplay before a reveal slide; new **Replace this slide** control; Freeze/Hide | "Breakpoints protect the big reveal" |
| 0:39–0:45 | **Clip F** | Export all → `show-night.ecp` → reopen, everything restored | "Your whole show in one portable .ecp file" |
| 0:45–0:52 | **MG-2** | "One free tool instead of four paid ones" + GitHub / open-source badges | "Free & open source · No accounts. No server. Just open it." |
| 0:52–1:00 | **MG-3** | End card: rainbow app icon pops in → ECP banner wordmark → "By Magma Labs" pinwheel banner → URL + CTAs | "ecp.magmalabs.dev · Download App · Try in Web" |

All 7 landing-page feature cards are covered (beats 2–8), ending per request with icon → logo → Magma Labs banner.

## Deliverables (files I will create in the repo, so they're version-controlled for production later)

1. **`promo/SCRIPT.md`** — the full production document (this plan, expanded into final form, committed to the repo rather than left only in the local plan file):
   - Beat sheet above, expanded with per-shot pacing notes and cut points
   - **Clip recording list (Clips A–F)**: for each, the exact tab, step-by-step actions to perform on camera, target duration (record ~2× for trim room), and prep notes (build a realistic demo session with named queue items like "Opening Theme", "Welcome speech ✋BP", "Doors open in 5 minutes"; dark theme; 1920×1080 or 2× retina; 60fps; clean UI)
   - Caption text for every beat (user adds these as simple text overlays in their editor, styled per included font/color spec)
   - Edit notes: transition style, music cue suggestions, where to speed-ramp

2. **Motion graphics — self-contained HTML pages** in `promo/motion/`, each 1920×1080, brand palette/fonts, plays on keypress (so recording is easy), with a small hidden timing readout for sync:
   - `mg1-opening-hook.html` (~7s) — refreshed landing hero: rebuilds the existing hexagon pop → suck → core → logo sequence (`index.html:1049-1086`, module positions/colors at `index.html:138-143`) at cinematic 1080p pacing, and adds a **light tunnel**: absorbed cards leave colored light trails in the six module hues that build into radial warp streaks rushing toward the purple core, climaxing as the core bursts into the ECP logo
   - `mg2-open-source.html` (~7s) — comparison/open-source card
   - `mg3-end-card.html` (~8s) — app icon → ECP wordmark → Magma Labs banner → URL, using `app/ecp-logo.png`, `app/ecp-banner.png`, `app/by-magmalabs.png` via relative paths
   - Optional `mg4-captions.html` — all beat captions as lower-thirds on chroma-key green, if the user prefers keyed overlays over editor text

The `promo/` folder is new; nothing in the existing app or site code is modified. All deliverables are written directly into the repo at `promo/` (script, motion graphics, and this plan) so the whole promo package is in one committed place for production later — not left in the local `~/.claude/plans` file only.

## Verification

- Open each `promo/motion/*.html` in a browser at 1080p, play with keypress, confirm animation durations match the beat sheet (built-in timing readout).
- Confirm MG-3 loads the three PNG brand assets correctly via relative paths.
- Sanity-check the beat sheet sums to 60s and every landing-page feature card maps to a beat.
