# Bundled language data

- `common-en.txt`: English words with Zipf frequency ≥ 3, exported from **wordfreq** by Robyn Speer
  (data CC BY-SA 4.0, https://github.com/rspeer/wordfreq; sources include SUBTLEX, Google Books Ngrams,
  Wikipedia, OpenSubtitles and others). pubre treats words *not* in this list as "hard". This derived list is CC BY-SA 4.0.
- `defs/*.json`: first-sense glosses for rare English words (Zipf 0–3), from **Open English WordNet 2024**
  (CC BY 4.0, https://en-word.net/, McCrae et al.), filtered with wordfreq.
