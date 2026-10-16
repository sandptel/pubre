# On-device models for reading: speakers, scenes, mood. Researched 2026-10-16

Scope: can a small model running in the browser (Android Chrome, GitHub Pages, no backend) beat our heuristics at the classification jobs a reader needs? The main one is "who is speaking". Numbers come from papers and model cards linked inline. Anything marked **unverified** is my estimate or a claim I could not confirm.

## TL;DR

- **Explicit quotes are already solved by rules.** Every system scores 94–99% on quotes with a "said X" tag. All the room to improve is in anaphoric quotes ("he said") and implicit ones (no tag, alternating turns). In PDNC those two kinds make up about **two thirds** of all quotes (29% and 37%).
- **What each approach gets on PDNC:** rule sieve 62% overall (implicit 41%) → BERT-base trained on PDNC 78.5% (implicit 66%) → best encoder 94.5% (implicit 89%, ModernBERT-large) → Llama-3-8B zero-shot 89.8% (implicit 82%). The setting closest to ours (only named mentions from a cast list, no coref) gets **85.0%** with ModernBERT-large. That model is ~450 MB at int8, which is too big for a phone.
- **Nothing ready-made fits in the browser.** No quote-attribution model ships as ONNX or transformers.js. The best 2026 model (ModernBookNLP) has no released weights and no licence. BookNLP's *small* speaker model is a 14M-param BERT (57.6 MB fp32, about 15 MB at int8), MIT. Porting it means reimplementing its candidate pipeline. Off the shelf it gets only 0.40–0.62 on PDNC.
- **Practical plan:** first add Muzny-style sieves to `lenses.ts` (turn alternation, pronoun → last same-gender speaker, vocatives), measured against PDNC (CC-BY 4.0). Then, optionally, train our own small cross-encoder (BERT-mini/small, 15–35 MB int8) on PDNC. It would run in a worker only on quotes the rules leave open, using WASM, or WebGPU when present. Skip in-browser LLMs for v1. The smallest usable ones are 0.5–0.8 GB, and nobody has published PDNC numbers for sub-2B models.
- **Environment/scene effects:** keep the lexicon as the primary signal, but add rules that tell literal from figurative use, plus hysteresis. Add **bge-small-en-v1.5** (int8 33.8 MB, MIT) or **all-MiniLM-L6-v2** (int8 23 MB, Apache-2.0) as an embedding-prototype check that runs once per window. Zero-shot NLI costs one pass per label, about 16× the embedding cost. An LLM is overkill for an ambient effect.

---

## 1. Quote / speaker attribution

### The benchmark: PDNC
- Project Dialogism Novel Corpus: 22 novels and 35,978 quotes in v1. Six more novels were added in June 2023, bringing it to 28 novels and about 37k quotes. **Licence CC-BY 4.0** ([repo](https://github.com/Priya22/project-dialogism-novel-corpus), [paper](https://arxiv.org/abs/2204.05836)).
- Quote types: explicit 33%, anaphoric 29%, implicit 37%.
- Caveat for every number below: they assume **gold quote spans and a gold character list**. Real end-to-end accuracy is lower.

### Results (accuracy on PDNC)

| System | Size | Overall | Explicit | Anaphoric | Implicit | Source |
|---|---|---|---|---|---|---|
| Muzny et al. 2017 sieve (rules, Python re-impl.) | 0 | 62 | 96 | 48 | 41 | [PDNC paper](https://arxiv.org/abs/2204.05836) |
| BookNLP (off the shelf) | BERT-base | 63 | 94 | 46 | 46 | same |
| BookNLP end-to-end, no candidate restriction | BERT-base | 40–42 | 64 | 28 (non-explicit) | – | [Vishnubhotla 2023](https://arxiv.org/abs/2307.03734) |
| ChatGPT zero-shot / SIG (BART) | – | 71 / 72 | – | 70 / 70 (non-explicit) | – | [SIG, AAAI 2024](https://arxiv.org/abs/2312.14590) |
| BookNLP+ (trained on PDNC, coref candidates) | BERT/SpanBERT-base | 78.5 | 98.6 | 70.2 | 66.4 | [Michel 2026](https://arxiv.org/abs/2608.02359) |
| Llama-3-8B-Instruct, zero-shot CoT, 4k chunks | 8B | 89.8 | 94.9 | 93.1 | 81.8 | same / [NAACL 2025](https://arxiv.org/abs/2406.11380) |
| Joint scoring, **alias-only** candidates | ModernBERT-large | 85.0 | 96.2 | 81.5 | 76.7 | [Michel 2026](https://arxiv.org/abs/2608.02359) |
| Joint scoring, coref candidates (best) | ModernBERT-large | **94.5** | 99.3 | 95.5 | 89.3 | same |
| Joint scoring, coref candidates | Longformer-base (~3× fewer params) | 87.7 | 97.3 | 87.4 | 79.5 | same |

What these numbers tell us:
- **Rules top out around 60–65%** on PDNC-style novels. The ceiling comes from anaphoric and implicit quotes. Today's `lenses.ts` heuristic uses tags, a paragraph's single tagged speaker, and carry-over of unclosed quotes. That puts it roughly at the explicit-only level. It has no alternation and no pronoun resolution. **We have never measured it.** Measuring it on PDNC is the first thing to do.
- **Candidates matter more than model size.** The same ModernBERT model goes from 85.0 to 94.5 when pronoun and nominal mentions (coref) are added to named mentions. BookNLP rises from 0.42 to 0.61 just by restricting candidates to resolved mentions ([Vishnubhotla 2023](https://arxiv.org/abs/2307.03734)). Our cast finder gives us the alias setting for free.
- **Smaller encoders lose about 4–7 points:** Longformer-base vs ModernBERT-large is 87.7 vs 94.5. BookNLP small (BERT L-8 H-256) vs big (BERT-base) is 86.4 vs 89.9 B3 on LitBank ([BookNLP README](https://github.com/booknlp/booknlp)).
- **LLMs are strong but huge.** Llama-3-8B reaches 89.8, and memorisation does not explain the score ([NAACL 2025](https://arxiv.org/abs/2406.11380)). Llama-3-70B made 3 errors in 1,442 quotes on an unseen novel. I found **no PDNC results for models of 2B or smaller** (Qwen3-0.6B, Gemma 3 1B, Llama 3.2 1B). **Unverified** how they do. My expectation is well below 8B on implicit quotes.
- Muzny et al. 2017 (the original sieve) reports 87.5 average F on their own QuoteLi3 data. They also report a precision-tuned setting of 90.4 P at 65.1 R ([EACL 2017](https://aclanthology.org/E17-1044/)). Precision-tuning is a useful idea for us: show a speaker only when confident.

### Small models we could actually run
| Model | Params / size | Licence | Status for browser |
|---|---|---|---|
| BookNLP small speaker model `speaker_google_bert_uncased_L-8_H-256_A-4` | ~14M; 57.6 MB fp32 → ~15 MB int8 (est.) | MIT (code; weights' licence not separately stated, **unverified**) | PyTorch only. Needs ONNX export plus a port of its candidate and mention logic, which depends on BookNLP NER and coref. |
| ModernBookNLP joint model | ModernBERT-large (~395M); ~450 MB int8 | no LICENSE in [repo](https://github.com/gasmichel/ModernBookNLP_QA) | Weights not published. Too big for phones anyway. |
| **Train our own** cross-encoder: (quote + context window with candidate name marked) → score | BERT-mini/small or [ettin-encoder-17m](https://huggingface.co/onnx-community/ettin-encoder-17m-ONNX) (21 MB int8); 15–35 MB | PDNC is CC-BY 4.0, so OK | One-off offline Python training, export to ONNX int8, run in transformers.js. Expected accuracy is **unverified**. My guess is 75–85% overall in the alias setting, extrapolating from the table. |

---

## 2. Other classifiers useful to a reader

| Task | Candidate (transformers.js / ONNX) | Size (int8) | Licence | Verdict |
|---|---|---|---|---|
| Emotion per passage | [j-hartmann/emotion-english-distilroberta-base](https://huggingface.co/j-hartmann/emotion-english-distilroberta-base) ([ONNX port](https://huggingface.co/onnx-community/emotion-english-distilroberta-base-ONNX)) | 82.7 MB | not stated on card (**unverified**) | 7 Ekman classes, **66%** eval accuracy. Trained on tweets, Reddit and similar, not 19th-century prose. |
| | [AdamCodd/tinybert-emotion-balanced](https://huggingface.co/AdamCodd/tinybert-emotion-balanced) | **4.5 MB** | Apache-2.0 | 93.5% in-domain (Twitter emotion set). The card itself warns it struggles with negation and sarcasm. Cheap enough to try. |
| | [SamLowe/roberta-base-go_emotions-onnx](https://huggingface.co/SamLowe/roberta-base-go_emotions-onnx) | 125 MB | MIT | 28 labels, Reddit domain. Too heavy for what it adds. |
| NER | [Xenova/bert-base-NER](https://huggingface.co/Xenova/bert-base-NER) | 108.5 MB (q4f16 93.7) | MIT (trained on CoNLL-2003 news) | Our cast finder already scores P@20 100% on novels. NER adds little at 100 MB. BookNLP's literary NER small model (L-4 H-256, 62 MB fp32, F1 88.2) would fit better but needs a custom port. |
| Coreference | [biu-nlp/f-coref](https://huggingface.co/biu-nlp/f-coref) ([paper](https://arxiv.org/abs/2209.04280)) | 362 MB fp32 (~90M params) | MIT | 78.5 F1 on OntoNotes. **No ONNX or transformers.js port found.** BookNLP small coref (L-2 H-256, 40.8 MB fp32, LitBank F1 76.4) is the only phone-sized option, again via a custom port. Coref is what moves quote accuracy from 85 to 94, so it is the real prize, and also the hardest port. |
| Scene-break / segmentation | none ready | – | – | Hard task. The STSS 2021 BERT baseline got **F1 24%** on German dime novels ([Zehe et al.](https://aclanthology.org/2021.eacl-main.276)). Heuristics give a better return: `***`, `<hr>`, blank-line sections, time and location shift cues. |
| Dialogue vs narration | regex on quote marks (already in `lenses.ts`) | 0 | – | No model needed, except for books that mark speech with dashes or no marks at all (niche). |
| Genre / mood (zero-shot) | [Xenova/mobilebert-uncased-mnli](https://huggingface.co/Xenova/mobilebert-uncased-mnli), [deberta-v3-xsmall-zeroshot](https://huggingface.co/MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33) | 26 MB / 87 MB | – / MIT | Workable, but a book's genre rarely changes, and EPUB metadata plus the lexicon covers it. |
| Time of day | [Kim, Pethe & Skiena 2020](https://arxiv.org/abs/2011.04124) | – | – | Classifier on 52k fiction books, average error 2.27 h (humans disagree by 1.85 h). Useful prior art for the "light" channel below. |

---

## 3. Practicality on Android Chrome

**WebGPU**
- On by default since Chrome 121 on Android 12+ with Qualcomm and ARM GPUs ([Chrome blog](https://developer.chrome.com/blog/new-in-webgpu-121)).
- Chrome 146 added a compatibility mode on OpenGL ES 3.1 for older devices, Android first. Opt in with `featureLevel: "compatibility"` ([Chrome blog](https://developer.chrome.com/blog/new-in-webgpu-146)).
- transformers.js puts global WebGPU support at about 85% as of March 2026 ([docs](https://huggingface.co/docs/transformers.js/en/guides/webgpu)). The share of Android devices specifically is **unverified**; third-party estimates range from 60% to 78%.
- **Always keep WASM as the fallback.**

**Runtime**
- transformers.js v4 (current 4.3.1) rewrote the WebGPU runtime. It reports about 4× speed-up for BERT embeddings from fused attention ([v4 blog](https://huggingface.co/blog/transformersjs-v4)).
- onnxruntime-web 1.30 WASM binaries are 14.2 MB (plain SIMD-threaded) to 28.3 MB (JSEP/WebGPU), uncompressed, and cached once.

**Speed**
- I found **no published Android numbers** for BERT-class models in transformers.js.
- Desktop reference: all-MiniLM-L6-v2 fp32 at 512 tokens takes 507 ms WASM vs 46 ms WebGPU per sequence ([benchmark](https://huggingface.co/spaces/Xenova/webgpu-embedding-benchmark/discussions/1)).
- In-browser inference on mobile runs 15.8× slower than native on CPU and 7.8× on GPU. Memory can reach 334× model size in bad cases ([Wang et al., TOSEM](https://arxiv.org/abs/2402.05981)).
- **Estimate (unverified):** a 22–35M-param int8 encoder on a mid phone takes about 0.5–3 s per 512-token window on WASM. A ~6k-token chapter would then take roughly 10–40 s, which is fine in the background. Measure on the user's phone with the benchmark Space before committing.

**Small LLMs**
- Gemma 3 1B int4 (LiteRT, *native* on S24 Ultra): GPU prefill 2,585 tok/s, decode 56 tok/s, 529 MB. On the web, numbers exist only for an M4 Max (decode 77–134 tok/s) ([card](https://huggingface.co/litert-community/Gemma3-1B-IT)).
- ONNX sizes: Qwen2.5-0.5B q4f16 **483 MB**, Qwen3-0.6B q4f16 **570 MB** (Apache-2.0), Gemma 3 1B q4f16 **763 MB** (Gemma terms), Gemma 3 270M q4f16 273 MB.
- Chrome's built-in Gemini Nano (Prompt API) is **not available on Android** ([docs](https://developer.chrome.com/docs/ai/get-started)).

**Threads on GitHub Pages**
- Multi-threaded WASM needs `crossOriginIsolated`, which needs COOP/COEP headers ([ORT docs](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)). GitHub Pages cannot set those headers.
- Options: run single-threaded (`numThreads = 1`), or add [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker). The service worker forces a reload on first visit and must be served from our own origin.
- pubre has no service worker today. The Capacitor build can set the headers natively.

**Storage**
- Chrome lets an origin use up to 60% of disk. Data is best-effort, so it can be evicted, unless `navigator.storage.persist()` is granted ([web.dev](https://web.dev/articles/storage-for-the-web)).
- Store model weights in Cache API (transformers.js does this by default) or OPFS. Store results in IndexedDB per book.
- Run everything in a Web Worker. We already have `src/insights/worker.ts`.

**Memory**
- Old guidance for Chrome on Android was about 500–700 MB of practical WASM heap on 32-bit builds (2021, **outdated / unverified** for 2026). Plan on staying under 200 MB for weights plus activations. That rules out LLMs on mid phones and keeps 15–35 MB encoders safe.

**Licences:** PDNC CC-BY 4.0 · BookNLP MIT · f-coref MIT · bert-base-NER MIT · tinybert-emotion Apache-2.0 · all-MiniLM-L6-v2 Apache-2.0 · bge-small / gte-small MIT · deberta-v3-xsmall-zeroshot MIT · Qwen3 Apache-2.0 · Gemma: custom terms · ModernBookNLP: none.

---

## 4. Recommended architecture (speakers)

```
chapter text ──► rules (lenses.ts + new sieves) ──► confident? ──yes──► speaker
                                    │no (anaphoric / implicit / conflict)
                                    ▼
          worker: small cross-encoder scores (quote, ±N sentences, candidate)
          candidates = cast (names.ts) present in the last ~2k tokens + last 2 speakers
                                    ▼
                  IndexedDB  {bookId, spine, quoteOffset} → {speaker, conf, source}
```

1. **Measure first.** Build a tiny eval that runs `lenses.ts` quote attribution against PDNC. Use the novels we already have in `../pubre-samples` (PDNC covers *Pride and Prejudice*, *Emma*, *Persuasion*, and others). Report results by quote type.
2. **Rules v2 (0 MB).** Add Muzny-style sieves:
   - conversation alternation: in a run of untagged one-quote paragraphs, A/B/A/B from the last two tagged speakers;
   - pronoun tags ("he said") → most recent same-gender cast member (gender from `gazetteer.ts` and titles);
   - vocatives ("…, Mr. Darcy" → the speaker is someone else);
   - an "X replied" chain.
   Mark each quote's confidence and show a speaker only when confident (precision over recall). Expected result: near the 62% sieve level, with explicit quotes about 96%.
3. **Model v1 (optional download, 15–35 MB).** Train a BERT-mini/small or ettin-17m cross-encoder on PDNC in the alias setting. Export ONNX int8. Run it in the existing insights worker, one chapter ahead of the reader. Use `device: 'webgpu'` when `navigator.gpu` gives an adapter, else WASM single-thread. Only quotes the rules didn't settle go through the model, which is roughly half of all quotes.
4. **Device can't run it:** detect by no worker, low `navigator.deviceMemory` (≤ 2), a failed load, or a per-chapter time over budget. Then stay on rules v2 and simply leave uncertain quotes uncoloured, which is today's behaviour. Never block reading.
5. **LLM: deferred.** Revisit only if a ≤1B model scores ≥ 80% on PDNC non-explicit quotes in our own eval, and only as opt-in on WebGPU devices.

---

## 5. Presentation (survey; the designer decides)

- **Coloured speech per character:** Chromatics (iOS) uses an LLM-attributed, human-checked colour per character ([MobileRead](https://www.mobileread.com/forums/showthread.php?p=4607194)). This is close to our ink voices lens.
- **Name badges before dialogue:** CastReader (iOS) shows a colored badge before each line and has a toggle to hide tags ([App Store](https://apps.apple.com/lb/app/castreader/id6757636395)).
- **Script-editor style:** Scriptation, Final Draft and Highland can highlight the character name, the dialogue, or both, each on its own toggle ([Scriptation](https://help.scriptation.com/en/article/what-is-auto-highlighting-17llf2q)). This is a useful model for a "names only / lines only" setting.
- **Multi-voice audio:** Castly (full-cast AI audiobooks, 2026) and open-source kenkui ([PyPI](https://pypi.org/project/kenkui/)) assign one voice per character. That is the same attribution problem, heard instead of seen.
- **Not found in Kindle, Apple Books or Kobo.** Mainstream readers don't colour speakers. Kindle X-Ray lists characters but doesn't attribute lines.
- **Takeaway:** keep marks subtle, tie them to the cast's existing hues, show only confident attributions, and reveal the name on tap. This is already the pattern of our voice tooltip.

---

## 6. Environment / scene per page (weather, light, setting) for a subtle background

Today `chapters.ts` `weatherOf()` picks one of storm/fog/snow/night per **chapter**. The rule is ≥ 6 hits and ≥ 1 per 250 words, with no negation and no figurative filter.

**Datasets / benchmarks**
- **I found no dataset for weather or ambient setting in fiction.**
- Nearest work:
  - Story Settings (Rittichier 2023): about 7k works labelled with location and about 2.3k with time period, at **book** level ([WNU 2023](https://aclanthology.org/2023.wnu-1.12.pdf)).
  - Time-of-day in novels: 2.27 h error ([Kim et al.](https://arxiv.org/abs/2011.04124)).
  - Metaphor detection: VUA corpus. MelBERT gets F1 78.5 on VUA-18 with RoBERTa-base ([NAACL 2021](https://arxiv.org/abs/2104.13615)). That is too big, and too general, for our job.
- So we hand-label about 300 windows from `../pubre-samples` (a couple of hours of work) as both the eval set and the prototype seeds.

**Options**

| Approach | Size | Cost per window | Strengths | Weaknesses |
|---|---|---|---|---|
| (a) Lexicon + rules (current, extended) | 0 | microseconds | Exact, explainable, instant, already spoiler-safe | Misses keyword-free scenes ("the deck pitched"). Figurative use needs rules. |
| (b) Embedding prototypes: [bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5) 33.8 MB int8, MIT; [all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) 23 MB, Apache-2.0; [gte-small](https://huggingface.co/Xenova/gte-small) 33.8 MB, MIT; [mxbai-embed-xsmall](https://huggingface.co/mixedbread-ai/mxbai-embed-xsmall-v1) 24 MB, Apache-2.0 | 23–34 MB | **1 pass**, then cosine against K pre-embedded label prototypes | Catches paraphrase. All labels for the price of one pass. | Embeddings mix topic with literalness: "a storm of applause" lands near storm. Thresholds need calibration. Zero-shot accuracy for our labels is **unverified**. |
| (c) Zero-shot NLI: [deberta-v3-xsmall-zeroshot](https://huggingface.co/MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33) 87 MB, MIT; [nli-deberta-v3-xsmall](https://huggingface.co/Xenova/nli-deberta-v3-xsmall) 87 MB; [distilbert-mnli](https://huggingface.co/Xenova/distilbert-base-uncased-mnli) 67 MB | 67–161 MB | **1 pass per label**, so 16 labels = 16× (b) | Hypotheses like "It is literally raining in this scene" encode literalness, so it is plausibly better on metaphor (**unverified**) | Too slow to run as a primary classifier over all labels. Fine as a verifier on 1–2 candidate labels. |
| (d) Small instruct LLM (Qwen3-0.6B 570 MB, Gemma 3 270M 273 MB) | 0.27–0.8 GB | decode per window | Best at "literal vs figurative" in principle | Download and memory far too heavy for a background tint. Accuracy at ≤1B is **unverified**. |

**Telling literal from figurative (rules, cheap, do these first)**
- **"N of X" frames:** *a storm/shower/flood/hail/torrent/sea/fog of* + noun → figurative ("a storm of applause", "a sea of faces").
- **Abstract heads:** *dark/black/gloomy/stormy/sunny/cloudy/frosty* + abstract noun (thoughts, mood, humour, look, temper, days, secret, disposition) → figurative. Same for "in a fog" or "a haze" + mental state ("in a fog of confusion").
- **Literal frames:** weather verbs with expletive *it* ("it rained/snowed/was raining"); weather nouns as subjects of physical verbs (the rain *fell/beat/lashed*, snow *lay*, fog *rolled/lifted*, wind *howled/blew*); location preps (*in/through/out of the rain, under the stars, on deck, in the forest*).
- **Negation and endings:** *no/not a/without/never* within 3 tokens ("not a cloud") → no hit. End cues (*the rain stopped/ceased/had passed, fog lifted, dawn broke/day came* (ends night), *went indoors/inside*) → close the state.
- **Speech:** weather inside quotes counts at half weight. Characters talk about weather that isn't present ("it will rain tomorrow"), and tense or modal words (*will, would, might, if*) drop the weight further.
- **Optional verifier:** for the top candidate only, an NLI pass ("The scene takes place in the rain.") or an embedding margin against a "figurative" prototype set.

**Smoothing so it doesn't flicker**
- **Windows:** paragraph windows of about 150–250 words with 50% overlap, or per rendered page.
- **Channels:** score each channel separately. Weather (rain, storm, snow, fog, wind, sun), light (night, dawn, dusk, candle/firelight) and setting (sea, forest, city, indoors, desert) can co-occur.
- **Hysteresis:**
  - Per-label score s(t) = EMA over windows (α ≈ 0.4).
  - **Enter** when s > 0.6, or on one strong literal frame.
  - **Exit** when s < 0.3 for 2 consecutive windows, or on an end cue.
  - **Minimum dwell** of 2 pages.
  - At most one weather and one light state at a time. Swap only if the newcomer beats the incumbent by a margin.
- **Resets:** scene breaks (`***`, `<hr>`) and chapter starts reset to neutral, or to the chapter-level prior from `weatherOf`. *Indoors* dims weather to a faint "outside the window" version instead of switching it off.
- **Spoiler-safe and stable:** compute ahead in the worker, store per spine in IndexedDB, and never look ahead more than a chapter.

**Recommended pipeline**
1. **v1 (0 MB):** move `weatherOf` from per-chapter to per-window, extend the label set, and add the literal/figurative/negation rules and hysteresis above. Eval on the 300 hand-labelled windows. This is likely most of the value.
2. **v2 (opt-in, ~34 MB):** bge-small-en-v1.5 int8 in the insights worker. Embed each window once, ahead of the reader. Compare against about 5–10 hand-written prototype sentences per label, plus a "figurative" negative set. The rule scores and the embedding margin are combined into one score, and hysteresis runs on that score. Use WebGPU if available, otherwise WASM single-thread. The work fits a background budget: about 30 windows per chapter at an estimated 0.5–3 s each on a mid phone (**unverified**).
3. **Skip NLI and LLMs** unless the v2 eval shows figurative false positives the rules can't catch. If it does, add the NLI verifier on top-1 candidates only.

---

## Open risks and what I couldn't verify
- **No Android latency numbers** exist for transformers.js encoders. All per-window and per-chapter timings above are estimates. Benchmark on the user's phone first.
- **Sub-2B LLM accuracy on PDNC:** not published.
- **ModernBookNLP:** no weights and no licence. **j-hartmann emotion model:** no licence on its card. **BookNLP model weights:** licence not stated separately from the MIT code.
- **Small-encoder accuracy for our trained cross-encoder is a guess (75–85%).** Training needs a Python session and a GPU, and PDNC's books overlap with our sample set, so we must hold out novels to avoid leakage.
- **Porting BookNLP's coref** (the biggest accuracy lever) means reimplementing a custom architecture, not loading a pipeline.
- **coi-serviceworker** (for WASM threads on GitHub Pages) adds a reload on first visit. Without it, inference is single-threaded.
- **WASM heap limits** on current 64-bit Chrome Android: not verified. The old 500–700 MB guidance is from 2021.
- **Ambient labels:** no fiction weather dataset exists, so all accuracy claims for (a)–(d) are untested until we label windows ourselves.
