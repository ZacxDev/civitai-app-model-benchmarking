# Model Benchmarking — a Civitai App Block

**An open-source, reference [Civitai](https://civitai.com) App Block: a
crowdsourced model-comparison grid.** Read it to learn how a real block is wired
to the host platform — cross-user image **publish + gated read**, a shared
community list you can **vote** on, the Buzz **generation-workflow** bridge, the
**resource picker**, and the `@civitai/blocks-react/ui` component pack — all
against the *published* SDK packages, with a mock host so you can run it in two
commands.

🔗 **Live:** [civitai.com/apps/run/model-benchmarking](https://civitai.com/apps/run/model-benchmarking)

> The app is served from its own origin (`model-benchmarking.civit.ai`) purely to be
> **embedded** by the Civitai page host — open it via the `/apps/run/…` link above, not
> the bare subdomain (loaded on its own it has no host to hand it a viewer/session, so it
> just shows a loading state). See [Handling direct traffic](#handling-direct-traffic).

> **This is a reference/example, not the canonical deployment.** It demonstrates
> the App Blocks platform seams; the production app is deployed separately. An App
> Block holds **no credentials and no infrastructure** — it's a static SPA the
> host embeds; the viewer identity + a scoped token are injected at runtime.

## New to App Blocks?

An **App Block** is a small web app that Civitai hosts inside a **sandboxed
iframe** on civitai.com. Your block is just a static SPA; everything it needs from
the platform — who's viewing, their Buzz balance, the model/LoRA picker, the
ability to run a generation, cross-user storage, moderated image reads — arrives
through a **host↔block bridge** (postMessage under the hood). In this repo that
bridge is a set of React hooks from `@civitai/blocks-react`. The block never holds
credentials: the host injects the viewer identity and a scoped token at runtime.

This particular block is a **crowdsourced benchmark**. Users **submit + vote on**
two things: model **combinations** (a checkpoint + a family-scoped weighted LoRA
stack) and multi-ecosystem **prompts** (one prompt string + params per ecosystem,
e.g. SDXL / Pony / Flux). The top-voted set forms a **combinations × prompts
matrix**; anyone can **run** an included cell (the app matches the combo's base
model to the prompt's ecosystem entry and spends their own Buzz), and the scanned
outputs **publish to a shared grid** so every model compares side-by-side on
identical prompts — for **all** viewers.

> **The platform has no concept of a "benchmark," "combination," or "grid."** That
> entire model is owned by this app. The platform only provides generic,
> capability-scoped seams (a resource picker, a Buzz workflow bridge, cross-user
> shared storage, a generation-output publish + a per-viewer gated image read).
> This repo is a **reference** for wiring those seams — [`src/App.tsx`](src/App.tsx)
> owns every host hook, and [`src/lib/`](src/lib) holds the pure, unit-tested core.

## Quickstart

No account, no network, no config — the SDK's mock host answers the full block
protocol locally (seeded with demo combos/prompts), so you can see the app running
immediately:

```bash
git clone https://github.com/ZacxDev/civitai-app-model-benchmarking
cd civitai-app-model-benchmarking
npm install
npm run dev:harness      # → mock host at http://localhost:5189
```

Want to run against the *real* production host with live reload? See
[Develop](#develop) below.

## What this demonstrates → where to look

Every host capability is a React hook from
[`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react),
assembled into an injectable dependency bag in [`src/App.tsx`](src/App.tsx) (so the
whole app is testable against the SDK's mock host with canned picks / workflows /
publish / gated reads). If you're here hunting "how do I do X in a block," jump
straight to the file:

| Capability | Primitive | Where to look |
|---|---|---|
| **Publish a generation's own outputs** (the G1 seam) — a completed run's scanned images → bare, app-scoped `Image` rows | `usePublishGenerationOutputs()` | [`App.tsx`](src/App.tsx) (`publish` in `deps`, called on run completion) |
| **Gated cross-user image read** — the per-viewer moderation boundary for grid cells | `useGatedImages()` | [`GatedCell.tsx`](src/components/GatedCell.tsx) (`getImages` → per-viewer display data) |
| **Cross-user shared storage + voting** — the community list of combos, prompts, and published results | `useSharedStorage()` | [`App.tsx`](src/App.tsx) (`list`/`append`/`vote`/`unvote`/`withdraw`/`getCounts`), [`CombosView`](src/components/CombosView.tsx) / [`PromptsView`](src/components/PromptsView.tsx) |
| **Buzz generation-workflow bridge** — the money path | `useBuzzWorkflow()` | [`App.tsx`](src/App.tsx) (estimate → submit → poll), [`lib/workflow.ts`](src/lib/workflow.ts) (poll loop) |
| **Resource picker** — the checkpoint / LoRA modal, LoRAs family-scoped | `useResourcePicker()` | [`CombinationForm.tsx`](src/components/CombinationForm.tsx) (via the `pickResource` prop, `baseModelGroup`-scoped) |
| **Generation-resource rehydrate** — resource metadata by id | `useGenerationResources()` | [`App.tsx`](src/App.tsx) (`resolveResources`) |
| **Buzz balance** — show the wallet / gate cost | `useBuzzBalance()` | [`App.tsx`](src/App.tsx) |
| **Consent + sign-in gating** for the generation scope | `useRequestConsent()` / `useRequestSignIn()` | [`scopes.ts`](src/scopes.ts), [`App.tsx`](src/App.tsx) |
| **Context / token / auto-resize** | `useBlockContext()`, `useBlockToken()`, `useBlockResize()` | [`App.tsx`](src/App.tsx) |
| **Component pack** — every input/layout primitive | `@civitai/blocks-react/ui` | throughout `src/components/` |

A few notes worth calling out:

- **Publish + gated read are two halves of one cross-user seam.** When a viewer
  runs a cell, `usePublishGenerationOutputs().publish({ workflowId, … })` turns that
  run's *own* scanned outputs into bare, **app-scoped** `Image` rows and returns
  their ids — which get written into a shared `result` row. Any *other* viewer then
  renders that cell through `useGatedImages().getImages(...)`, which returns
  **per-viewer** display data respecting that viewer's moderation settings. The
  block never sees a raw cross-user image URL; the gate is enforced host-side.
- **Shared storage is append-only, votable, and author-scoped.**
  `useSharedStorage()` exposes `list` / `append` / `vote` / `unvote` / `withdraw` /
  `getCount(s)`. **Submit** = `append({ title, body, data })`; **upvote** =
  `vote(key)` (idempotent server-side); **delete your own** = `withdraw(key)`. The
  included set (top-N by votes) is derived **client-side** from `list` + counts.
- **The Buzz bridge never sees credentials.** `estimate(body)` prices a cell run,
  `submit(body)` charges the viewer's Buzz, `poll(workflowId)` runs to a terminal
  snapshot. The host injects the token + viewer identity.
- **The generation scope (`ai:write:budgeted`) is consent-gated.** The first token
  is minted without it; the runner checks the live token scopes
  ([`hasGenerateScope`](src/scopes.ts)) and requests consent before spending.

## Architecture

Three tabs, routed by [`src/App.tsx`](src/App.tsx) through a `SegmentedControl`;
submit flows are modals:

- **Combos** ([`CombosView.tsx`](src/components/CombosView.tsx) +
  [`CombinationForm.tsx`](src/components/CombinationForm.tsx)) — submit + vote on a
  checkpoint (any base model) plus a family-scoped weighted LoRA stack, picked via
  the resource picker.
- **Prompts** ([`PromptsView.tsx`](src/components/PromptsView.tsx) +
  [`PromptForm.tsx`](src/components/PromptForm.tsx)) — submit + vote on a
  **multi-ecosystem** prompt: one raw prompt string + generation params *per
  ecosystem* (SDXL / Pony / Flux / …).
- **Grid** ([`ResultsGrid.tsx`](src/components/ResultsGrid.tsx)) — the top-N combos
  (rows) × top-N prompts (cols) matrix. Each runnable cell (the prompt has an entry
  for the combo's ecosystem) can be **run**; each cell renders that combo's
  published outputs on that prompt via the per-viewer gated read
  ([`GatedCell.tsx`](src/components/GatedCell.tsx)). Non-matching cells are a
  disabled **N/A**.

The pure, node-testable core lives in [`src/lib/`](src/lib):
[`benchmark.ts`](src/lib/benchmark.ts) (the data-model parse/migrate, `WorkflowBody`
construction, top-N-by-votes, optimistic reconcile, the moderated-text/opaque-data
split), [`ecosystem.ts`](src/lib/ecosystem.ts) (base-model → ecosystem matcher),
[`gen-defaults.ts`](src/lib/gen-defaults.ts), and [`workflow.ts`](src/lib/workflow.ts)
(the poll loop).

### The stored value shape (moderation boundary)

One append-only shared list holds three record kinds, discriminated by `data.kind`
and versioned (`data.v: 1`, defensively parsed/migrated on read). Every record
splits into a **moderated** half and an **opaque** half:

| kind | `title` / `body` (MODERATED text) | `data` (opaque, unmoderated) |
|---|---|---|
| `combination` | name / description + resource display names | `{ v, kind, checkpoint:{versionId,modelId,baseModel,…}, loras:[{versionId,weight,…}] }` |
| `prompt` | name / description + **every** per-ecosystem prompt + negative | `{ v, kind, byEcosystem:{[eco]:{prompt, params}} }` |
| `result` | terse machine label | `{ v, kind, comboKey, promptKey, ecosystem, imageIds:number[] }` |

- **`title` / `body`** → **all user-visible text**. This is what the platform's text
  content-safety belt moderates. All authored text is swept here.
- **`data`** → the **opaque, app-owned structured config** (ids / weights / params /
  the published `imageIds`). Unmoderated — it carries no user-visible text that
  isn't *also* in `title`/`body`. Resource ids in `data` are **discovery-only
  hints**; the server re-validates and re-prices every id at estimate/submit.

See the parse/migrate tests in [`lib/benchmark.test.ts`](src/lib/benchmark.test.ts).

### Ecosystem matching

[`src/lib/ecosystem.ts`](src/lib/ecosystem.ts) maps a checkpoint's precise
`baseModel` string (e.g. `"SDXL 1.0"`, `"Pony"`, `"Flux.1 D"`) to an ecosystem
**group key** (the key a prompt's `byEcosystem` map is keyed by). SDXL-derivatives
(Pony / Illustrious / NoobAI) win over the generic SDXL rule; unknowns fall to an
explicit `Other` bucket. A cell is runnable **iff** the prompt has an entry for the
combo's ecosystem.

## Handling direct traffic

An App Block is served from its **own origin** (`<slug>.civit.ai`) but is designed to run
**embedded** inside the Civitai page host at `civitai.com/apps/run/<slug>`. The host is what
hands the block its runtime context — the viewer, a scoped session token, and the theme —
over a `postMessage` `BLOCK_INIT` handshake (see `useBlockContext()`).

So if you open the bare `<slug>.civit.ai` URL **directly** (a top-level navigation, not
inside the host iframe), there is no parent host to send `BLOCK_INIT`, `ready` never flips,
and the app sits on its loading state forever. That's expected — the subdomain is an *embed
origin*, not a user destination. **Always share/link the `civitai.com/apps/run/<slug>`
route**, which loads the block through the host.

If you want a bare-subdomain visit to degrade gracefully (redirect to the host route, or show
an "Open on Civitai" landing) rather than hang on a loading spinner, that's a
**platform-level** concern, not something an individual block should hand-roll — a top-level
load is distinguishable both at the edge (the `Sec-Fetch-Dest: document` request header on a
direct navigation vs `iframe`/`nested-document` when the host embeds it) and in the client
(`window.self === window.top`). This reference intentionally keeps the block itself simple and
leaves that to the platform.

## UI — the `@civitai/blocks-react/ui` component pack

Every input and layout primitive comes from the pack
(Button / TextInput / Textarea / Card / Stack / Group / Alert / Loader / Badge /
Modal / Slider / NumberInput / Select / SegmentedControl, plus `injectBlocksStyles`
+ `data-theme` for auto light/dark theming). Two intentional hand-rolls, both built
on the pack's `--ci-*` CSS vars so they stay auto-themed:

- **The results matrix** ([`ResultsGrid.tsx`](src/components/ResultsGrid.tsx)) — the
  data-layout is too bespoke for a generic pack component.
- **The vote control** ([`VoteButton.tsx`](src/components/VoteButton.tsx)) — an
  app-policy composition of the pack's Button + Badge.

## Develop

Requires **Node 22+**. Run `npm install` first.

### Recommended: `dev-tunnel` — prod-fidelity live dev

`civitai app dev-tunnel` runs your **local** dev server inside the **real**
production host at `civitai.com/apps/dev/<blockId>`, over an ephemeral reverse
tunnel. You get the actual host — real viewer, real consent prompts, the real
resource picker, the real Buzz generation bridge, and the real gated image read —
hot-reloading your local edits. This is the day-to-day flow.

> **🔒 The dev-tunnel is invite-only beta.** It needs a moderator or
> **app-dev-tester** account (the tunnel gate is account-scoped). No beta access
> yet? Use the [Quickstart harness](#quickstart) — it needs no account and runs
> fully offline.

**1. Install the `civitai` CLI** (a self-contained Go binary — pick one):

```bash
brew install civitai/tap/civitai          # macOS / Linuxbrew
# or
npm  install -g @civitai/cli              # any Node environment
# or
go   install github.com/civitai/cli/cmd/civitai@latest
```

**2. Start the local dev server** and **3. open the tunnel** in a second terminal
(from the repo root — it defaults the `blockId` from
[`block.manifest.json`](block.manifest.json), here `model-benchmarking`):

```bash
npm run dev                       # local Vite dev server (localhost:5189)
civitai app dev-tunnel            # or: civitai app dev-tunnel model-benchmarking
```

**4. Open the printed URL** — `https://civitai.com/apps/dev/model-benchmarking` — in
a browser **signed in** to your beta-enabled Civitai account. Edit any file under
`src/` and the block live-reloads inside the real host.

### Scripts

```bash
npm run dev:harness   # offline mock host at http://localhost:5189 (Quickstart)
npm run dev           # plain Vite dev server (used under `civitai app dev-tunnel`)
npm test              # vitest: a `node` (pure-logic) project + a `dom` (jsdom component/e2e) project
npm run typecheck     # tsc --noEmit
npm run build         # tsc --noEmit && vite build  → dist/
npm run preview       # preview the production build
```

The dev server pins host + port (`localhost:5189`, `--strictPort`) because the SDK
iframe transport drops any `postMessage` whose origin isn't allow-listed
(`VITE_BLOCK_ALLOWED_PARENT_ORIGINS`; see [`.env.example`](.env.example)). There are
**no secrets in this repo** — the host injects the block token + viewer identity at
runtime.

## Build & submit (Civitai CLI)

Blocks are validated and submitted with the
[`civitai` CLI](https://github.com/civitai/cli) (the same Go binary as above):

```bash
civitai app validate      # lint block.manifest.json + the build output
civitai app submit        # build (npm run build) + upload dist/ for review
```

The manifest ([`block.manifest.json`](block.manifest.json)) declares the block id,
the requested scopes (`ai:write:budgeted`, `buzz:read:self`,
`apps:storage:shared:read`, `apps:storage:shared:write` — kept in lockstep with
[`src/scopes.ts`](src/scopes.ts)), `buildCommand: "npm run build"`, and
`outputDir: "dist"`. Publishing goes through Civitai's moderator review, then
deploys to `<blockId>.civit.ai`.

## Deferred (out of Phase 1 scope)

- **Durable vote state** across reloads — the host `list()` returns a vote `count`
  but not "did THIS viewer vote"; Phase 1 tracks the viewer's own votes optimistically
  in memory (idempotent server-side).
- **Strict run-once coordination** — cell dedup is best-effort first-append-wins; a
  host lock/claim would make generate-once strict.
- **Result curation** — no owner controls to hide/replace a published cell yet
  (`withdraw` exists on the shared row but isn't surfaced).

## Links

- Live app — [model-benchmarking.civit.ai](https://model-benchmarking.civit.ai)
- SDK contract — [`@civitai/app-sdk`](https://www.npmjs.com/package/@civitai/app-sdk)
- React hooks + UI pack — [`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react)
- CLI — [`github.com/civitai/cli`](https://github.com/civitai/cli)
- Sibling reference block — [`civitai-app-custom-generators`](https://github.com/ZacxDev/civitai-app-custom-generators)

## License

[Apache-2.0](LICENSE) © 2026 Zach Lowden.
