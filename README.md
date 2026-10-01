# Model Benchmarking — a Civitai App Block

**An open-source, reference [Civitai](https://civitai.com) App Block: a
crowdsourced model-comparison grid.** Read it to learn how a real block is wired
to the host platform — cross-user image **publish + gated read**, a shared
community list you can **vote** on, the Buzz **generation-workflow** bridge, the
**resource picker**, and the `@civitai/blocks-react/ui` component pack — all
against the *published* SDK packages, with a mock host so you can run it in two
commands. It also shows a block **mid-migration**: data and host UI now go through
[`@civitai/sdk`](https://www.npmjs.com/package/@civitai/sdk) over `/api/v1`, while
generation and the component pack stay on the `@civitai/blocks-react` bridge —
[see the split](#two-transports-one-block).

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
through a **host↔block bridge** (postMessage under the hood) and, increasingly,
through the public `/api/v1` REST API using a token the host mints. In this repo
both are wired: `@civitai/sdk` for the REST half plus the host-UI messages, and
React hooks from `@civitai/blocks-react` for generation and the component pack. The
block never holds credentials either way — the host injects the viewer identity and
a scoped token at runtime. [Which is which](#two-transports-one-block).

This particular block is a **crowdsourced benchmark**. Users **submit + vote on**
three things: model **matchups** (up to eight configs, each a checkpoint + a
family-scoped weighted LoRA stack), **prompts** (one default prompt + params that
runs on every ecosystem, plus optional per-ecosystem overrides for SDXL / Pony /
Flux / …), and **grids** — a named, hand-picked set of matchups (rows) × prompts
(columns). **Every published grid is its own matrix**, and any viewer can open
anyone else's; a system-owned **Top Grid** (the top-voted matchups × the top-voted
prompts) is pinned first so the board always has one. **Every cell is runnable**:
the app resolves the config's ecosystem to a prompt override or the default and
spends the viewer's own Buzz, and the scanned outputs **publish to a shared grid**
so every model compares side-by-side on identical prompts — for **all** viewers.

> ⚠ **Vocabulary, because this README uses both senses.** The thing a user
> submits and votes on is a **matchup** everywhere in the UI and in this
> document. The string `'combination'` still appears below in the *wire* tables —
> that is the persisted `data.kind` discriminator, frozen forever, and it is
> never a name for the product concept. Where you see `combination` in code font
> it is the wire value; the prose noun is always *matchup*.

> **The platform has no concept of a "benchmark," "matchup," or "grid."** That
> entire model is owned by this app. The platform only provides generic,
> capability-scoped seams (a resource picker, a Buzz workflow bridge, cross-user
> shared storage, a generation-output publish + a per-viewer gated image read).
> This repo is a **reference** for wiring those seams — [`src/App.tsx`](src/App.tsx)
> owns every host hook, and [`src/lib/`](src/lib) holds the pure, unit-tested core.

## Quickstart

No account, no network, no config — the SDK's mock host answers the full block
protocol locally (seeded with demo matchups/prompts), so you can see the app running
immediately:

```bash
git clone https://github.com/ZacxDev/civitai-app-model-benchmarking
cd civitai-app-model-benchmarking
pnpm install
pnpm run dev:harness     # → mock host at http://localhost:5189
```

(No pnpm on your PATH? This repo ships a nix flake that pins node + pnpm:
`direnv allow`, or `nix develop`. See [Develop](#develop).)

Want to run against the *real* production host with live reload? See
[Develop](#develop) below.

## What this demonstrates → where to look

Every host capability is one function or hook, assembled into an injectable
dependency bag in [`src/App.tsx`](src/App.tsx) (so the whole app is testable with
canned picks / workflows / publish / gated reads). The **Primitive** column names
which package it comes from — see [Two transports, one block](#two-transports-one-block)
for why there are two. If you're here hunting "how do I do X in a block," jump
straight to the file:

| Capability | Primitive | Where to look |
|---|---|---|
| **Publish a generation's own outputs** (the G1 seam) — a completed run's scanned images → bare, app-scoped `Image` rows | `usePublishGenerationOutputs()` | [`App.tsx`](src/App.tsx) (`publish` in `deps`, called on run completion) |
| **Gated cross-user image read** — the per-viewer moderation boundary for grid cells | `useGatedImages()` | [`GatedCell.tsx`](src/components/GatedCell.tsx) (`getImages` → per-viewer display data) |
| **Cross-user shared storage + voting** — the community list of matchups, prompts, grids, and published results | `useSharedStorage()` — local, over `@civitai/sdk` | [`App.tsx`](src/App.tsx) (`list`/`append`/`update`/`vote`/`unvote`/`withdraw`), [`MatchupsView`](src/components/MatchupsView.tsx) / [`PromptsView`](src/components/PromptsView.tsx) (vote + the author-only Edit / Remove controls), [`WithdrawButton`](src/components/WithdrawButton.tsx) (the confirm handshake) |
| **Buzz generation-workflow bridge** — the money path | `useBuzzWorkflow()` | [`App.tsx`](src/App.tsx) (estimate → submit → poll), [`lib/workflow.ts`](src/lib/workflow.ts) (poll loop) |
| **Resource picker** — the checkpoint / LoRA modal, LoRAs family-scoped | `useResourcePicker()` | [`MatchupForm.tsx`](src/components/MatchupForm.tsx) (via the `pickResource` prop, `baseModelGroup`-scoped) |
| **Generation-resource rehydrate** — resource metadata by id | `useGenerationResources()` | [`App.tsx`](src/App.tsx) (`resolveResources`) |
| **Buzz balance** — show the wallet / gate cost | `useBuzzBalance()` — local, `GET /api/v1/blocks/buzz` | [`App.tsx`](src/App.tsx) |
| **Consent + sign-in gating** for the generation scope | `useRequestConsent()` / `useRequestSignIn()` — local, over `@civitai/sdk`'s `app.host` | [`scopes.ts`](src/scopes.ts), [`App.tsx`](src/App.tsx) |
| **Context / token / auto-resize** | `useBlockContext()`, `useBlockToken()`, `useBlockResize()` — local, over `@civitai/sdk` | [`App.tsx`](src/App.tsx) |
| **Per-viewer KV** — unpublished items, in-flight run claims, the explainer flag | `useAppStorage()` — local, `POST /api/v1/blocks/app-storage/*` | [`App.tsx`](src/App.tsx), [`lib/kv.ts`](src/lib/kv.ts), [`lib/unpublished.ts`](src/lib/unpublished.ts) |
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
  `useSharedStorage()` exposes `list` / `append` / `update` / `vote` / `unvote` /
  `withdraw` / `report`. **Submit** = `append({ title, body, data })`; **upvote** =
  `vote(key)` (idempotent server-side); **delete your own** = `withdraw(key)` —
  surfaced as the author-only **Remove** control on every matchup / prompt
  card, behind a confirm step, and reconciled optimistically so the row does not
  reappear on a read-after-write-lagged `list()`. The included set (top-N by
  votes) is derived **client-side** from `list` + counts.
- **The Buzz bridge never sees credentials.** `estimate(body)` prices a cell run,
  `submit(body)` charges the viewer's Buzz, `poll(workflowId)` runs to a terminal
  snapshot. The host injects the token + viewer identity.
- **The generation scope (`ai:write:budgeted`) is consent-gated.** The first token
  is minted without it; the runner checks the live token scopes
  ([`hasGenerateScope`](src/scopes.ts)) and requests consent before spending.
  `REQUEST_CONSENT` is fire-and-forget and carries no request id, so the host
  cannot reply "granted — here is the action you were mid-way through": the grant
  arrives only as a fresh token on `TOKEN_REFRESH`. **Resuming is therefore the
  block's job.** The pressed `(matchup config, prompt)` is held in a single slot
  and replayed once when the scope appears — re-entering the same run path, so it
  stops at the **Confirm gate** and spends nothing on its own. *Resume* here means
  the cell advances itself to Confirm, not that the run completes: the viewer
  still presses Confirm once, and that press is the only thing that spends. The
  gate is kept deliberately — a consent grant authorises spending up to a cap,
  not this particular spend. A later press supersedes an earlier held one, and a
  viewer swap or unmount drops it
  ([`consentResume.test.tsx`](src/consentResume.test.tsx)).
- **Publishing a result is confirmed by the host, and the block shows what is
  being confirmed.** `publish()` opens civitai's own "Publish to the shared
  grid?" dialog and resolves only when the viewer answers it. That dialog is
  host chrome and text-only, so the cell underneath renders the finished
  outputs — from the succeeded snapshot's `imageUrls` — for the whole window it
  is open ([`publishPreview.test.tsx`](src/publishPreview.test.tsx)). These are
  the viewer's OWN outputs shown only to them; anything already **published** is
  read back per-viewer through the gated bridge, never from a url the block
  holds ([`GatedCell.tsx`](src/components/GatedCell.tsx)).

## Two transports, one block

This block talks to civitai over **two** transports at once, and that is the
current state of the platform rather than a design choice here. It is worth reading
if you are porting a block of your own.

| | `@civitai/sdk` (REST + host UI) | `@civitai/blocks-react` (bridge) |
|---|---|---|
| Per-viewer KV | `app.storage` → `POST /api/v1/blocks/app-storage/*` | — |
| Shared storage | `app.sharedStorage` + three app-layer routes | — |
| Buzz balance | `GET /api/v1/blocks/buzz` | — |
| Snapshot (ready / viewer / theme / token) | `transport.snapshot` | — |
| Resize · sign-in · consent | `app.host` / `app.requestGrants` | — |
| **Generation** (estimate → submit → poll) | — | `useBuzzWorkflow()` |
| **Resource picker · resource rehydrate** | — | `useResourcePicker()` / `useGenerationResources()` |
| **Publish outputs · gated image read** | — | `usePublishGenerationOutputs()` / `useGatedImages()` |
| **Analytics** | — | `useBlockAnalytics()` (a no-op on both real hosts) |
| **Component pack** | — | `@civitai/blocks-react/ui` |

Three things about that split are load-bearing:

- **There is exactly ONE transport object, and it is the bridge's.**
  `@civitai/sdk` is normally started with a bare `initialize()`, which constructs
  its own iframe transport. This block cannot do that: `/ui`'s `BlockGate` wraps
  the production root and constructs the bridge transport on every boot, so a bare
  `initialize()` would leave **two** — two `message` listeners, two
  `BLOCK_HELLO`/`BLOCK_READY` senders, two token copies.
  [`src/lib/sdk-transport.ts`](src/lib/sdk-transport.ts) adapts the bridge's
  transport to the interface `initialize({ transport })` accepts, so there is one.
  It is deletable the day `/ui` stops importing the bridge.
- **Generation stays on the bridge deliberately.** `@civitai/sdk` ships
  `app.orchestration`, and substituting it for the bridge's workflow path **compiles
  and passes tests** while silently dropping civitai's per-call/per-viewer/per-app
  Buzz spend caps, the viewer's browsing-level clamp, and per-app attribution. The
  real replacement is `POST /api/v1/blocks/workflows/*`, which the SDK carries no
  client for. Since the money path is this repo's spec
  ([`money-path.test.tsx`](src/money-path.test.tsx)), it moves on its own change.
- **`vote` / `unvote` / `report` are app-layer, by platform decision.**
  `app.sharedStorage` is generic key/value only — `list`/`get`/`append`/`update`/
  `withdraw`. The platform serves eleven shared-storage routes and keeps doing so;
  the six higher-level ones (`vote`, `unvote`, `counts`, `top`, `increment`,
  `report`) belong to the app that wants them. This block reaches the three it uses
  through `app.site.post(...)` in
  [`src/lib/sdk-runtime.ts`](src/lib/sdk-runtime.ts). Their absence from the SDK is
  not a gap to file.

**Testing it needs two fakes, for the same reason.** The mock host answers
postMessage and no HTTP, so [`src/dev-rest.ts`](src/dev-rest.ts) answers the three
REST families at the `fetch` boundary and [`src/test-harness.tsx`](src/test-harness.tsx)
mounts both, routing each prop to the transport that can actually serve it. A test
that kept seeding the mock host with `shared`/`buzzBalance` would stay green while
exercising nothing.

## Architecture

A SIDEBAR and one surface at a time, routed by [`src/App.tsx`](src/App.tsx); submit
flows are modals.

> ⚠️ This section described **three tabs behind a `SegmentedControl`** until 0.4.9, and
> that had already been wrong since 0.4.7 — the IA refactor deleted the tab strip and
> nobody updated the prose. Recorded rather than quietly replaced, because a stale
> architecture paragraph on a public mirror is read as the map.

**The sidebar** ([`SideNav.tsx`](src/components/SideNav.tsx)) has two destinations:

- **Home** — the app's primary object, always first and never behind a click: the
  **open grid** ([`GridOpenPanel.tsx`](src/components/GridOpenPanel.tsx)) and its
  runnable matrix ([`ResultsGrid.tsx`](src/components/ResultsGrid.tsx)), then a board
  subnav ([`BoardNav.tsx`](src/components/BoardNav.tsx)) selecting **one** community
  board:
  - **Grids** ([`GridsView.tsx`](src/components/GridsView.tsx)) — a flat list of
    published grids ordered by vote count, each with an inline thumbnail strip
    ([`GridPreview.tsx`](src/components/GridPreview.tsx)). A system-owned **Top Grid**
    (top-voted matchups × top-voted prompts) is pinned first and has no shared key, so
    it cannot be voted on. The grid that is currently OPEN is not listed — it renders in
    full above. 🔴 A published grid names shared keys **another author can withdraw**, so
    it renders its surviving members plus an honest count of the missing ones.
  - **Matchups** ([`MatchupsView.tsx`](src/components/MatchupsView.tsx) +
    [`MatchupForm.tsx`](src/components/MatchupForm.tsx)) — submit + vote on a checkpoint
    (any base model) plus a family-scoped weighted LoRA stack, picked via the resource
    picker. ⚠️ **Voting is offered on other viewers' matchups only** — an author gets no
    vote control on their own row, because the total is what decides whether the row
    becomes one of the grid's rows. That is a UI affordance and **not** enforcement:
    `shared.vote` is a host call and the host does not refuse a self-vote.
  - **Prompts** ([`PromptsView.tsx`](src/components/PromptsView.tsx) +
    [`PromptForm.tsx`](src/components/PromptForm.tsx)) — submit + vote on a prompt: one
    **default** raw prompt string + generation params that runs on *every* ecosystem,
    plus optional per-ecosystem **overrides** (SDXL / Pony / Flux / …) that replace the
    prompt and/or patch the params for one base-model family.
- **My Benchmarks** — the viewer's own **prompts / matchups / grids** (that order, which
  is the order a viewer builds them) in **one list**
  ([`MyList.tsx`](src/components/MyList.tsx)) spanning both storage layers: unpublished
  records carry a **Private** badge and offer Edit / **Publish** plus a `⋮` holding
  **Discard**, published rows offer **Edit** plus a `⋮` holding **Remove** and
  **Archive** — an author-side hide with a recovery path, described in words next to
  the control
  ([`src/lib/archive.ts`](src/lib/archive.ts)). Building a grid lives here
  ([`GridForm.tsx`](src/components/GridForm.tsx) +
  [`GridPicker.tsx`](src/components/GridPicker.tsx)): a *grid* is a named, hand-picked
  set of matchups (rows) × prompts (cols), assembled from other people's rows and
  therefore private until its author publishes it.

Every cell of the matrix can be **run** — the `prompt` v3 reframe gave every prompt a
`default`, so there is no N/A state left — and each renders that config's published
outputs through the per-viewer gated read
([`GatedCell.tsx`](src/components/GatedCell.tsx)).

<!-- lib-inventory:start — src/readme-inventory.test.ts reads ONLY what sits
     between the END of this comment and the closing marker. So the guard is
     about THIS paragraph: not about `src/lib/…` links elsewhere in the file,
     and not about this comment either (it used to start the slice inside the
     comment, which made this text count as inventory). Move the markers and the
     guard moves with them. Remove one, duplicate either one ANYWHERE in this
     file, or leave this comment unclosed, and the guard THROWS — each of those
     used to widen the slice silently instead. -->

[`src/lib/`](src/lib) holds the app's core. Most of it is pure and node-testable;
two modules are the transport seam and are named at the end. **Every module in it
is named here**, and that is checked rather than trusted —
[`readme-inventory.test.ts`](src/readme-inventory.test.ts) compares *this
paragraph*, and only it, against the directory and fails if the set grows *or*
shrinks, because this paragraph once silently went one module short:
[`benchmark.ts`](src/lib/benchmark.ts) (the data-model parse/migrate, `WorkflowBody`
construction, top-N-by-votes, optimistic reconcile, the moderated-text/opaque-data
split), [`ecosystem.ts`](src/lib/ecosystem.ts) (base-model → ecosystem matcher),
[`gen-defaults.ts`](src/lib/gen-defaults.ts), [`workflow.ts`](src/lib/workflow.ts)
(the poll loop), [`kv.ts`](src/lib/kv.ts) (the per-viewer **in-flight run** record —
the money path's crash-safety: a run is persisted before it can be lost and
resume-polled rather than re-submitted, so a reload never charges the viewer
twice), [`grids.ts`](src/lib/grids.ts) (the `grid` record's wire shape,
validation and dangling-member resolution), [`gridEntries.ts`](src/lib/gridEntries.ts)
(ranking, the Top Grid, and the missing-member notice),
[`unpublished.ts`](src/lib/unpublished.ts) (the shared private→public boundary) with
its three per-object callers [`drafts.ts`](src/lib/drafts.ts),
[`unpubPrompts.ts`](src/lib/unpubPrompts.ts) and
[`unpubGrids.ts`](src/lib/unpubGrids.ts) — `App.tsx` also imports the boundary
directly, for the one publish path all three share — and
[`archive.ts`](src/lib/archive.ts) (the author-side hide) and
[`roving.ts`](src/lib/roving.ts) (the arrow-key index arithmetic the sidebar and the
row menu share — it was open-coded in both and wrong in both the same way) and
[`virtualRows.ts`](src/lib/virtualRows.ts) (the results matrix's row-windowing
decision: which config rows to mount at a given scroll position, plus the two
spacer heights that keep the scroll extent constant — a pure function of four
numbers because jsdom lays nothing out, so a rule reachable only through real
layout would be untestable here). The two
that are **not** pure logic are the transport seam described in
[Two transports, one block](#two-transports-one-block):
[`sdk-runtime.ts`](src/lib/sdk-runtime.ts) (the eight runtime bindings this app takes
from `@civitai/sdk` — the snapshot readers, the host-UI calls, and the three REST
families) and [`sdk-transport.ts`](src/lib/sdk-transport.ts) (the adapter that lets
ONE bridge transport serve both packages, so the block never stands up two). One
module is neither pure logic nor transport: [`sourceScan.ts`](src/lib/sourceScan.ts)
reads `node:fs` and exists only for the structural test guards (the `src/` walker and
the production-import walk they share). Nothing in production may import it, and
`navigationDormancy.test.ts`'s scaffolding ledger asserts that it does not.

<!-- lib-inventory:end -->

### The stored value shape (moderation boundary)

One append-only shared list holds **four** record kinds, discriminated by
`data.kind`. **Each kind carries its OWN `data.v`, and they are not all 1** —
every row is defensively parsed and migrated on read, so pre-migration shapes of
the **three** older kinds are still live on the board (`grid` is v1 with no
predecessor and no migration branch). Every record splits into a **moderated** half
and an **opaque** half:

| kind | `data.v` | `title` / `body` (MODERATED text) | `data` (opaque, unmoderated) |
|---|---|---|---|
| `combination` | **2** | name / description + resource display names | `{ v: 2, kind, configs: [{ id, label?, checkpoint:{versionId,modelId,baseModel,…}, loras:[{versionId,weight,…}] }] }` |
| `prompt` | **3** | name / description + the default prompt + **every** override prompt + negatives | `{ v: 3, kind, default:{prompt, params}, overrides?:{[ecosystem]:{prompt?, params?}} }` |
| `result` | **2** | terse machine label | `{ v: 2, kind, comboKey, configId, promptKey, ecosystem, imageIds:number[], promptAuthorUserId? }` |
| `grid` | **1** | name / description | `{ v: 1, kind, matchupKeys:string[], promptKeys:string[] }` |

Two of those versions carry a data-model reframe worth knowing before you write a
consumer, because both changed what a *cell* is:

- **`combination` v2** — the benchmark unit is a **config**, not the whole
  matchup. One matchup carries up to `MAX_CONFIGS` configs, each its own grid
  ROW. A v1 row (a bare `checkpoint` + `loras`) migrates on read into a single
  config with the deterministic id `V1_CONFIG_ID`, so its v1 `result` rows still
  match.
- **`prompt` v3** — a prompt is **no longer one required entry per ecosystem**.
  It is one `default` prompt + params that runs on **every** ecosystem, plus
  optional sparse `overrides` that replace the prompt and/or patch the params for
  one base-model family. The consequence is the whole point: **every cell is
  runnable** — there is always a default — so the grid has no N/A state. A legacy
  v1 `byEcosystem` prompt migrates on read: one entry becomes the `default` and
  the rest become `overrides` (entries identical to the default collapse into it).

> 🔴 **`data.kind: 'combination'` is a persisted WIRE VALUE and is never renamed**,
> even though the UI now calls it a *matchup*. It discriminates every row already on
> the live board, and the app cannot migrate another viewer's rows — `update` and
> `withdraw` are author-scoped. The same holds for the `v:` versions and
> `ResultData.comboKey`. Pinned by
> [`renameWireCompat.test.ts`](src/renameWireCompat.test.ts).

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
**group key** — the key a prompt's `overrides` map is keyed by.
SDXL-derivatives (Pony / Illustrious / NoobAI) win over the generic SDXL rule;
unknowns fall to an explicit `Other` bucket.

⚠ **The match no longer decides whether a cell RUNS — only which prompt text it
runs.** Under `prompt` v1 a cell was runnable *iff* the prompt had an entry for
the config's ecosystem, and a non-match rendered a disabled **N/A**; v3 removed
both. Today the group key selects an `overrides[…]` entry when one exists and the
`default` otherwise, so the resolver **never returns null** — see `resolveCell`
in [`lib/benchmark.ts`](src/lib/benchmark.ts), and the `renders NO N/A cells`
case in [`ResultsGrid.test.tsx`](src/components/ResultsGrid.test.tsx).

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

The toolchain is pinned, not assumed: [`.nvmrc`](.nvmrc) states the node major —
the single authority, read by [`flake.nix`](flake.nix) and by CI via
`actions/setup-node`'s `node-version-file` — and the flake pins pnpm alongside
it. Get a shell with `direnv allow` (or `nix develop`), then `pnpm install`.

Not a nix user? Any node of that major plus pnpm 11 works; those are exactly
what CI installs, and `src/toolchain-lockstep.test.ts` keeps the two pins from
drifting apart.

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
pnpm run dev                      # local Vite dev server (localhost:5189)
civitai app dev-tunnel            # or: civitai app dev-tunnel model-benchmarking
```

**4. Open the printed URL** — `https://civitai.com/apps/dev/model-benchmarking` — in
a browser **signed in** to your beta-enabled Civitai account. Edit any file under
`src/` and the block live-reloads inside the real host.

### Scripts

```bash
pnpm run dev:harness   # offline mock host at http://localhost:5189 (Quickstart)
pnpm run dev           # plain Vite dev server (used under `civitai app dev-tunnel`)
pnpm test              # vitest: a `node` (pure-logic) project + a `dom` (jsdom component/e2e) project
pnpm run typecheck     # tsc --noEmit
pnpm run build         # tsc --noEmit && vite build  → dist/
pnpm run preview       # preview the production build
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
civitai app submit        # build (pnpm run build) + upload dist/ for review
```

The manifest ([`block.manifest.json`](block.manifest.json)) declares the block id,
the requested scopes (`ai:write:budgeted`, `buzz:read:self`,
`apps:storage:shared:read`, `apps:storage:shared:write` — kept in lockstep with
[`src/scopes.ts`](src/scopes.ts)), `buildCommand: "pnpm run build"`, and
`outputDir: "dist"`. Publishing goes through Civitai's moderator review, then
deploys to `<blockId>.civit.ai`.

## Deferred (out of Phase 1 scope)

- **Durable vote state** across reloads — the host `list()` returns a vote `count`
  but not "did THIS viewer vote"; Phase 1 tracks the viewer's own votes optimistically
  in memory (idempotent server-side).
- **Strict run-once coordination** — cell dedup is best-effort first-append-wins; a
  host lock/claim would make generate-once strict.
- **Result curation** — no owner controls to hide/replace a published grid CELL
  yet. `withdraw` *is* surfaced now, but only on the rows a contributor authors
  directly (matchups, prompts and grids, via the Remove control); a `result` row
  published by a cell run has no in-app retraction path.

## Links

- Developer docs — [developer.civitai.com](https://developer.civitai.com)
- Live app — [model-benchmarking.civit.ai](https://model-benchmarking.civit.ai)
- SDK contract — [`@civitai/app-sdk`](https://www.npmjs.com/package/@civitai/app-sdk)
- React hooks + UI pack — [`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react)
- CLI — [`github.com/civitai/cli`](https://github.com/civitai/cli)
- Sibling reference block — [`civitai-app-custom-generators`](https://github.com/ZacxDev/civitai-app-custom-generators)

## License

[Apache-2.0](LICENSE) © 2026 Zach Lowden.
