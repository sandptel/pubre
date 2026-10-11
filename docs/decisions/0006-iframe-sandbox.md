# 0006 · Book iframes: `sandbox="allow-same-origin allow-scripts"` + strip scripts + CSP

- Date: 2026-10-11 · Status: accepted

## Context

The parent needs DOM access to inject styles and listen for taps, which requires `allow-same-origin`. Without `allow-scripts`, WebKit does not deliver the parent's event listeners (see findings). But `allow-scripts` together with `allow-same-origin` would let book JS escape the sandbox.

## Decision

Keep both sandbox flags, and neutralize book JS in two layers:

1. Remove `<script>` elements and `on*` attributes while building the chapter.
2. Inject a `Content-Security-Policy` meta tag with `script-src 'none'`. Book resources are limited to `blob:`/`data:`. Fonts and styles may also come from `'self'` or Google Fonts (for Literata).

## Consequences

Scripted EPUBs are not interactive. A future "interactive mode" would run in an opaque-origin sandbox and talk to the parent over postMessage. Chrome logs a sandbox warning, which is expected.
