# Reflections

After each chunk: what worked, what hurt, what I would do differently, and what to watch next.

## C1 + C2 (2026-10-11): foundation and reading guide

**Worked**
- Building the text index on plain DOM Level 2 APIs made it unit-testable with xmldom.
- Putting the pointer *behind* a transparent iframe kept the book DOM pristine, so CFIs stay stable.
- Disjoint contrast ranges avoided the WebKit priority crash entirely.

**Hurt**
- My first dimming levels (38% for the page) were far too heavy in the real reader. They looked fine in the plan demo, which runs on a card background with a short passage.
- The pad covered the last line until I made guide mode reserve a bottom strip.

**Would do differently**
- Look at a real chapter screenshot *before* tuning visual constants.
- Prototype numbers in the demo don't transfer as-is.

**Next to watch**
- Rect lookups (`getClientRects`) inside `lineSpan()` and `firstWordOnPage` on huge chapters. Cache per-word rects per layout if profiling shows cost.
- Glide across a chapter boundary (pending/resume path) is only lightly tested.
