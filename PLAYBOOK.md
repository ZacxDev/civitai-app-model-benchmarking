# Design-System Migration + Polish Playbook

The concrete, copy-pasteable procedure for bringing a Civitai first-party App Block
onto **`@civitai/blocks-react@0.35.2` + `@civitai/theme@0.2.0`** and polishing it from
proof-of-concept to production. This app (`model-benchmarking`) is the reference
implementation — the other first-party apps should follow this **verbatim**.

Everything below was discovered by introspecting the actually-installed packages
(`node_modules/@civitai/theme/dist/tokens.css`, `@civitai/blocks-react/dist/ui/*`),
not from memory. Re-introspect if the versions move.

---

## Phase 0 — pin the exact versions

`package.json` → `dependencies`:

```jsonc
"@civitai/app-sdk": "^0.26.0",      // REQUIRED: blocks-react 0.35.2 peer-requires ^0.26.0
"@civitai/blocks-react": "^0.35.2",
"@civitai/theme": "^0.2.0",         // NEW direct dep — the token source
```

Then `npm install`. Verify the resolved versions:

```bash
for p in blocks-react theme app-sdk; do
  node -e "console.log('@civitai/$p', require('./node_modules/@civitai/'+'$p'+'/package.json').version)"
done
# expect: blocks-react 0.35.2 · theme 0.2.0 · app-sdk 0.26.0
```

> 🔴 **The app-sdk bump to 0.26 is not optional.** `@civitai/blocks-react@0.35.2`
> declares `peerDependencies: { "@civitai/app-sdk": "^0.26.0" }`. Staying on 0.25
> gives an unmet-peer install. See the **`WorkflowBody` drift** gotcha below — the
> 0.26 SDK changes a shared type, and that reconciliation is part of the migration.

---

## Phase 1 — adopt the design system (objective)

### 1a. Import the token stylesheet once, at the entry point

In `src/main.tsx`, alongside the existing `injectBlocksStyles()`:

```ts
import { BlockGate, injectBlocksStyles } from '@civitai/blocks-react/ui';
import '@civitai/theme/styles.css';   // <-- ADD: the --civitai-* custom properties
```

`injectBlocksStyles()` (already called) *also* injects the tokens at runtime (it
imports `tokensCss` from `@civitai/theme` + `componentsCss` from `@civitai/components`),
so tokens are technically live without the import. Import the stylesheet anyway so
`@civitai/theme` is an **explicit, first-paint** token source and a real direct
dependency — not a transitive side-effect of the pack.

### 1b. Light/dark is driven by `[data-theme]` — you already set it

The block root already carries the host theme:

```tsx
const { theme } = useBlockContext();          // 'light' | 'dark'
return <div data-theme={theme} style={pageStyle(c)}>…</div>;
```

The tokens are defined on `:root` / `[data-theme='light']` / `[data-theme='dark']`
selectors, and CSS custom properties **inherit**, so every descendant (yours + the
pack's) resolves the right value automatically. **You do not compute light/dark in
JS** — that is the whole point. Any `palette(isDark)` boolean plumbing gets deleted.

### 1c. The actual token names (`@civitai/theme@0.2.0`)

**Theme-AWARE** (these flip between `[data-theme='light']` and `[data-theme='dark']`) —
use these for anything that must respond to the theme:

| Token | Purpose | light → dark |
|---|---|---|
| `--civitai-color-text` | primary text | `#222` → `#C1C2C5` |
| `--civitai-color-text-dimmed` | secondary / muted text | `#868e96` → `#8c8fa3` |
| `--civitai-color-body` | page background | `#fefefe` → `#1A1B1E` |
| `--civitai-color-surface` | card / panel background | `#fefefe` → `#1A1B1E` |
| `--civitai-color-surface-2` | elevated surface | `#fefefe` → `#25262B` |
| `--civitai-color-border` | hairline borders | `#ced4da` → `#373A40` |
| `--civitai-color-primary` (+ `-hover`, `-fg`, `-light`) | accent | `#228BE6` → `#1971C2` |
| `--civitai-color-error` / `-success` / `-warning` / `-info` | semantic | (each flips) |

Plus non-color: `--civitai-radius` (`0.25rem`), `--civitai-font`, `--civitai-font-mono`.

> 🔴 **Trap: the `--civitai-color-gray-0..9` ramp is theme-INVARIANT.** It is NOT
> redefined under `[data-theme='dark']`, so `gray-1` stays `#f1f3f5` (near-white) in
> BOTH themes. **Never use a `gray-*` token for a theme-responsive surface** — it
> looks fine in light and breaks in dark. Use the theme-aware tokens above.

> 🔴 **Trap: in LIGHT theme `body == surface == surface-2 == #fefefe`.** Cards do
> NOT get a fill contrast in light mode — the design system delineates them with
> **borders**, not background steps. So: give panels a `1px solid var(--civitai-color-border)`
> and don't rely on a darker/lighter card fill to separate them.

### 1d. The reusable token module (`src/theme.ts`)

Instead of scattering `var(--civitai-...)` strings, centralize them. This is the
pattern to copy into every app:

```ts
export const token = {
  text: 'var(--civitai-color-text)',
  dimmed: 'var(--civitai-color-text-dimmed)',
  body: 'var(--civitai-color-body)',
  surface: 'var(--civitai-color-surface)',
  surface2: 'var(--civitai-color-surface-2)',
  border: 'var(--civitai-color-border)',
  primary: 'var(--civitai-color-primary)',
  primaryLight: 'var(--civitai-color-primary-light)',
  error: 'var(--civitai-color-error)',
  success: 'var(--civitai-color-success)',
  radius: 'var(--civitai-radius)',
  font: 'var(--civitai-font)',
} as const;

export const radius = { sm: token.radius, md: `calc(${token.radius} * 2)`, lg: `calc(${token.radius} * 3)` };

// A subtle, theme-agnostic elevation that WORKS IN BOTH THEMES (unlike surface-2,
// which equals body in light). Mix a little text into surface:
export const elevate = (pct: number) =>
  `color-mix(in srgb, var(--civitai-color-text) ${pct}%, var(--civitai-color-surface))`;

export const mutedText = { color: token.dimmed, fontSize: 13, lineHeight: 1.5 } as const;
export const metaText  = { color: token.dimmed, fontSize: 12, lineHeight: 1.45 } as const;
```

`color-mix` is safe — the pack itself already emits it (e.g. Badge light variant).

### 1e. Kill every hardcoded color / opacity-muted text

- Replace every hex literal with a `token.*` reference. (This app had a
  `palette(dark)` returning ~16 hex values → now returns `var()` refs, no boolean.)
- Replace **stale `--ci-*` fallbacks** — the pre-0.35 pack used `--ci-color-*`; the
  new one is `--civitai-color-*`. `grep -rn "--ci-" src` and fix each
  (`var(--ci-color-error, #e03131)` → `var(--civitai-color-error)`).
- Replace opacity-based muting (`style={{ opacity: 0.6 }}`) with the dimmed token at
  full opacity (`style={metaText}`). It's crisper and hits the intended contrast
  instead of stacking opacity on an already-dimmed color.

Audit gate: `grep -rn "#[0-9a-fA-F]\{3,6\}\|opacity:\|--ci-" src --include=*.tsx | grep -v test`
should come back empty (or only legitimate non-color opacity).

### 1f. Use the `/ui` components for ALL UI — the actual inventory

`@civitai/blocks-react@0.35.2` exports from **`@civitai/blocks-react/ui`**:

```
Alert · Badge · Button · Card · Collapse · Group · Loader · Modal ·
NumberInput · SegmentedControl · Select · Slider · Stack · TextInput · Textarea ·
BlockGate · SettingsForm            (+ injectBlocksStyles, useBlocksStyles)
```

There is **no** Tooltip / Tabs / Divider / Text-Title primitive — for those, use a
plain element styled off `token.*` (e.g. a divider = `borderBottom: 1px solid token.border`).

Replace every hand-rolled control with the pack equivalent. In this app the last
hold-outs were **raw `<button>`s in the results grid** ("Run this cell", Confirm,
Cancel, Dismiss) — swapped to `<Button>`, which is where all the hover/focus/active/
disabled states come from for free.

Component API (verified from the `.d.ts`):
- **`<Button>`** — `variant: 'filled'|'light'|'outline'|'subtle'` (default `filled`);
  `size: 'sm'|'md'|'lg'` (default `md`, **no `xs`**); `color: 'primary'|'error'|'success'|'warning'|'info'|<css>`;
  `loading` (spinner + disables); `fullWidth`; `leftSection`/`rightSection`. Forwards
  all native `<button>` props (`data-testid`, `disabled`, `onClick`, `aria-*`).
- **`<Badge>`** — same `variant`/`size`/`color` shape. (Renders uppercase.)
- **`<Loader size="sm"|"md"|"lg">`** — the pack spinner; use it for in-flight states.
- **`<Group>` / `<Stack>`** — fl/flex helpers with `gap`, `justify`, `align`.

> 🔴 **Gotcha: `<Group wrap>` is a BOOLEAN, not the CSS string.** `wrap` defaults to
> `true`. Write `wrap` / `wrap={false}` — **never `wrap="wrap"`** (that's a TS error:
> `Type 'string' is not assignable to type 'boolean'`).

---

## Phase 2 — the polish checklist (subjective, the important part)

Applied in this app; apply the same to each:

- **Visual hierarchy / identity** — give the header a brand mark (a tinted
  `radius.md` tile with an inline SVG glyph matching the manifest `icon`, colored
  `token.primary` on `token.primaryLight`) + a hairline `borderBottom` divider under
  the header. Title `~19px`, negative letter-spacing; subtitle in `metaText`.
- **Spacing & rhythm** — one gap scale on the content wrapper
  (`padding: clamp(14px,3vw,24px)`, `gap: 18`); consistent `gap` on every Stack/Group.
- **Typography** — two muted styles only (`mutedText` 13px, `metaText` 12px), both
  the dimmed token at full opacity; numeric counts use `fontVariantNumeric: 'tabular-nums'`.
- **Interaction states** — hover/focus/active/disabled: get them from pack `<Button>`;
  never hand-roll a clickable `<div>`/`<button>` without them.
- **Loading state** — pack `<Loader>` + a `metaText` label, centered, not a bare word.
- **Empty state** — a dashed, token-bordered panel (`EmptyState.tsx`) with a title, a
  muted line, AND the primary action inline (never a lonely "nothing here" string).
- **Error state** — pack `<Alert color="error">`; inline cell errors use `token.error`.
- **Responsive** (resizable iframe) — `Group` wraps by default; add
  `flex: '1 1 260px'; min-width: 0` to the text side of a text+button row so the
  button wraps cleanly on narrow. Wide tables/matrices live inside an
  `overflow-x: auto` container so the page body never scrolls sideways. Test at
  ~420px and ~1180px.
- **Accessibility** — every control has an accessible name (`aria-label` on icon /
  short-label buttons, e.g. `aria-label={`Run ${config} on ${prompt}`}`); toggle
  controls carry `aria-pressed`; in-flight regions use `role="status" aria-live="polite"`;
  form inputs use the pack's `label` prop (already wired). Contrast: prefer the dimmed
  token over stacked opacity so muted text stays legible in both themes.
- **Micro-polish** — `leftSection` icon affordances (▶ on run, ▲ on vote), tabular
  numerals, `toLocaleString()` on big counts (`6,200 Buzz`).

---

## Phase 3 — the `WorkflowBody` drift (only if the app builds a generation body)

🔴 **`@civitai/app-sdk@0.26` turned `WorkflowBody` into a discriminated union**
(`WorkflowBodyTextToImage | WorkflowBodyCustomComfy`, keyed by `kind`). Code that
built a `textToImage` body typed as `WorkflowBody` and then read `.modelVersionId` /
`.params.negativePrompt` etc. now fails to typecheck (those fields live only on the
`textToImage` member). **Fix = type the builder to the specific member** (behavior-
preserving, no logic change):

```ts
import type { BlockTextToImageParams, WorkflowBodyTextToImage } from '@civitai/app-sdk/blocks';

function buildBody(...): WorkflowBodyTextToImage {          // was: WorkflowBody
  const params: BlockTextToImageParams = { prompt };       // was: WorkflowBody['params']
  const body: WorkflowBodyTextToImage = { kind: 'textToImage', modelId, modelVersionId, params };
  …
}
```

`WorkflowBodyTextToImage` is assignable to `WorkflowBody`, so `submit()`/`estimate()`
call-sites are unchanged.

---

## Verify (required — this is a UI task)

1. **Typecheck / build / test** — all three must be green:
   ```bash
   npx tsc -p tsconfig.json --noEmit      # typecheck
   npm run build                          # tsc + vite build
   npx vitest run                         # tests
   ```
2. **Run it + screenshot both themes** via the standalone dev harness. The harness
   (`@civitai/blocks-react/testing`) honors URL toggles — **`?theme=light`** overrides
   the harness's default theme with **zero code change** (it's spread after the props):
   ```bash
   npm run dev:harness                     # → http://localhost:5189
   # then drive http://localhost:5189/?theme=dark  and  ?theme=light
   ```
   Screenshot combos / prompts / grid / a submit modal, at a narrow (~420px) and wide
   (~1180px) viewport, in **both** themes. Capture BEFORE (on `main`) and AFTER (your
   branch). This repo's set is in `docs/screenshots/` (driven by a Playwright script
   pointed at the harness).
3. **Confirm the block still works** — the manifest, postMessage handshake, scopes,
   and generation/estimate/publish path are untouched by a design pass. Don't change
   `block.manifest.json`, the SDK hook wiring, or the `deps` seams.

---

## The definition of done

- [ ] `blocks-react@0.35.2` + `theme@0.2.0` + `app-sdk@0.26.0` installed; `@civitai/theme/styles.css` imported.
- [ ] Zero hardcoded hex, zero `--ci-*`, zero opacity-muted text (`grep` is clean).
- [ ] All UI is pack `/ui` components (no raw styled `<button>`/`<div>` controls); `Group wrap` is boolean.
- [ ] Light + dark both verified in screenshots; card separation works in light (borders, not fills).
- [ ] Loading / empty / error states, hover/focus/disabled, and narrow+wide layouts all handled.
- [ ] Accessible names + `aria-pressed`/`role=status` where relevant.
- [ ] `tsc`, `npm run build`, `vitest` all green; block behavior/manifest unchanged.
