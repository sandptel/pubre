<script lang="ts">
  import type { Settings } from '../lib/settings.ts'
  import { POINTERS } from '../lib/pointers.ts'
  import ReadPreview from './ReadPreview.svelte'

  // Every reading aid, opt-in or out. Used for the global defaults and for one book's overrides.
  /** part: 'guide' = reading guide + contrast (Reading aids); 'look' = lenses + comfort (Themes & Settings); 'all' = both (one book's overrides). */
  let { value = $bindable(), part = 'all' }: { value: Settings; part?: 'guide' | 'look' | 'all' } = $props()

  type Opt = [string, string]
  const stage = $derived(value.guideStyle === 'stage')
  const pkey = $derived<'stagePointer' | 'pointer'>(stage ? 'stagePointer' : 'pointer')
  const pstep = $derived(stage ? value.stageStep : value.step)
  const hard = $derived(!value.hardWords ? 'off' : value.hardStyle)
  function setHard(v: string) {
    if (v === 'off') value.hardWords = false
    else { value.hardWords = true; value.hardStyle = v as Settings['hardStyle'] }
  }
</script>

{#snippet choice(label: string, key: keyof Settings, opts: Opt[], hint = '')}
  <div class="line">
    <span>{label}{#if hint}<small>{hint}</small>{/if}</span>
    <div class="segmented" role="radiogroup" aria-label={label}>
      {#each opts as [v, l]}
        <button role="radio" aria-checked={(value as any)[key] === v} class:on={(value as any)[key] === v} onclick={() => ((value as any)[key] = v)}>{l}</button>
      {/each}
    </div>
  </div>
{/snippet}
{#snippet toggle(label: string, key: keyof Settings, hint = '')}
  <label class="line"><span>{label}{#if hint}<small>{hint}</small>{/if}</span><input type="checkbox" role="switch" bind:checked={(value as any)[key]} /></label>
{/snippet}

{#snippet pointers()}
  <div class="tiles" role="radiogroup" aria-label="Pointer">
    {#if stage}<button role="radio" aria-checked={value.stagePointer === 'ink'} class="tile" class:on={value.stagePointer === 'ink'} onclick={() => (value.stagePointer = 'ink')}>
      <ReadPreview mini step="word" pointer="ink" read={value.inkRead ?? 22} now={value.inkNow ?? 100} ahead={value.inkAhead ?? 46} wpm={150} /><b>Ink</b></button>{/if}
    {#each POINTERS as [id, name, hint]}
      <button role="radio" aria-checked={value[pkey] === id} class="tile" class:on={value[pkey] === id} title={hint} onclick={() => ((value as any)[pkey] = id)}>
        <ReadPreview mini step="word" pointer={id} read={value.inkRead ?? 22} now={value.inkNow ?? 100} ahead={value.inkAhead ?? 46} wpm={150} /><b>{name}</b></button>
    {/each}
  </div>
{/snippet}
{#if part !== 'look'}
<h3>Reading guide</h3>
{#if value.guide}
  <!-- what your choices look like in action, live -->
  <div class="live"><ReadPreview step={pstep ?? 'word'} pointer={value[pkey] ?? 'outline'} read={value.inkRead ?? 22} now={value.inkNow ?? 100} ahead={value.inkAhead ?? 46}
    lenses={value.intensity !== 'quiet' && (stage ? value.stageLenses : true)} wpm={value.wpm} /><span class="live-l">Preview · your settings, in action</span></div>
{/if}
<div class="group">
  {@render toggle('Reading guide', 'guide', 'The round pad, Space or G')}
  {#if value.guide}
    <label class="line"><span>Pace<small>{value.wpm} words a minute · the speed chip by the pad changes it while you read</small></span>
      <input class="pace" type="range" min="120" max="350" step="5" bind:value={value.wpm} aria-label="Words a minute" /></label>
    {@render toggle('Hold the page to read', 'holdToRead', 'Off: holding selects text. In the Stage, long-press a sentence to highlight it')}
    {@render choice('Style', 'guideStyle', [['stage', 'Stage'], ['pointer', 'Pointer']], value.guideStyle === 'stage' ? 'The pad (or Space) lifts the paragraph toward you' : 'A marker moves on the page')}
  {/if}
  {#if value.guide && value.guideStyle === 'stage'}
    {@render choice('Move by', 'stageStep', [['sentence', 'Sentence'], ['phrase', 'Phrase'], ['word', 'Word']], value.stageStep === 'sentence' ? 'A sentence lights up at a time' : 'Words ink in as you go')}
    {#if value.stageStep !== 'sentence'}
      <div class="line col"><span>Pointer<small>How the words you're on are marked</small></span>{@render pointers()}</div>
    {/if}
    {@render toggle('Lenses in Stage', 'stageLenses', 'Names, voices, rare words, your highlights')}
    {@render choice('Paragraph end', 'paraEnd', [['breathe', 'Breathe'], ['wait', 'Wait']], value.paraEnd === 'breathe' ? 'A pause, then the next rises' : 'Waits for a tap')}
    <p class="hint">Tap the round pad (or Space) to start and pause. Hold it to read only while you hold; let go and it goes back to the page. In the Stage, long-press a sentence to keep it as a highlight. While holding, slide right for faster, left for slower and then backwards, up to lock. ← → step, ↑ ↓ paragraph, [ ] pace ({value.wpm} wpm).</p>
  {/if}
  {#if value.guide && value.guideStyle === 'pointer'}
    <div class="line col"><span>Pointer<small>How the words you're on are marked</small></span>{@render pointers()}</div>
    {@render choice('Focus', 'focus', [['sentence', 'Sentence'], ['line', 'Line'], ['paragraph', 'Para']])}
    {@render choice('Step', 'step', [['word', 'Word'], ['phrase', 'Phrase']])}
    {@render toggle('Dim what you’ve read', 'dimRead')}
    <p class="hint">Tap the round pad (or Space) to start and pause; double-tap for the start of the sentence. Hold to glide only while held; slide while holding to change speed, up to lock. → steps (and teaches your pace, {value.wpm} wpm).</p>
  {/if}
</div>

{#if value.guide}
  <h3>Contrast</h3>
  <div class="group">
    <label class="line"><span>Already read<small>{value.inkRead ?? 22}%</small></span><input class="pace" type="range" min="8" max="70" step="2" bind:value={value.inkRead} aria-label="Already read" /></label>
    <label class="line"><span>Being read<small>{value.inkNow ?? 100}%</small></span><input class="pace" type="range" min="60" max="100" step="2" bind:value={value.inkNow} aria-label="Being read" /></label>
    <label class="line"><span>To read<small>{value.inkAhead ?? 46}%</small></span><input class="pace" type="range" min="12" max="90" step="2" bind:value={value.inkAhead} aria-label="To read" /></label>
    <p class="hint">How bright each is, against the page. The preview above follows as you slide.</p>
  </div>
{/if}

{/if}
{#if part !== 'guide'}
<h3>Lenses</h3>
<!-- what the lenses and comfort settings do, on a sample passage -->
<div class="lens-sample" style:letter-spacing="{value.letterSpacing ?? 0}em" style:max-width={value.measure === 'short' ? '22em' : null}>
  {#if value.intensity === 'quiet'}
    “Call me Ishmael,” said the sailor to Queequeg (who smiled), as the binnacle lamp swung; <i>tout est calme</i>.
  {:else}
    <span class:q={value.voices !== 'off'} class:qline={value.voices === 'underline'} class:qmarks={value.voices === 'marks'}>“Call me Ishmael,”</span> said the sailor to
    <span class:nm={value.names}>Queequeg</span> <span class:aside={value.asides}>(who smiled)</span>, as the
    <span class:hw={value.hardWords && value.hardStyle === 'shown'}>binnacle</span> lamp swung; <span class:fr={value.foreign}>tout est calme</span>.
  {/if}
  <span class="ls-l">Sample · {value.intensity === 'quiet' ? 'no marks (Quiet)' : 'names, voices, rare words, asides, other languages'}</span>
</div>
<div class="group">
  {@render choice('Intensity', 'intensity', [['quiet', 'Quiet'], ['guided', 'Guided'], ['rich', 'Rich']], 'How many marks a page may carry')}
  {#if value.intensity !== 'quiet'}
    {@render toggle('Names', 'names', 'Main characters in their colour')}
    <div class="line">
      <span>Hard words<small>{hard === 'story' ? 'Nothing shown until you rest on a word' : 'A few rare words, underlined'}</small></span>
      <div class="segmented" role="radiogroup" aria-label="Hard words">
        {#each [['shown', 'Shown'], ['story', 'Story'], ['off', 'Off']] as [v, l]}
          <button role="radio" aria-checked={hard === v} class:on={hard === v} onclick={() => setHard(v)}>{l}</button>
        {/each}
      </div>
    </div>
    {@render choice('Voices', 'voices', [['ink', 'Ink'], ['underline', 'Line'], ['marks', 'Marks'], ['off', 'Off']], 'Dialogue in the speaker’s colour')}
    {@render toggle('Chapter weather', 'weather', 'Storm, fog, snow or night, as a faint trace on the page')}
    {@render toggle('Chapter openers', 'openers', 'Each chapter opens into its own room')}
    {@render toggle('Chapter colour', 'chapterColour', 'A colourful chapter tints the accent as you enter it')}
    {@render toggle('Asides', 'asides', 'Parentheses and dashes, a step quieter')}
    {@render toggle('Foreign phrases', 'foreign')}
  {/if}
</div>

<h3>Comfort</h3>
<div class="group">
  {@render toggle('Keep controls on screen', 'pinControls', 'Or tap the pin at the top right')}
  {@render toggle('Chapter-end prompts', 'chapterPrompts', '“Three words”, and your open questions')}
  {@render choice('Motion', 'motion', [['full', 'Full'], ['calm', 'Calm']], 'Calm turns off glows and sparks')}
  <div class="line">
    <span>Letter spacing</span>
    <div class="segmented" role="radiogroup" aria-label="Letter spacing">
      {#each [[0, 'Normal'], [0.04, 'Wider'], [0.08, 'Wide']] as [v, l]}
        <button role="radio" aria-checked={value.letterSpacing === v} class:on={value.letterSpacing === v} onclick={() => (value.letterSpacing = v as number)}>{l}</button>
      {/each}
    </div>
  </div>
  <label class="line"><span>Short lines<small>About 40 characters per line</small></span>
    <input type="checkbox" role="switch" checked={value.measure === 'short'} onchange={e => (value.measure = e.currentTarget.checked ? 'short' : 'normal')} /></label>
</div>

{/if}
<style>
  h3 { font: 600 11px var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin: var(--s5) 0 var(--s2); }
  h3:first-child { margin-top: var(--s1); }
  /* outlined panels, not filled: the glass shows through */
  .group { border-radius: var(--r4); background: color-mix(in srgb, var(--bg) 35%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 16%, transparent); padding: 0 var(--s4); }
  .line { display: flex; align-items: center; gap: var(--s3); min-height: 52px; font-size: 13.5px; text-transform: uppercase; letter-spacing: .02em; }
  .line small { text-transform: none; letter-spacing: 0; }
  .line + .line, .line + .hint { border-top: .5px solid var(--hairline); }
  .line > span:first-child { flex: 1; display: grid; }
  small { font-size: 12px; color: var(--muted); }
  .hint { font-size: 12px; color: var(--muted); margin: 0; padding: var(--s2) 0 var(--s3); line-height: 1.45; }
  .lens-sample { position: relative; margin-bottom: var(--s2); padding: 12px 14px 26px; border-radius: var(--r3); background: var(--bg); box-shadow: inset 0 0 0 1px var(--hairline); font: 17px/1.65 var(--serif); color: var(--fg); transition: letter-spacing .2s; }
  .lens-sample .q { color: var(--base0D, var(--accent)); }
  .lens-sample .q.qline { color: inherit; text-decoration: underline 2px color-mix(in srgb, var(--base0D, var(--accent)) 60%, transparent); text-underline-offset: 4px; }
  .lens-sample .q.qmarks { color: inherit; }
  .lens-sample .nm { color: var(--base0E, var(--accent)); background: color-mix(in srgb, var(--base0E, var(--accent)) 14%, transparent); border-radius: 3px; text-decoration: underline 1px color-mix(in srgb, var(--base0E, var(--accent)) 35%, transparent); }
  .lens-sample .aside { opacity: .6; }
  .lens-sample .hw { text-decoration: underline dotted 2px color-mix(in srgb, var(--accent) 80%, transparent); text-underline-offset: 4px; }
  .lens-sample .fr { font-style: italic; color: var(--base0C, var(--accent)); }
  .ls-l { position: absolute; left: 14px; bottom: 6px; font: 600 9.5px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .live { position: sticky; top: 0; z-index: 2; display: grid; gap: 4px; padding: 6px 0 10px; margin: 0 calc(-1 * var(--s1)) var(--s2); padding-inline: var(--s1); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
  .live-l { font: 600 10px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .line.col { flex-direction: column; align-items: stretch; gap: var(--s2); padding: var(--s3) 0; text-transform: none; }
  .line.col > span:first-child { text-transform: uppercase; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: var(--s2); }
  .tile { border: 0; padding: 6px; border-radius: var(--r3); background: transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 14%, transparent); display: grid; gap: 6px; text-align: left; color: var(--fg); transition: box-shadow .2s, transform .3s var(--spring); }
  .tile b { font: 600 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; padding: 0 4px 2px; }
  .tile.on { box-shadow: inset 0 0 0 2px var(--accent); }
  .tile:active { transform: scale(.97); }
  .pace { width: 38%; flex: none; accent-color: var(--accent); }
  /* Phones: a choice sits under its label, full width, instead of squeezing the label into a column. */
  @media (max-width: 460px) {
    .line:has(.segmented), .line:has(.pace) { flex-wrap: wrap; row-gap: var(--s2); padding: var(--s3) 0; }
    .line:has(.segmented) > span:first-child, .line:has(.pace) > span:first-child { flex-basis: 100%; }
    .line .segmented { width: 100%; }
    .line .segmented button { flex: 1; }
    .line .pace { width: 100%; }
  }
  .segmented { display: flex; background: transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 18%, transparent); border-radius: 999px; padding: 3px; flex: none; }
  .segmented button { border: 0; background: transparent; border-radius: 7px; padding: 5px 9px; min-height: 36px; font-size: 13px; transition: background-color .25s var(--ease); }
  .segmented button { border-radius: 999px; font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .segmented .on { background: var(--ink); color: var(--on-ink); font-weight: 600; }
  input[role=switch] {
    appearance: none; flex: none; width: 64px; height: 30px; border-radius: 15px; margin: 0; position: relative; cursor: pointer;
    background: transparent; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--fg) 45%, transparent); transition: background-color .25s;
  }
  input[role=switch]::before {
    content: 'OFF'; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%;
    background: var(--fg); transition: transform .3s var(--spring); font: 600 9px/24px var(--mono); text-indent: 28px; color: var(--fg); letter-spacing: .06em;
  }
  input[role=switch]:checked { background: var(--ink); box-shadow: none; }
  input[role=switch]:checked::before { content: 'ON'; transform: translateX(34px); background: var(--on-ink); color: var(--on-ink); text-indent: -24px; }
</style>
