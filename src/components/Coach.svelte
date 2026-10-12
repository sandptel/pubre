<script lang="ts">
  // Game-style coach marks: the key (or the finger) shows the move instead of describing it.
  // 'space' points at the pad until you've read once; 'stage' shows the moves inside the Stage the first times.
  let { kind, touch = false, done = false }: { kind: 'space' | 'stage'; touch?: boolean; done?: boolean } = $props()
</script>

{#if kind === 'space'}
  <div class="coach space" class:done role="status">
    {#if touch}
      <span class="tapme" aria-hidden="true"><i class="ripple"></i><i class="ripple r2"></i>
        <svg viewBox="0 0 24 24"><path d="M9 11V5.5a1.5 1.5 0 013 0V10m0-1.5a1.5 1.5 0 013 0V11m0-1a1.5 1.5 0 013 0v4.5a6 6 0 01-6 6h-.8a6 6 0 01-4.6-2.2L4.3 15a1.6 1.6 0 012.3-2.2L9 15" fill="var(--bg)" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
    {:else}
      <span class="key" aria-hidden="true"><span>space</span></span>
    {/if}
    <p>{#if done}<b>Nice. That's it.</b><small>Your place is kept as you go</small>
      {:else if touch}<b>Tap ▶ to read</b><small>Hold it to read only while you hold</small>
      {:else}<b>Press Space to read</b><small>Hold it to read only while held</small>{/if}</p>
    <i class="tail" aria-hidden="true"></i>
  </div>
{:else}
  <div class="coach stage" role="status">
    {#if touch}
      <span class="move"><b class="cap wide">tap</b><small>pause</small></span>
      <span class="move"><b class="cap wide">hold</b><small>glide</small></span>
      <span class="move"><b class="cap wide">slide ↔</b><small>speed</small></span>
    {:else}
      <span class="move"><b class="cap">←</b><b class="cap">→</b><small>step</small></span>
      <span class="move"><b class="cap">↑</b><b class="cap">↓</b><small>paragraph</small></span>
      <span class="move"><b class="cap">[</b><b class="cap">]</b><small>speed</small></span>
      <span class="move"><b class="cap wide">esc</b><small>page</small></span>
    {/if}
  </div>
{/if}

<style>
  .coach { position: fixed; z-index: 60; pointer-events: none; font-family: var(--mono); color: var(--fg); }
  /* above the pad, bouncing in like a game prompt, then floating */
  .space { right: calc(env(safe-area-inset-right) + var(--s3)); bottom: calc(env(safe-area-inset-bottom) + var(--s3) + 74px); display: flex; align-items: center; gap: 14px;
    padding: 12px 18px 12px 14px; border-radius: 18px; background: color-mix(in srgb, var(--accent) 10%, var(--surface)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 30%, var(--hairline)), var(--e2);
    animation: pop-in .6s cubic-bezier(.34,1.56,.64,1) both, float 3s 1s ease-in-out infinite; }
  .tail { position: absolute; right: 26px; bottom: -7px; width: 14px; height: 14px; rotate: 45deg; background: inherit; box-shadow: 1px 1px 0 color-mix(in srgb, var(--accent) 30%, var(--hairline)); }
  p { margin: 0; display: grid; gap: 2px; }
  p b { font: 600 14px var(--mono); letter-spacing: .02em; }
  p small { font: 11.5px var(--mono); color: var(--muted); }

  /* the keycap: a double tap, then a long hold, again and again */
  .key { display: grid; place-items: center; width: 108px; height: 40px; border-radius: 10px; background: var(--bg); color: var(--fg);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--fg) 30%, transparent), 0 6px 0 color-mix(in srgb, var(--fg) 30%, var(--bg)); animation: press 2.6s cubic-bezier(.3,.7,.3,1) infinite; }
  .key span { font: 700 12px var(--mono); letter-spacing: .2em; text-transform: uppercase; }
  .done .key { background: var(--accent); color: var(--bg); animation: none; translate: 0 5px; box-shadow: 0 1px 0 color-mix(in srgb, var(--accent) 60%, #000); }
  .done { animation: pop-in .4s cubic-bezier(.34,1.56,.64,1) both; }

  .tapme { position: relative; width: 40px; height: 40px; display: grid; place-items: center; color: var(--fg); }
  .tapme svg { width: 32px; height: 32px; position: relative; animation: tap 1.6s ease-in-out infinite; }
  .ripple { position: absolute; left: 6px; top: 2px; width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--accent); animation: ripple 1.6s ease-out infinite; }
  .r2 { animation-delay: .25s; }

  /* inside the Stage: the moves as keycaps, along the bottom */
  .stage { left: 50%; translate: -50% 0; bottom: calc(env(safe-area-inset-bottom) + 96px); display: flex; gap: 18px; padding: 10px 16px; border-radius: 16px; white-space: nowrap;
    background: color-mix(in srgb, var(--accent) 8%, var(--surface)); box-shadow: 0 0 0 1px var(--hairline), var(--e2); animation: pop-in .5s cubic-bezier(.34,1.56,.64,1) both, fade-out .6s 6.4s ease both; }
  .move { display: flex; align-items: center; gap: 4px; }
  .move small { margin-left: 4px; font: 11px var(--mono); color: var(--muted); }
  .cap { display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; box-sizing: border-box; border-radius: 7px; background: var(--bg); font: 700 12px var(--mono);
    box-shadow: inset 0 0 0 1.2px color-mix(in srgb, var(--fg) 28%, transparent), 0 3px 0 color-mix(in srgb, var(--fg) 26%, var(--bg)); animation: nudge 2.4s ease-in-out infinite; }
  .move:nth-child(2) .cap { animation-delay: .6s; } .move:nth-child(3) .cap { animation-delay: 1.2s; } .move:nth-child(4) .cap { animation-delay: 1.8s; }
  .cap.wide { text-transform: uppercase; letter-spacing: .08em; font-size: 10.5px; }

  @keyframes pop-in { from { opacity: 0; transform: translateY(16px) scale(.85); } }
  @keyframes float { 50% { transform: translateY(-4px); } }
  @keyframes press { 0%, 8%, 22%, 30%, 46%, 82%, 100% { translate: 0 0; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--fg) 30%, transparent), 0 6px 0 color-mix(in srgb, var(--fg) 30%, var(--bg)); }
    4%, 26%, 50%, 78% { translate: 0 5px; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 70%, transparent), 0 1px 0 color-mix(in srgb, var(--fg) 30%, var(--bg)); } }
  @keyframes tap { 0%, 60%, 100% { transform: translate(0, 0); } 20%, 40% { transform: translate(-2px, -4px) scale(.92); } }
  @keyframes ripple { 0%, 15% { transform: scale(.4); opacity: 0; } 25% { opacity: 1; } 100% { transform: scale(2.6); opacity: 0; } }
  @keyframes nudge { 0%, 20%, 100% { translate: 0 0; box-shadow: inset 0 0 0 1.2px color-mix(in srgb, var(--fg) 28%, transparent), 0 3px 0 color-mix(in srgb, var(--fg) 26%, var(--bg)); }
    10% { translate: 0 2px; box-shadow: inset 0 0 0 1.2px var(--accent), 0 1px 0 color-mix(in srgb, var(--fg) 26%, var(--bg)); } }
  @keyframes fade-out { to { opacity: 0; transform: translateY(8px); } }
  @media (prefers-reduced-motion: reduce) { .coach, .key, .tapme svg, .ripple, .cap { animation: none !important; } }
</style>
