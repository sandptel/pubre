# 0003 · Serve book resources as rewritten blob: URLs, not through a Service Worker

- Date: 2026-10-11 · Status: accepted (supersedes the Service Worker idea in the kickoff stack proposal)

## Context

Book XHTML references images, CSS and fonts by relative paths inside the ZIP. Two options were considered:

- **(a)** A Service Worker serves `/book/<id>/<path>` straight from the ZIP.
- **(b)** Rewrite each reference to a `blob:` URL before loading.

## Decision

Option (b). It works on the very first load, with no Service Worker lifecycle or "controller not ready yet" race. It also works in Firefox private mode, where Service Workers are unavailable, and keeps all ZIP code on the main thread.

## Consequences

Every attribute or CSS form that can reference a resource has to be rewritten. Currently covered: `src`, `link href`, SVG `href`/`xlink:href`, `poster`, `object data`, `<style>`, `style=`, CSS `url()` and `@import`. **`srcset` is not handled yet.** A Service Worker is still planned, but only for offline caching of the app shell.
