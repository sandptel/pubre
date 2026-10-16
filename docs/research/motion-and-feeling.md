# Motion and feeling: what animation does to a reader, researched 2026-10-16

Design context for any pubre motion work: page turns, the reading pointer, ink-in text, chapter openers, popovers and highlights. This file builds on `instructions/product-design.md` §4 and §7, and on `research/cognitive-reading.md` (cueing and distraction).

Evidence legend: **[V]** checked this session against the primary source, its abstract, or the official spec page. **[S]** secondary summary of a real paper (the full text was not read). **[M]** from memory, not re-checked. **[F]** folklore: a widely repeated claim that is weak, distorted or unsupported.

## TL;DR

- **Onsets steal attention; steady motion steals less.** A thing that *starts* moving, appears suddenly, or *grows toward you* captures attention involuntarily. Steady motion, receding motion and fades capture much less. Near the line being read, each start, stop, appearance or swell is a small interruption. [V]
- **Speed and acceleration mean arousal.** Across moving dots, arms, robots and kinetic type, faster motion and harder acceleration read as more energetic or excited, and slow, regular motion reads as calm or sad. Valence (pleasant or unpleasant) is carried more weakly, by curvature, regularity, direction and transparency. [V/S]
- **Durations are bounded.** About 100 ms feels instant. UI transitions belong in 150–400 ms. 500 ms starts to drag. The more often a motion repeats, the shorter and quieter it must be. Enter slower than exit, and scale duration with distance. [V]
- **Animation beside text measurably costs reading.** Animated ads near text cause more and longer fixations and more regressions, and flashing *text* interferes with word recognition. Readers then keep comprehension only by working harder. [V]
- **Comprehension needs look-back and a sense of place.** Blocking regressions hurts understanding. Scrolling or moving text hurts inference. E-readers weaken the reader's sense of where an event happened. Page-turn motion should build a stable spatial map. No controlled study shows that a skeuomorphic page curl is more immersive than a slide. [V]
- **Vestibular safety matters.** Scaling, zooming, spinning, parallax, multi-axis or multi-speed motion, large-area peripheral movement and depth effects (blur, depth of field) cause discomfort. Under reduced motion, keep the meaning but swap the motion for a dissolve, a highlight fade or a colour shift. [V]

## 1. Easing and timing

**Thresholds**
- Response-time limits: **0.1 s** feels instantaneous, **1 s** keeps the user's flow of thought, and **10 s** keeps their attention. These come from Miller 1968 and Card et al. 1991, popularised by Nielsen. [M] <https://www.nngroup.com/articles/response-times-3-important-limits/>
- Doherty threshold: Doherty & Thadani (IBM, 1982) argued that productivity rises sharply when system response drops below about **400 ms**, against the older 2 s norm. [S] <https://lawsofux.com/doherty-threshold/>. The claim that it makes apps "addicting" comes from later retellings and does not appear in the report. [F]
- NN/g animation durations: **100–500 ms** overall, and most should be 100–400 ms. Simple feedback takes about **100 ms**. Substantial changes such as a modal take **200–300 ms**. Large moves across big screens take up to **400 ms**. At **500 ms** an animation "feels like a real drag". Entering takes slightly longer than exiting (a 300 ms enter against a 200–250 ms exit). Frequently seen animations must be shorter and subtler, and teams usually err too long. [V] <https://www.nngroup.com/articles/animation-duration/>

**Design-system tokens (verified values)**
- **IBM Carbon** durations:
  - fast-01 **70 ms** (micro-interactions)
  - fast-02 **110 ms** (fades)
  - moderate-01 **150 ms**
  - moderate-02 **240 ms** (toasts, expansion)
  - slow-01 **400 ms** (large expansion)
  - slow-02 **700 ms** (background dimming)

  Duration grows with distance travelled or size changed. Productive motion is "subtle and out of the way", and expressive motion is "enthusiastic, vibrant", kept for "occasional, important moments". Entrance curves decelerate. Exit curves accelerate, "implying that its departure from the screen is permanent". [V] <https://carbondesignsystem.com/elements/motion/overview/>
- **Material 3** durations run in 50 ms steps from short1 (50 ms) to long4 (600 ms), then extra-long tokens up to 1000 ms. Its curves:
  - standard `cubic-bezier(.2,0,0,1)`
  - emphasized-decelerate `(.05,.7,.1,1)`, for entering
  - emphasized-accelerate `(.3,0,.8,.15)`, for exiting

  [V] (Flutter's generated M3 tokens) <https://flutter.googlesource.com/mirrors/flutter/+/HEAD/packages/flutter/lib/src/material/motion.dart>
- **Apple HIG** asks for "quick, precise animations" and says to hold back on motion for frequent interactions. Its springs take two inputs, duration and bounce. WWDC23 examples use bounce **0, 0.15 ("small") and 0.2** at 0.5–0.6 s, with presets named smooth, snappy and bouncy. [V] <https://developer.apple.com/videos/play/wwdc2023/10158/>

**What curves feel like**
- *Slow-in/slow-out* (ease-in-out) is a Disney principle carried into UI by Chang & Ungar (UIST '93), alongside anticipation and follow-through. [V] <https://courses.ischool.berkeley.edu/i247/s08/readings/Chang_AnimationInUI_UIST93.pdf>
- Dragicevic et al. (CHI 2011) found that slow-in/slow-out beat constant-speed, fast-in/fast-out and adaptive timing for **tracking objects**. The authors attribute this to predictability. Ease-in-out is therefore the evidence-backed choice when the eye must follow something. [V] <https://cs.au.dk/~elm/pdf/timedistort.pdf>
- *Ease-out* (fast start, gentle landing) reads as responsive, because the motion begins on the user's input, and as settled at the end. Carbon and NN/g both prescribe it for responses to input and for entrances. [V]
- *Linear* motion reads as mechanical when something starts or stops. It suits continuous, ambient motion such as a progress fill or a loop's phase. [M]
- *Overshoot and bounce* read as playful, springy and light. That makes them right for chrome that "pops" (sheets, toasts, toggles). They are wrong for anything that must feel weighty or trustworthy, and for anything near text. This mapping is design consensus, not a controlled finding. [F-ish] pubre already learned that a size-pulsing pointer distracts (product-design.md §7).
- *Perceived duration can be steered.* Harrison et al. (UIST '07) showed that a progress bar's acceleration profile changes how long the wait feels, independent of the real time. [S] <https://chrisharrison.net/index.php/Research/ProgressBars> In the follow-up (CHI '10), backwards-moving ribs made bars feel faster, by about 11% from memory. [M]

## 2. Motion and emotion

- **Heider & Simmel (1944).** Viewers of a film of two triangles and a circle (one summary says 114 Smith College students) told stories of chasing, bullying and comforting. People read intention and emotion into motion alone. [V] <https://www.cs.uky.edu/~sgware/reading/papers/heider1944experimental.pdf>
- **Tremoulet & Feldman (2000).** A *single* dot looks alive when it changes speed and direction at the same moment. Animacy ratings rose with the size of the speed change and the angle of the turn. [V] <https://journals.sagepub.com/doi/10.1068/p3101>
  - *For pubre:* a pointer that jumps and swerves irregularly reads as a creature. That can be charming in an opener, but it pulls the eye on the reading line. A calm pointer keeps a steady rhythm and changes direction only at line breaks.
- **Pollick et al. (2001), point-light arm movements.** Perceived activation (arousal) tracked **velocity**, while valence was a subtler cue carried by spatial and phase relations. [S] <https://eprints.gla.ac.uk/25001>
- **Saerbeck & Bartneck (HRI 2010).** The robot's body made no difference. **Acceleration predicted perceived arousal**, and valence came partly from the interaction of acceleration and curvature. [V] <https://www.bartneck.de/publications/2010/perceptionAffectElicitedRobotMotion/> A replication found that low velocity and acceleration read as sad, and rising values moved through happy to excited. [S]
- **Kinetic typography.**
  - Lee, Forlizzi & Hudson built the Kinetic Typography Engine (UIST '02): <https://www.cs.cmu.edu/~johnny/kt>. Lee, Jun, Forlizzi & Hudson (DIS '06) showed that the neutral text "I am fine", animated four ways, conveyed four different emotions. [S]
  - A 2014 study (21 participants rating 80 effects) mapped kinetic type features to feelings. **Energy** came from size, transparency, direction, amount of movement, velocity and acceleration. **Mood** came from transparency, direction, **regularity** and speed. [V] <https://koreascience.kr/article/JAKO201409864556113.do>
  - Takeaway: regular, slow, low-amplitude motion with gentle opacity reads as calm. Fast, irregular, large motion reads as excited.
- **Smooth vs. jerky.** Dropped frames and stutter read as broken rather than "energetic". No reader-specific study was found. Hold 60 fps and animate only transform and opacity. [M]
- **Breathing rhythm.** About **6 breaths/min (0.1 Hz)** is the typical cardiovascular resonance frequency, and pacing breath there raised positive mood and changed HRV against a control. [V] <https://pmc.ncbi.nlm.nih.gov/articles/PMC5575449/> The median resonance frequency was 6/min across 154 people. [V] <https://link.springer.com/10.1007/s10484-023-09602-5>
  - *Visual* pacers that entrain breathing without conscious effort are only exploratory. Breathing Edges, a peripheral colour gradient pulsing at breath rate while people read in the browser, had n = 16 and was a workshop paper. [S] DeLight's biofeedback light matched graphic biofeedback physiologically and felt more relaxing. [S] <https://www.drhu.eu/publications/2018-PUC-DeLight.pdf>
  - The claim that a 6/min glow will calm the reader is **plausible but unproven** for passive viewing. [F-ish]

## 3. Attention, distraction and vestibular safety

**Capture**
- **Abrupt onsets** (a new object appearing) capture attention (Yantis & Jonides 1984). Strongly focused attention can partly resist this (1990). [V/S] <https://pubmed.ncbi.nlm.nih.gov/2137514/>
- **Motion onset**, the change from still to moving, captures attention. Ongoing motion does not, to the same degree (Abrams & Christ 2003). [V] <https://pubmed.ncbi.nlm.nih.gov/12930472/>
- **Looming** (expanding) captures attention and receding does not (Franconeri & Simons 2003), which the authors explain as "behavioural urgency", the signal of a possible collision. [V] <https://visualcognition.psych.northwestern.edu/publications/FranconeriSimons_Motion.pdf>
- *For pubre:*
  - Scale-up and pop-in are alarms. Fade-out and shrink-away are quiet.
  - A pointer that moves continuously costs less than one that stops and restarts at every word, but each step is a small onset. Keep the step small, short and predictable so it habituates.
- **Periphery.** Flicker is more salient in peripheral vision. [V] <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7509743/> The claim that peripheral vision is more sensitive to motion in general is **overstated**: peripheral velocity discrimination is roughly foveal (McKee & Nakayama). [F]. What holds is that peripheral *onsets and flicker* draw the eye.

**Measured reading costs**
- Zhang (2000): animation as a secondary stimulus cut task performance. Animation that resembled the task's content was worse, and brightly coloured animation was worse than dull. [V] <https://aisel.aisnet.org/jais/vol1/iss1/1>
- Simola et al. (2011): animated ads beside text drew overt attention and disrupted reading. Gaze landed on sudden ads in step with their onset, most of all for the ad closest to the text. [V] <https://research.utu.fi/converis/portal/detail/Publication/3550924?lang=en_GB>
- Lan, Liao & Kruger (2025): the more animated the ad, the more and longer the fixations and the more regressions. **Flashing text** amplified the word-frequency effect, which means it interfered with word processing. Comprehension held only because readers "read more mindfully", that is, with more effort. [V] <https://scholars.hkbu.edu.hk/en/publications/do-advertisements-disrupt-reading-evidence-from-eye-movements/>
- Blinking cursors: no direct eye-tracking study was found. The claim that they distract is plausible by extrapolation from the flicker and onset findings. [F-ish]

**Change blindness**
- A change made during a transient (a blank, a flicker, a cut) is often missed, unless it is central to the scene's gist (Rensink, O'Regan & Clark 1997). [V] <https://homepage.villanova.edu/diego.fernandezduque/Teaching/CognitivePsychology/Lectures_and_Labs/s3Attention/sReading/Rensink_etal_97.pdf>
- *For pubre:* a page turn is a transient, and the reader will not see what changes under it. That is fine for a silent reflow. It is wrong for anything the reader must notice, such as a new note or a mode change, which must happen after the turn settles.

**Interruptions and flow**
- Interrupted workers compensate by working faster, at the cost of more stress, frustration and effort (Mark et al., CHI 2008). [V] <https://www.interruptions.net/literature/Mark-CHI08.pdf>
- The often-quoted figure of 23 min 15 s to resume comes from an interview about a different study. It is not a law. [F]
- Richer in-reading aids were rated more useful but more disruptive to reading flow (Draxler et al., MUM 2022, n = 24). [V] <https://www.medien.informatik.uni-muenchen.de/pubdb/publications/pub/draxler2022_mum/draxler2022_mum.pdf>

**Vestibular safety and the WCAG criteria**
- **WCAG 2.3.3** (AAA): motion triggered by interaction can be turned off unless it is essential.
  - It names parallax and scroll-linked movement beyond scrolling itself, such as things sliding sideways while you scroll vertically.
  - Colour, opacity (and originally blur) changes are *not* motion animation.
  - Reactions include dizziness, nausea, headache and migraine.

  [V] <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html>
- **Apple's reduced-motion criteria** flag:
  - scaling, spinning and peripheral motion
  - depth simulation (parallax, animated blur, depth of field)
  - multi-axis, multi-speed and vortex motion
  - auto-advancing or other ongoing motion

  The substitute is "a dissolve, highlight fade, or color shift". [V] <https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria>
- WCAG 2.2.2 requires that motion which starts automatically and lasts more than 5 s can be paused. WCAG 2.3.1 allows no more than 3 flashes in any one-second period. [M]
- Oscillation near **0.2 Hz** is the classic peak for motion sickness (O'Hanlon & McCauley 1974). [M] Apple's page does not state it; that claim comes from a blog. [F]
- Prevalence: **35.4%** of US adults aged 40 and over failed a balance test (Agrawal et al. 2009, NHANES), rising to 85% at 80 and over. [V] <https://pmc.ncbi.nlm.nih.gov/articles/PMC4069154/> The common gloss that "35% of adults have vestibular disorders" overstates a balance-test proxy. [F]

## 4. Reading-specific evidence

- **Look-back matters.** Masking words after the eye passes them (which simulates RSVP) hurt comprehension, and not only on hard sentences (Schotter, Tran & Rayner 2014). [V] <https://journals.sagepub.com/doi/abs/10.1177/0956797614531148> Any reveal or pointer must leave already-read text fully visible.
- **Moving text.** With horizontally scrolling text, literal comprehension mostly held up, but inference questions got harder, faster speeds were worse, and returning to earlier text was harder (Walker et al., QJEP 2018). [V] <https://pure.royalholloway.ac.uk/en/publications/reading-comprehension-and-its-relationship-with-working-memory-ca/> Paging appears to load memory less than line-by-line scrolling (Piolat et al. 1998). [S]
  - *For pubre:* reading is saccadic. Text that glides asks the eye for smooth pursuit, which is not how people read. Never move the text under the reader, and step the pointer rather than gliding it.
- **Sense of place.** In Mangen, Olivier & Velay (2019), 50 people read a 28-page story on a Kindle or in print. Scores were mostly equal, but Kindle readers did worse on **chronology** and on placing events. The authors blame weaker kinaesthetic cues. [V] <https://pmc.ncbi.nlm.nih.gov/articles/PMC6384527/>
  - Hou, Rashid & Lee (2017, N = 45) found that the reader's ability to build a **cognitive map** of the text explained the outcomes better than the physical medium did. [V] <https://nanyangtechnologicaluniv.demo.elsevierpure.com/en/publications/cognitive-map-or-medium-materiality-reading-on-paper-and-screen>
  - *For pubre:* page-turn direction, constant geometry and a felt sense of thickness or progress are what help the reader. Realism is not.
- **Page-turn style.** No controlled study comparing page curl with slide on comprehension or immersion was found. [V, absence]
  - In VR, moving pages toward the reader supported flow and immersion, and readers liked the swipe animation for pleasure reading. [S] <https://dl.acm.org/doi/fullHtml/10.1145/3441000.3441024>
  - The claim that a skeuomorphic curl is more immersive is **[F]**. Vendor blogs assert it without data.
  - What the evidence does support: keep the turn short, keep it directional (it teaches where you are in the book), let it follow the finger, and make it cancellable.
- **Moving highlight (karaoke).** Word-synchronous highlighting while listening improved children's memory for word meanings (28% vs 17%) but not spelling (Gerbier et al., n = 35). [V] <https://www.isca-archive.org/slate_2015/gerbier15_slate.pdf> Small studies of dyslexic readers suggest it eases following along. [S] No adult comprehension evidence was found.
- **Animated text reveal.** For kinetic type in motion graphics, there is an optimal on-screen speed, and transition style changes readability (Dolić et al. 2024). [S] <https://www.grid.uns.ac.rs/symposium/download/2024/89.pdf> The cueing evidence (`cognitive-reading.md`) applies here too: signalling helps and over-cueing hurts. Reveal is an *opener* effect, not a reading-time effect.

## 5. Colour and light over time

- WCAG and Apple treat colour and opacity change as the *safe* channel. They are not motion, and they are the recommended reduced-motion substitute. [V]
- **Brightness drives pleasure and saturation drives arousal** (Valdez & Mehrabian 1994, a PAD study). [V] <https://pubmed.ncbi.nlm.nih.gov/7996122/> Saturated, bright colours raise positive emotion (Wilms & Oberfeld 2018). [S]
  - *For pubre:* a glow that gains saturation reads as excitement. A glow that only gains lightness reads as warmth or pleasantness.
- Brightly coloured animation distracts more than dull animation (Zhang 2000). [V]
- **Pulsing.**
  - Slow screen-brightness oscillation slowed response times, so it lowered alertness (Victor & Sano 2020, n = 36). [S]
  - Slow, low-intensity dynamic lighting raised parasympathetic activity over 25 min (n is small). [S] <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8403042/>
  - Red light raised sympathetic HRV markers and blue light lowered them (n = 20). [S]
  - Flashing at 3 Hz or above is a seizure risk (WCAG 2.3.1). Flicker is most salient in the periphery. [V/M]
  - *For pubre:* pulse only at breath rate (about 0.1–0.2 Hz) and only in ambient space. Never pulse on or next to the line.
- **Fades** reveal and conceal with the least attentional cost of any transition, because they are neither onset nor looming. They still capture some attention when fast and high-contrast (onsets need not be luminance increments; Yantis & Hillstrom 1994). [S] Keep fades near text slow (≥ 200 ms) and low-contrast.

## Motion grammar for a reader

pubre tokens: `--ease` is the iOS ease-out, `--spring` is the slight-overshoot `linear()` curve, and ease-in-out is used for glides. The durations sit inside the ranges in product-design.md §4.

| Feeling we want | Duration | Easing | Amplitude | Where on screen | Repetition | Avoid |
|---|---|---|---|---|---|---|
| **Calm** (ambient, settling in) | Cycle of 6–10 s (0.1–0.17 Hz). Transitions take 400–700 ms | Sine or ease-in-out, never springy | Tiny: opacity ±3–6%, lightness only, no movement | Background and margins, far from the line | Continuous is fine *only if* it is ambient and steady | Saturation swings, onsets, 0.2 Hz sway of large areas, anything on the text block |
| **Focus** (pointer, current sentence) | Step of 100–160 ms. Contrast shifts take 150–250 ms | `--ease` for position (≤ 0.5% settle). Size changes only monotonically | Small: a word-width step, low-contrast tint | On the line, as the *only* moving thing there | Per word or sentence, at a regular rhythm so it habituates | Overshoot in size, irregular speed (it reads as alive), gliding text, blinking |
| **Anticipation** (chapter opener, the next thing is coming) | 300–600 ms, with a 50–100 ms lead-in | Gentle anticipation, then ease-out (Chang & Ungar) | Medium, in the opener only | Centre stage *before* reading starts | Once per chapter | Delaying the text more than about 1 s, reveal effects once reading has begun |
| **Delight** (a popover, a found highlight, an easter egg) | 200–350 ms | `--spring` (bounce ≤ 0.2) | Medium, growing from its origin control | Chrome and popovers, triggered by the user | Rare, user-initiated. Shorten it if the user sees it often | Spring on text-level motion, autoplay, repeating the same flourish every page |
| **Orientation / sense of place** (page turn, jumps) | 300–450 ms; follows the finger 1:1 when dragged | Ease-out on release, ease-in-out for programmatic turns | Full page, along *one* axis, always the same direction for forward | The whole text block | Every turn, so keep it the quietest repeated motion | Curls with 3D depth or zoom under reduced motion, changes hidden under the turn that the reader must notice |
| **Closure / accomplishment** (end of chapter or book, a goal met) | 600–1200 ms, once | Decelerating (`emphasized-decelerate`), then a slow fade | Medium to large, but receding, settling or filling, not looming | Centre, after the last line is read | Once per milestone | Bouncing badges mid-reading, confetti over text, looming scale-ups |
| **Warning / attention needed** (error, lost position) | 150–250 ms onset, then static | Ease-out, no bounce | Small but high-contrast; one discrete onset (colour or position) | Chrome edge, never the line | Once. If it persists it is static, not pulsing | Pulsing or flashing (≥ 3 Hz is unsafe), shake on the text block, any alarm used for non-warnings |

### What must never move near the line being read

The *line zone* means the current line plus one line above and below, and the margin beside them.

1. **Only the pointer may move in the line zone.** No other onsets, pop-ins, toasts or badges appear there while the reader is reading. Popovers wait for a pause or a tap.
2. **Nothing looms or scales** in the line zone: no zoom, no size pulse, no "breathing" text.
3. **No blinking, flashing or pulsing** on or beside the line, including the pointer, cursor and highlights.
4. **The text never moves under the eye.** No reflow, no layout shift and no gliding. Text changes only at page turns, and silently.
5. **Already-read text stays visible and stable.** Ink-in and reveal effects run ahead of the eye or before reading starts, and never erase what the reader just passed.
6. **No parallax and no multi-speed layers** behind text.
7. **Saturation stays fixed** on the line. Use lightness or opacity for emphasis.

## Checklist: 10 rules for pubre motion

1. **Name the feeling first.** Pick the grammar row, and if no row fits, don't animate.
2. **One mover at a time in the reader's view.** While the pointer runs, all other motion waits or goes ambient.
3. **Onsets are expensive.** Prefer fades and receding motion to pop-ins and scale-ups, and spend onsets only on things the reader asked for.
4. **Stay within the time budget.** Micro motion takes 100–200 ms, UI 200–400 ms, and page turns 300–450 ms. Anything over 500 ms is reserved for one-off moments (openers, closure). Exits are faster than entrances.
5. **Shorter and quieter the more often it repeats.** The page turn and the pointer step are the most frequent, so they are the plainest.
6. **Spring for chrome, ease for text.** Never use overshoot on size, and never use springs at text level.
7. **Rhythm makes calm; irregularity makes life.** Keep reading-time motion regular, and save irregular, animate motion for openers.
8. **Protect look-back and place.** Never hide read text. Page turns keep one consistent direction and geometry. Make progress felt.
9. **Never hide important changes under a transition.** Show them after motion settles (change blindness).
10. **Reduced motion keeps the meaning.** Swap movement for a dissolve, an opacity change or a colour shift, and drop parallax, zoom, depth and ongoing motion. Hold 60 fps by animating only transform and opacity.
