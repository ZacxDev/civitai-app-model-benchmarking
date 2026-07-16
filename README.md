# Model Benchmarking — Civitai App Block (Phase 1)

A full-page, first-party Civitai App Block: a **crowdsourced model-comparison grid**.
Users submit + vote on checkpoint+LoRA **combinations** and multi-ecosystem
**prompts**; the top-voted set forms a **combinations × prompts** matrix; anyone
can **run** an included cell (matched to the combination's ecosystem) and the
outputs publish to a **shared** grid so every model compares side-by-side on
identical prompts.

blockId `model-benchmarking` · version `0.1.0` · page app.

## Product (Phase 1, crowdsourced)

- **Submit + vote on combinations** — a checkpoint (any base model) + a
  family-scoped weighted LoRA stack.
- **Submit + vote on prompts** — each prompt is **multi-ecosystem**: one raw
  prompt string + generation params per ecosystem (SDXL / Pony / Flux / …).
- **Included set** — top-N by votes (combos → rows, prompts → cols), derived
  client-side, N configurable in the Grid tab.
- **Run a cell** — pick an included (combination × prompt) cell; the app maps the
  combo's `baseModel` → ecosystem and runs the prompt's entry for that ecosystem;
  best-effort dedup (a cell already in the grid isn't re-run); on completion the
  scanned outputs are **published** and a `result` row is appended to the shared
  grid so ALL viewers see them.
- **Browse the grid** — combos (rows) × prompts (cols); each cell renders that
  combo's outputs on that prompt via the **per-viewer gated read**.

## Data model (shared storage; moderation split)

One append-only shared list holds three record kinds, discriminated by
`data.kind` and versioned (`data.v: 1`, defensively parsed/migrated on read):

| kind | `title` / `body` (MODERATED text) | `data` (opaque, unmoderated) |
|---|---|---|
| `combination` | name / description + resource display names | `{v:1, kind, checkpoint:{versionId,modelId,baseModel,…}, loras:[{versionId,weight,min/maxStrength,…}]}` |
| `prompt` | name / description + **every** per-ecosystem prompt + negative | `{v:1, kind, byEcosystem:{[eco]:{prompt, params}}}` |
| `result` | terse machine label | `{v:1, kind, comboKey, promptKey, ecosystem, imageIds:number[]}` |

The split mirrors the shipped `custom-generators` block: `collectVisibleText`-style
sweeping of ALL user-authored text into the moderated `title`/`body`; `data` holds
only ids/params/refs. See `src/lib/benchmark.ts`.

## Ecosystem matching

`src/lib/ecosystem.ts` maps a checkpoint's precise `baseModel` string (e.g.
`"SDXL 1.0"`, `"Pony"`, `"Flux.1 D"`) to an ecosystem **group key** (the key a
prompt's `byEcosystem` map is keyed by). SDXL-derivatives (Pony/Illustrious/NoobAI)
win over the generic SDXL rule; unknowns fall to an explicit `Other` bucket. A
cell is runnable iff the prompt has an entry for the combo's ecosystem — otherwise
the grid cell is a disabled **N/A** with a clear note.

## SDK hooks + scopes wired

Targets **`@civitai/app-sdk@^0.25.0`** + **`@civitai/blocks-react@^0.30.0`**.

| Hook | Use |
|---|---|
| `useResourcePicker` | pick checkpoint, then LoRAs family-scoped via `baseModelGroup` |
| `useGenerationResources` | (rehydrate resource metadata) |
| `useBuzzWorkflow` | estimate → submit → poll the cell run |
| `useBuzzBalance` | show the wallet |
| `useSharedStorage` | list / append / **vote / unvote** / (withdraw) combos, prompts, results |
| `useRequestConsent` / `useRequestSignIn` | gate the consent-gated generation scope |
| **`usePublishGenerationOutputs`** (0.30) | after a cell completes → `{ imageIds }` published to the grid |
| **`useGatedImages`** (0.30) | per-viewer gated display data for grid cells (the moderation boundary) |

**Declared scopes** (`block.manifest.json`, in lockstep with `src/scopes.ts`):
`ai:write:budgeted`, `buzz:read:self`, `apps:storage:shared:read`,
`apps:storage:shared:write`. No per-user KV (`apps:storage:read/write`) — Phase 1
keeps no private per-viewer state.
🔴 Whether `useGatedImages` needs an extra `images:read`-style scope is **unconfirmed**
(0.30 was not on npm at build time); under-declaring fails closed, so add it from
the 0.30 dist if the host rejects the gated read.

## 🔴 The 0.30 bridge (`src/lib/generation-bridge.ts`)

`@civitai/blocks-react@^0.30` (with `usePublishGenerationOutputs` + `useGatedImages`)
was **not yet published** when this block was built (latest was 0.29). Those two
hooks are accessed **defensively** off the package namespace behind normalized
adapters + local types, so typecheck/test/build pass against 0.29 and the real
hooks are picked up at runtime the moment 0.30 is installed — **no code change**.
Both are also routed through the App's injectable `deps` bag, so the test suite
drives the publish + gated-visible + gated-hidden paths with fakes and never
touches the real hooks. **When 0.30 lands**: read
`node_modules/@civitai/blocks-react/dist/hooks/usePublishGenerationOutputs.d.ts` +
`useGatedImages.d.ts` and tighten the adapters in that one file to the real
names/shapes.

## UI (the `@civitai/blocks-react/ui` pack)

All UI is built on the pack (Button/TextInput/Textarea/Card/Stack/Group/Alert/
Loader/Badge/Modal/Slider/NumberInput/Select + `injectBlocksStyles`/`data-theme`).
Two intentional exceptions, both on the pack's `--ci-*` CSS vars so they stay
auto-themed in light + dark:

- **`SegmentedControl`** (`src/components/SegmentedControl.tsx`) — the combos /
  prompts / grid view-switcher. VENDORED because the pack lacks a view-switcher;
  a companion PR adds it to `@civitai/blocks-react/ui`. Delete this file and
  switch to the pack export once that PR ships (the API is identical by design).
- **The results matrix** (`src/components/ResultsGrid.tsx`) + the **vote control**
  (`src/components/VoteButton.tsx`) — hand-rolled: the matrix data-layout is too
  bespoke for the pack (per the App Blocks component-pack rule), and the vote
  control is an app-policy composition of the pack's Button + Badge.

## Develop / validate

```bash
npm install
npm run dev:harness   # local mock host (seeded combos/prompts) at :5189
npm run typecheck     # tsc --noEmit
npm test              # vitest: node (pure logic) + jsdom (component/e2e)
npm run build         # tsc + vite build → dist/
```

## Deferred to Phase 2

- **Vote-state persistence** across reloads — the host `list()` returns a vote
  `count` but not "did THIS viewer vote"; Phase 1 tracks the viewer's votes
  optimistically in memory (idempotent server-side). A host per-viewer vote read
  would make the ▲ state durable.
- **Cross-viewer live run coordination** — dedup is best-effort first-append-wins
  (two racing runners can both publish; the earliest key wins on read). A host
  lock / claim would make generate-once strict.
- **Resource rehydrate on browse** — combos store display names in the moderated
  body already; `useGenerationResources` wiring exists but a full metadata refresh
  on the grid is deferred.
- **Result curation / re-run** — no owner controls to hide/replace a published
  cell yet; withdraw exists on the shared row but isn't surfaced.
- Richer per-ecosystem param editing (samplers dropdown, dimensions presets).
