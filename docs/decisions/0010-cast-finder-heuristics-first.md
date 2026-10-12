# 0010 · The cast finder: measured heuristics first, a model only if they plateau

**Status:** accepted (2026-10-12)

## Context
The v1 cast finder (capitalised, not sentence-initial, ≥3 times) had many misses and false positives.
Options weighed: (A) better heuristics, (B) an on-device NER model for every sentence, (C) heuristics plus
a model checking only doubtful candidates, (D) a cloud LLM. D breaks "your books never leave your device".

## Decision
Build a gold eval first (tests/fixtures/names-gold.json: six books, cast + minor + never-a-person lists;
tests/names.eval.test.ts scores precision of the top 20 and recall of the cast in the top 30), then
heuristics v2 (A) against it. A model (C) only if A plateaus below ~90% on a book that matters.

## Result
v1 → v2 on the eval: P@20 73% → 100%, R@30 64% → 94%. Floors (P ≥ 90%, R ≥ 85% per book) guard regressions.
Remaining known gaps: a surname shared by a family stays its own entry ("Bingley" beside "Mr. Bingley");
identities only world knowledge gives (Magwitch = Provis, Pip = Handel); groups that never speak
(the Winged Monkeys). The extraction runs in the profile worker (one job per book, progress + a spoiler-free
first cast up to your place), so even a slow phone shows something at once.
