# pubre docs

This is the project memory: anything a new session needs in order to continue work without re-deriving it. All of it lives on the `docs` branch, never on `main`.

```
docs/
├── README.md            this index and the filing rules
├── features.md          EPUB capability gap analysis and pubre's product vision
├── context/             facts about the world and the codebase
│   ├── epub-primer.md   EPUB structure, versions, features, hard limits
│   ├── architecture.md  code map, data flow, rendering pipeline
│   └── findings.md      empirical gotchas (browser bugs, quirks), dated
├── decisions/           ADRs: NNNN-title.md (context, decision, consequences)
├── preferences/
│   └── user.md          user preferences and working agreements
├── instructions/
│   ├── workflow.md      how to work: commits, docs, verification, release
│   └── smoke-e2e.mjs    Playwright smoke test + screenshots
├── todo/
│   ├── done.md          shipped, newest first, with commit hashes
│   ├── backlog.md       next up, prioritized
│   └── deferred.md      deliberately left out, with the ceiling and the upgrade path
└── research/            one file per researched feature: research/<feature>.md
```

## Filing rules

- A **fact about EPUB or the browser** goes in `context/`. A **choice we made** goes in `decisions/`. **What the user wants** goes in `preferences/`.
- A new decision gets the next ADR number. Do not edit an old ADR's decision. Supersede it with a new ADR and link the two.
- Before building a non-trivial feature, write `research/<feature>.md`: what the spec says, how other readers do it, the options, and a recommendation.
- Date entries in absolute form (YYYY-MM-DD).
