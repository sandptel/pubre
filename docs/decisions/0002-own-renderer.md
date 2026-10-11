# 0002 · Build our own reader core instead of adopting foliate-js / epub.js

- Date: 2026-10-11 · Status: accepted

## Context

The user's goal is *maximum creative freedom over what and how each section is shown*. Existing engines would get us reading on day one, but their rendering model would become ours.

## Decision

Write our own parser, paginator and (later) CFI. Use foliate-js and Readium CSS as references, not as dependencies.

## Consequences

This means more upfront work: the parser, pagination math, and the CFI still to come. In return, presentation is fully controlled, which is the requirement for Section Presenters (`features.md` §2).
