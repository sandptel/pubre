# Cognitive research: reading richer without overload (researched 2026-10-11)

This is a background agent's report, condensed. Verification legend: [V] confirmed this session · [M] from memory · [U] unverified.

## Key findings

**How comprehension works**
- Comprehension builds a *situation model* (Kintsch 1988 [M]). Readers index time, space, cause, protagonist and goals, and a break in any of these opens a new event (Zwaan 1995/98 [M]).
- Regressions are functional: blocking them hurts comprehension (Schotter, Tran & Rayner 2014 [V]). RSVP and speed reading trade comprehension for speed (Rayner et al. 2016 [V]).

**Cueing and highlighting**
- Signalling helps, especially retention (Schneider 2018; Alpizar 2020 d≈.38 [V]).
- Highlights supplied to the reader help (g≈.44). Self-highlighting gives g≈.20, and reviewing your highlights adds little (Ponce, Mayer & Méndez 2022 [V]).
- Over-cueing and seductive details hurt (g≈−.33, Sundararajan & Adesope 2020 [V]).

**Segmenting, glosses and distraction**
- Learner-paced segments help. Longer screens raise unintentional mind-wandering from 19% to 24% (Forrin 2021 [V]).
- Glosses help L2 vocabulary (Yanagisawa 2020 [V]), but embedded dictionaries have no effect or a negative one on *story* comprehension. Hotspots and games distract (Furenes 2021; Takacs 2015 [V]).
- Hyperlinks add load (DeStefano & LeFevre 2007 [V]). Interruptions hurt integration (Foroughi 2015 [V]). Distraction costs g≈−.64 in digital reading (Shen 2025 [V]).

**Screen versus paper**
- Screen inferiority is small (g≈−.21), larger under time pressure, and **not significant for narrative** (Delgado 2018 [V]).
- Readers are more overconfident on screens (Clinton 2019 [V]).
- **Scrolling is the main moderator.** Paged reading closes most of the gap (Clinton-Lisell & Litzinger 2025 [V]; Haverkamp 2022 [V]).
- Time pressure raises mind-wandering on screens (Delgado & Salmerón 2021 [V]). Writing keywords after a delay removed screen inferiority (Lauterman & Ackerman 2014 [V]).
- Readers mind-wander 20–40% of the time (D'Mello & Mills 2021 [V]).

**What helps retention and absorption**
- Retrieval practice beats restudy, best with a 1–6 day lag (Adesope 2017 [V]). Self-explanation gives g≈.55 (Bisra 2018 [V]).
- A reader that detected mind-wandering and prompted self-explanation plus a reread improved comprehension a week later (Mills 2021 [V]).
- Transportation (absorption in the story) rises with attention, imagery and identifiable characters (van Laer 2014 [V]).

**Typography and audio**
- Bionic reading shows a null effect (Snell 2024 [V]).
- Each reader's fastest font differs, with about 35% spread and no comprehension cost (Wallace 2022 [V]).
- Short lines help some dyslexic readers (Schneps 2013 [V]), and extra letter spacing helps dyslexic children (Zorzi 2012).
- Reading while listening gives g≈.18, only when externally paced (Clinton-Lisell 2023 [V]).

## Adopted in pubre (status as of 2026-10-11)

| Idea | Status |
|---|---|
| Contrast ramp: paragraph 80%, page 60%, read 45%, with a contrast floor | ✅ C2 |
| Glide is a ceiling, not a pacer: capped at 350 wpm, +250 ms at sentence ends, +600 ms at paragraph ends | ✅ C2 |
| Regression-friendly guide: double-tap, `(`, Shift+Space, never auto-advancing | ✅ C2 |
| Paged by default (no scroll mode) | ✅ (always) |
| Lens priority order and hard cap: Names > Hard words > Voices > Asides > Foreign | C3 |
| Hard-word density cap: ≤ 1 per sentence and about 2% of words per page, rarest first | C3 |
| Hard words in **Story** mode (dwell-only) vs **Learn** mode (shown, with a lookup log) | C3, with the default up to the user |
| Dwell-card hygiene: still pointer, never covers the current line, ≤ 2 lines, 200 ms fade | C3 |
| Character tints: 5–7 most frequent, stable hue, only characters present in the chapter | C3 |
| "Who's this?" card from already-read text only | C3 |
| Gentle overload/drift detector: ≥ 3 back-steps in a sentence, or dwell > 3× median, suggests clause focus; drift is a hard-word slowdown ratio < 1.1; at most 1 suggestion per 10 min; never judgmental | C3.5 |
| Calm capsule: time left as a range ("~10–15 min"), no countdowns | C4 |
| "Previously…" as retrieval first after more than 24 h away | C4 |
| Accessibility pack: short lines, letter spacing, line height 1.3–2.0 | C4 settings |
| Adjustable dwell (400–1000 ms) | C4 settings |
| Chapter-end "three words" on the capsule wedge | C5 |
| Question highlights resurface at chapter end as a self-explanation prompt | C5 |
| LATER: event-boundary breathers, constellation on demand, spaced Revisit prompts, pre-reading opener, depth stats, mood from your own Feeling highlights, find-my-font, read-along TTS, imagery nudge | backlog |

## Don'ts

- No RSVP mode, and nothing that blocks going back.
- No Bionic bolding.
- No continuous scroll as the default.
- No speed targets, countdowns, streaks or leaderboards.
- No auto-popping definitions, hotspots or mini-games.
- No dense or many-colour cueing.
- No notifications or achievement toasts while reading.
- Don't present re-reading highlights as studying.
- Don't push one "optimal" font.
- Don't claim text-to-speech improves comprehension.
- No spoilers in recaps, maps or mood.
- Never visibly judge the reader ("you seem distracted").
