# 0009 — One reading pad; hold to read, tap to stay

**Date:** 2026-10-11 · **Status:** accepted

## Context
The user wants the guide to start with one click, a hold interaction that returns to the page on
release, speed control while holding ("slow down, move behind"), and something that feels refined on
phones. The old dock button + a separate pointer pad overlapped the menu and duplicated each other.

## Decision
- **One control, both guide styles:** the round reading pad lives in the thumb corner. With the
  controls up it slides into the bottom bar, left of the menu (never floating over text); during
  the Stage it stays above it.
- **Tap vs hold** (pad, Space, or press-and-hold on the page text):
  - tap → start and keep going; tap again → pause/play; double-tap → back a sentence;
  - hold → read only while held; release → set back down (mid-lift: the lift plays backwards).
- **Shuttle while holding:** right → faster (to 2.5×), left → slower → still → backwards (rate −2…2.5,
  dead zone ±14 px); up ≈ 64 px → lock (stays after release). A pill shows the rate; haptic ticks on
  Android when crossing into still/backwards. The Stage rescales the current unit's timer so a rate
  change applies mid-sentence (progress-preserving `setRate`).
- **Hold on the page text** starts the Stage from the held word (paginator `holdHook`, 380 ms, before
  the system long-press at ~500 ms; selection and the context menu are suppressed during the hold).
  Setting "Hold the page to read" (off → holding selects text for highlighting, as before).
- **Quick speed:** a chip by the pad (phones: while reading) → presets Slow 180 · Calm 220 · Steady 260 ·
  Brisk 300 · Fast 340, ±10, slider 120–350.
- **Pin:** a pin top-right keeps the controls; the paginator reserves top/bottom room (`setReserve(bottom, top)`).

## Consequences
- On touch, the definition card comes from a tap on a marked word, not from hover (Android sends
  emulated mouse moves for a held finger).
- Phones lose long-press selection while "Hold the page to read" is on; highlighting stays available
  with it off (and in a later iteration from inside the Stage).
