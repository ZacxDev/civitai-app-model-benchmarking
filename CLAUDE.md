# Model Benchmarking — agent guide

A Civitai **App Block**: a full-page app served at
`/apps/run/model-benchmarking`. Users submit and **vote** on model
*combinations* (checkpoint + family-scoped LoRA stack) and multi-ecosystem
*prompts*; the top-voted set forms a combinations × prompts matrix, and running
a cell **spends the viewer's own Buzz** and publishes the outputs to a shared,
cross-viewer grid.

**The money path is the load-bearing part.** `src/money-path.test.tsx` is the
spec, not a smoke test — read it before touching `src/App.tsx`'s run flow,
`src/lib/workflow.ts` (the poll loop), `src/lib/kv.ts` (the per-viewer in-flight
record), or the confirm gate in `src/components/ResultsGrid.tsx`. The
invariants it pins, each of which has a cost when it breaks:

- a double-clicked Confirm submits **exactly once**;
- an in-flight run is persisted **before** it can be lost, rehydrates as a
  *stalled* cell (never as empty-and-runnable), and is **resume-polled**, never
  re-submitted — otherwise a reload charges the viewer twice;
- the run **refuses to spend** whenever the rehydrate scan could not see
  everything (still running, hit its page cap, keys unread) — failing closed is
  the whole point;
- a cell is **claimed before** it is paid for, and a claim that cannot be
  written refuses the run;
- an unpriceable estimate fails honestly and never submits.

Also structural, and also asserted: `src/manifest.test.ts` keeps
`block.manifest.json`'s scopes in lockstep with `src/scopes.ts`, keeps the
manifest and `package.json` **versions** in lockstep, and pins
`bootSkeleton: true` (the key that makes the host stand down its opaque veil —
without it the whole boot-skeleton mechanism is invisible dead code).

This repo is a **public OSS reference mirror** — block source only, no
infrastructure internals. Keep it that way.

## Get a shell

`pnpm` is **not on PATH** outside the dev shell. The flake pins the toolchain:

```bash
direnv allow          # or: nix develop
pnpm install --frozen-lockfile
```

| Task | Command |
|---|---|
| The gates CI runs | `pnpm run typecheck && pnpm test && pnpm build` |
| Types only | `pnpm run typecheck` |
| Mock host (SDK `<Harness>`) | `pnpm run dev:harness` → http://localhost:5189 |
| Real host, live reload | `pnpm run dev` + `civitai app dev-tunnel` (invite-only beta) |
| Platform approve-time validator | `civitai app validate` (the Go CLI, installed separately — the flake does not ship it) |

**Toolchain pins.** `.nvmrc` is the single authority for the node major — the
flake reads it with `builtins.readFile`, and CI reads it via
`actions/setup-node`'s `node-version-file`. pnpm's major is stated **twice**
(`flake.nix`'s `pnpmMajor` and the `pnpm/action-setup` step) because the action
reads only its own input or a `packageManager` field this repo deliberately does
not declare — adding one would change what the *platform's* builder does, since
`block.manifest.json`'s `buildCommand: pnpm run build` runs against the same
`package.json`. `src/toolchain-lockstep.test.ts` fails if those two drift, or if
someone hardcodes a node version back into the workflow.

Only `x86_64-linux` is exercised. The flake evaluates for `aarch64-linux` and
`aarch64-darwin` too; `x86_64-darwin` is absent because nixpkgs-unstable dropped
it.

## Where a change belongs

Most work that *looks* like a bug here is a gap one layer down. Canonical
checkouts live at `~/workspace/civit/<repo-name>`; sibling directories with a
suffix are topic worktrees of the same remotes, usually on a feature branch.

| The change is about | Repo | Local |
|---|---|---|
| This block's UI, money logic, grid, voting, shared-storage model | **`ZacxDev/civitai-app-model-benchmarking`** (here) | — |
| A hook, a type, the mock host, the design system — anything imported from `@civitai/*` | **`civitai/civitai-app-starters`** | `civitai-app-starters` |
| Host/server behavior: the `/apps/run` page surface, block token + scope enforcement, the page money path, app storage, the workflow read-model, submit/approval | **`civitai/civitai`** | `civitai` |
| `civitai app init/validate/submit`, login, dev tunnel | **`civitai/cli`** (Go) | `cli` |
| Public developer docs (developer.civitai.com) | **`civitai/civitai-developer-docs`** | `civitai-developer-docs` |

**All five `@civitai/*` dependencies ship from the one starters repo** —
`packages/civitai-app-sdk`, `civitai-blocks-react`, `civitai-components`,
`civitai-components-react`, `civitai-theme`. A missing hook, a wrong type, a
mock host that doesn't simulate something: that is a PR there, not a workaround
here.

Useful landmarks in `civitai/civitai`: `src/pages/apps/run` (the page surface),
`src/pages/api/blocks/manifest-schema.ts` + `submit-version.ts`,
`src/server/services/blocks/`.

Sibling app blocks worth reading for prior art — they hit the same platform
edges: `ZacxDev/civitai-app-gen-matrix`, `…-playable-collections`,
`…-custom-generators`, `…-sensei`, `…-requests`.

## Documentation sources, in authority order

1. **The installed package itself.** `node_modules/@civitai/<pkg>/dist/*.d.ts`
   and its `README.md` are the only source guaranteed to describe *the version
   this repo builds against*. Check `package.json` first. Subpaths matter:
   `@civitai/app-sdk` exports `./blocks`, `./scopes`, `./orchestrator`,
   `./schemas/app-block/v1.json`; `@civitai/blocks-react` exports `./ui` and
   `./testing`. (Under pnpm the real files live in `node_modules/.pnpm/…`;
   `node_modules/@civitai/<pkg>` is a symlink into it and reads fine.)
2. **https://developer.civitai.com/apps/** — `guide/{quickstart,concepts,embedding,theming,text-to-image,comfy-cloud}`
   and `reference/{hooks,manifest,messages,scopes,components,generation,cli}`.
   Best for *why* and for the message-bridge contract. ⚠️ The generated pages
   carry a `sources:` front-matter naming the package version they were built
   from, and it **lags** the version here — when the page and the `.d.ts`
   disagree, the `.d.ts` wins.
3. **The starters repo** — `docs/build-your-first-app-block.md`,
   `starters/examples/*` (one runnable example per feature), and
   `starters/civitai-block-starter` (what `civitai app init` clones). Real code
   beats prose for "how is this hook meant to be used".
4. **The host implementation** in `civitai/civitai` — last-resort ground truth
   for server behavior the docs don't specify (which errors the orchestrator
   returns, what a scope actually gates, how a workflow snapshot is shaped).

For React 19 / Vite / Vitest specifics, use the `context7` MCP tools rather than
recalling from memory.

## Verifying a change

`pnpm test` runs **two vitest projects** and both must be read — a failure in
one is invisible in the other:

- **`node`** — `src/**/*.test.ts`, pure logic, no DOM (`lib/benchmark.ts`,
  `lib/ecosystem.ts`, `lib/workflow.ts`, `lib/kv.ts`, and the manifest and
  toolchain lockstep guards).
- **`dom`** — `src/**/*.test.tsx`, jsdom + Testing Library, driving the App
  against the SDK mock host. The money-path suite lives here.

`pnpm run typecheck` is a **separate gate** in CI and is not implied by the
tests — `pnpm build` runs it too (`tsc --noEmit && vite build`).

**What cannot be verified here:** the real Buzz spend loop is Turnstile + auth
gated. No local run, harness run, or test proves a cell actually charged
correctly — that needs a human in a real mod-gated host. Say so plainly rather
than reporting a green suite as if it covered the money path. The same goes for
the platform builder: CI is a *different environment* and `.github/` is not part
of the submitted bundle, so a green CI run is not evidence the platform can
build this app.

New guards should pin a *relationship* that cannot rot on a routine bump, and be
watched failing before they are trusted. `src/toolchain-lockstep.test.ts` and
the version/scope assertions in `src/manifest.test.ts` are the pattern to
copy — both explain, in the file, the incident they exist to prevent.

## Release protocol

- `block.manifest.json` and `package.json` versions move **together**.
  `src/manifest.test.ts` enforces it; a release that bumps one is a shippable
  defect that has actually shipped elsewhere in this family of repos
  (2026-08-27, seven apps at once).
- `block.manifest.json`'s `buildCommand` is `pnpm run build` — that string is
  what the **platform's** builder executes. Changing it is the highest-blast-
  radius line in this repo.
- This repo has **no `pnpm-workspace.yaml`**: `pnpm install --frozen-lockfile`
  passes pnpm's freshness gate as-is here. If a future `@civitai/*` bump is
  refused at install time on `minimumReleaseAge`, add one with
  `packages: ['.']` plus a `minimumReleaseAgeExclude` naming the exact versions
  (see `civitai-app-gen-matrix` for the shape) — and re-run the bundle build,
  because that file *is* part of the submitted bundle while `.github/` is not.
- ⚠️ There is **no tracked `.env.production`** here (`.gitignore` excludes it),
  so the build bakes in no `VITE_BLOCK_ALLOWED_PARENT_ORIGINS`. Measured in
  `@civitai/blocks-react@0.46.0`: with none set, `readAllowedOriginsFromEnv()`
  returns `[]` and `IframeTransport`'s constructor **throws** — but
  `BlockTransportDetector.detect()` returns `InlineTransport` first when the
  host injects `window.__CIVITAI_BLOCK_CONTEXT__`, which is presumably why the
  live app works. Which transport production actually takes has **not** been
  verified from here. If you add the file, a wrong value drops every host
  message and the iframe renders blank.
