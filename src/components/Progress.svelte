<script lang="ts">
  import type { Section } from '../lib/paginator.ts'

  // Floating progress capsule: where you are (chapter, page) over a track split into one wedge per
  // chapter. Tap a wedge to jump to that chapter; drag anywhere to scrub; hover to preview.
  let { sections, progress, chapter, page, pages, onjump, onscrub, words = {}, left = '', info, marks = [] }: {
    sections: Section[]; progress: number; chapter: string; page: number; pages: number
    onjump: (href: string) => void; onscrub: (p: number) => void; words?: Record<string, string>; left?: string
    /** A chapter's mood colour and how much of it is spoken — shown only for chapters you've reached. */
    info?: (label: string, href: string) => { tint: string; talk: number } | undefined
    /** Your highlights and notes, as dots on the track (book positions 0..1, with their colour). */
    marks?: { at: number; color: string }[]
  } = $props()

  let track: HTMLDivElement
  let probe = $state<number | null>(null) // hovered / scrubbed position 0..1
  let drag: { x: number; moved: boolean } | null = null

  const wedges = $derived.by(() => {
    const s = sections.length && sections[0].start > 0.002 ? [{ label: 'Beginning', href: '', start: 0 }, ...sections] : sections
    return s.map((x, i) => ({ ...x, end: s[i + 1]?.start ?? 1 }))
  })
  const shown = $derived(probe ?? progress)
  const at = (p: number) => wedges.findLast(w => p >= w.start) ?? wedges[0]
  const pos = (e: PointerEvent) => {
    const r = track.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  }

  function down(e: PointerEvent) {
    track.setPointerCapture(e.pointerId)
    drag = { x: e.clientX, moved: false }
    probe = pos(e)
  }
  function move(e: PointerEvent) {
    if (drag && Math.abs(e.clientX - drag.x) > 4) drag.moved = true
    if (drag || e.pointerType === 'mouse') probe = pos(e)
  }
  function up(e: PointerEvent) {
    if (!drag) return
    const p = pos(e), w = at(p)
    if (drag.moved || !w?.href) onscrub(p)
    else onjump(w.href)
    drag = null
    probe = null
  }
  function key(e: KeyboardEvent) {
    const i = wedges.indexOf(at(progress))
    const target = e.key === 'ArrowRight' ? wedges[i + 1] : e.key === 'ArrowLeft' ? wedges[Math.max(0, i - 1)] : null
    if (!target) return
    e.preventDefault()
    target.href ? onjump(target.href) : onscrub(target.start)
  }
</script>

<div class="capsule glass">
  <div class="meta">
    <span class="chapter">{probe !== null ? at(probe)?.label : chapter}{#if probe !== null && words[at(probe)?.label ?? '']}<em class="yours"> · {words[at(probe)!.label]}</em>{/if}</span>
    <span class="page">{probe !== null ? `${Math.round(probe * 100)}%` : `${page + 1} of ${pages}`}</span>
  </div>
  <div class="track" bind:this={track} role="slider" tabindex="0" aria-label="Book position"
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-valuetext={chapter}
    class:dense={wedges.length > 48}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => { drag = null; probe = null }}
    onpointerleave={e => { if (!drag && e.pointerType === 'mouse') probe = null }} onkeydown={key}>
    {#each wedges as w, i (i)}
      {@const fill = Math.min(1, Math.max(0, (progress - w.start) / (w.end - w.start || 1)))}
      {@const reached = progress >= w.start}
      {@const c = reached ? info?.(w.label, w.href) : undefined}
      <div class="wedge" style:flex-grow={Math.max(w.end - w.start, 0.0005)} style:--tint={c?.tint ?? null} style:--talk={c ? Math.min(1, c.talk * 1.6) : 0}
        class:mood={!!c} class:current={progress >= w.start && progress < w.end} class:probed={probe !== null && probe >= w.start && probe < w.end}>
        <span style:transform="scaleX({fill})"></span>
      </div>
    {/each}
    {#each marks as m}<b class="mk" style:left="{m.at * 100}%" style:background="var(--base{m.color})"></b>{/each}
    <i class="knob" style:left="{shown * 100}%" class:active={probe !== null}></i>
  </div>
  <div class="under" aria-hidden="true">
    <span>{Math.round(shown * 100)}%</span>
    {#if sections.length > 1}<span>Chapter {Math.max(1, sections.findLastIndex(s => s.start <= shown + 1e-6) + 1)} of {sections.length}</span>{/if}
    {#if left}<span>{left}</span>{/if}
  </div>
</div>

<style>
  .capsule { border-radius: 22px; padding: 9px 16px 11px; display: grid; gap: 8px; min-width: 0; }
  .meta { display: flex; gap: var(--s3); font-size: 12px; line-height: 1; min-width: 0; } /* a grid item: without this, a long title widens the bar */
  .chapter { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
  .yours { font-style: italic; font-weight: 400; color: var(--accent); }
  .page { color: var(--muted); font-variant-numeric: tabular-nums; }

  .under { display: flex; justify-content: space-between; gap: var(--s2); font: 10.5px var(--mono, ui-monospace, monospace); letter-spacing: .02em; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
  .under span:nth-child(2) { flex: 1; text-align: center; overflow: hidden; text-overflow: ellipsis; }
  .track { position: relative; min-width: 0; display: flex; gap: 2px; height: 14px; align-items: center; cursor: pointer; touch-action: none; outline-offset: 4px; }
  .track.dense { gap: 0; }
  .track.dense .wedge { min-width: 0; border-radius: 0; box-shadow: inset -1px 0 color-mix(in srgb, var(--bg) 80%, transparent); } /* many chapters: hairline ticks, so the bar can shrink on phones */
  .track.dense .wedge:first-child { border-radius: 2px 0 0 2px; }
  .track.dense .wedge:last-child { border-radius: 0 2px 2px 0; box-shadow: none; }
  .wedge {
    position: relative;
    flex-basis: 0; min-width: 1px; height: 4px; border-radius: 2px; overflow: hidden;
    background: color-mix(in srgb, var(--fg) 14%, transparent);
    transition: height .35s var(--spring), background-color .2s;
  }
  .wedge span { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform .45s var(--ease); }
  .wedge.current { height: 6px; animation: cross .7s cubic-bezier(.34,1.56,.64,1); } /* entering a chapter: it springs */
  /* the capsule comes alive: chapters you've reached take their mood colour; spoken chapters are hatched */
  .wedge.mood span { background: color-mix(in srgb, var(--tint) 70%, var(--accent)); }
  .wedge.mood::after { content: ''; position: absolute; inset: 0; opacity: var(--talk); background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--bg) 55%, transparent) 0 1px, transparent 1px 3px); pointer-events: none; }
  .mk { position: absolute; top: -3px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 1px var(--bg); }
  @keyframes cross { 0% { transform: scaleY(.6); } 45% { transform: scaleY(1.9); } 100% { transform: scaleY(1); } }
  .wedge.probed { height: 10px; background: color-mix(in srgb, var(--fg) 24%, transparent); }
  .knob {
    position: absolute; top: 50%; width: 4px; height: 14px; margin: -7px 0 0 -2px; border-radius: 2px;
    background: var(--fg); box-shadow: 0 0 0 2px var(--surface);
    transition: left .45s var(--ease), height .3s var(--spring), margin .3s var(--spring);
  }
  .knob.active { height: 18px; margin-top: -9px; transition: height .3s var(--spring), margin .3s var(--spring); }
</style>
