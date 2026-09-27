# Handoff: IA refactor landed, 0.4.6 live, 0.4.7 unreleased — 2026-09-27

## Run this first — the index, one command
```bash
cairn recall --repo /home/zach/workspace/civit/civitai-app-model-benchmarking
```
🔴 RECALL, NOT LIVE OBSERVATION — every line is a pointer to VERIFY, never a current
reading. Non-blocking: if it exits non-zero, print the stderr line and carry on.

## State now
- **`main` = `b413500`.** Base clone synced, tree clean, no worktrees, no open PRs, no
  claims held.
- **Live = 0.4.6** (`app_state.py model-benchmarking 0.4.6` → `approved/live`, rc 0),
  serving `assets/index-CL_wLzp7.js`. **`main` is AHEAD of live**: the whole IA refactor
  is merged and *unreleased*. Shipping is version-gated, so nothing reaches users until
  someone bumps both version fields and a moderator approves.
- ⚠️ The base clone's `node_modules` is **stale** (blocks-react 0.46.0 against a
  `^0.51.0` pin), so `pnpm run typecheck` fails there until `pnpm install`. Every gate
  number below was measured in a freshly-installed worktree.

## What landed
- **0.4.6** (PRs #44, #47): four operator-reported run-path defects — consent resumes
  the pressed cell to the Confirm gate, the publish prompt shows its own outputs, an
  unreadable balance no longer claims "Insufficient Buzz", the gated read waits 45s with
  one bounded auto-retry plus `gated_read_error` telemetry.
- **The IA refactor** (PR #49, squash `b413500`): one page, no top-level tabs. Top Grid
  matrix → flat all-grids list with inline thumbnail previews → matchups board → prompts
  board. Matchup drill-in from the group band only (config rows inert); prompt drill-in
  from the column header; both into a detail modal. `configs × prompts` →
  `matchups × prompts`. A local `ContributeMenu`. Nine round-1 audit findings fixed, plus
  a 44px tap-target floor for `role="menuitem"`.
  Final gates at `1d5fc9d`, measured independently: typecheck rc 0 · node 16 files / 250 ·
  dom 34 / 374 · combined **50 / 624** rc 0 · build rc 0, 414.20 kB. `git ls-files |
  grep -cE '\.test\.tsx?$'` = 50 = collected.

## Next steps (ranked)
1. **Release 0.4.7 — BUT the store screenshots break first.** Bump both version fields,
   `civitai app validate`, submit from a clean detached worktree off `origin/main`,
   moderator approve, verify by served-bundle grep. 🔴 **Do not submit before step 2**:
   the listing screenshots are captured by a recipe that cannot run against this IA, so a
   release now ships a listing whose images describe an app that no longer exists.
   forcing: gate — moderator approval.
2. **Re-measure the talos capture recipe** (`civitai/talos-infra`, locally
   `datapacket-talos`, `.claude/skills/app-capture/scripts/recipes/model-benchmarking.json`).
   🔴 **This is a RE-MEASURE, not a re-point** — three independent breakages, and the two
   that matter are not the obvious one:
   - `ready.testid: "view-switch"` is the **boot gate**, so the capture stalls 45s and
     fails *before any click*, not on its first step;
   - all three `waitForText` discriminators (`"Submit and vote on checkpoint"`,
     `"Submit and vote on prompts"`, `"Top Grid"`) now render **simultaneously**, so the
     recipe's own stated defence — "the only thing standing between a drifted selector and
     a successful capture of the wrong screen" — is **structurally inert**, and the three
     states would come out as three identical screenshots;
   - `crop.rect` is dead: it was measured when one view mounted at a time
     ("ONE RECT SERVES ALL THREE STATES … grid y=170..983, matchups y=170..608"), and three
     stacked sections make the page ~3× taller.
   The verb becomes **scroll to a section**, not click a tab. New landmarks are pinned by
   `src/capture-landmarks.test.tsx`. Checked: of the four talos consumers
   `docs/matchups.md:311` records, only this one breaks (two couple on `matchup-card` /
   `submit-matchup` / `matchups-list` or a state name; one carries a stale `view-switch`
   fixture nothing asserts on).
   forcing: check — the recipe runs exit 0 with all three states visibly distinct.
3. **Real-host verification, human-required.** Turnstile + auth gated; no local, harness
   or test run covers it. The consent → Allow → Confirm path spends exactly once; an
   unreadable balance offers **Retry balance check** and never claims a shortfall; the
   publishing cell shows the outputs the host dialog is asking about. Plus the new IA:
   whether the matchup group band *reads* as a clickable section band — **jsdom performs
   no layout here, so no test in this repo can tell you**. `pnpm run dev:harness` is the
   cheap first look. The no-grant fixture account is in the cairn index for this scope
   (client-confidential — read it there, never copy it into this public repo).
   forcing: none.
4. **The five-package bump — parked, and NOT gated on a version.** See the section below.
   forcing: gate — either blocker closing.
5. Grid edit-in-place tripwire (deferred 2026-09-09, nothing watches it): does any
   published grid render a non-zero missing-member count, or is the published-grid count
   near ~10?
   forcing: none.

## The parked bump — why it did not ship, and what would unblock it
Built, measured, deliberately not shipped. Patch preserved **outside this public repo** at
`/home/zach/workspace/civit/.parked/mb-five-package-bump-perpath-b778de4.patch` (583 lines;
applied cleanly to `b778de4`, reached typecheck rc 0 / build rc 0 / money-path 30-30).

🔴 **Its prize was deleting `src/components/ContributeMenu.tsx` (388 lines), and that is
impossible either way** — so the bump buys currency and nothing else:
- `<civitai-menu>` opens via the **native popover API** (`panel.showPopover()`,
  `panel.matches(':popover-open')`) and **jsdom 25 implements none of it** — probed
  directly: the three methods `undefined`, the `popover` property `false`, and
  `:popover-open` **throws** `unknown pseudo-class selector`. The upstream menu cannot be
  opened by any test in the `dom` project.
- `contribute-menu-items` is part of the capture contract, and upstream renders the panel
  inside its own shadow root with **no app-settable attribute hook**. The trigger and the
  three slotted items can carry testids; the panel cannot.

**Two upstream asks in `civitai/civitai-app-starters` would close it** — an app-settable
testid on the menu panel, and an open path a jsdom-based runner can drive. Neither is
filed yet. The alternative is a real-browser runner for this repo.

**It is FIVE packages, not four** (measured): `components-react@0.9.0` needs
`components@^0.8.1`; `blocks-react@0.51.0` **exact-pins** `components@0.4.1`, so bumping
only components-react installs **two copies**; `blocks-react@0.58.1` fixes that but
**peers `app-sdk >=0.49.0 <1.0.0`** against the `^0.42.0` pinned here — with `^0.42.0` all
34 dom files fail at *collection*, 0 tests run. `app-sdk@0.51.2` then moves `defineBlock`
to `@civitai/app-sdk/manifest` and adds five required `BlockManifestV1` fields.

Costs measured and still owed if it is ever taken:
- a plain `pnpm install` leaves **two** `@civitai/components` (0.8.0 + 0.8.1); an explicit
  **`pnpm dedupe`** is required, and the dedupe must be *proven*, not assumed;
- `pnpm-workspace.yaml` becomes **required** (measured both ways: absent → rc 1
  `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`) — and that file ships in the bundle, so it
  changes what the platform's builder installs;
- **13 dom tests red** until ~11 behavioural assertions are rewritten to pierce shadow
  roots (the testid lands on `<civitai-image>`; the real `<img>` is behind the boundary);
- 🔴 **`compact.ts`'s tooltip fix is silently orphaned** — the new element emits
  `civitai-tooltip` / `[data-tooltip-bubble]` where the rule targets
  `[data-civitai-ui='tooltip']` / `[data-civitai-ui-tooltip-bubble]`. Three surfaces whose
  numbers were obtained in headless Chromium and would have to be **re-measured, not
  re-reasoned**;
- **`loading="lazy"` is not expressible** on `CivitaiImage` (the element builds its own
  `<img>` in `renderMedia()` and declares no such property) — a starters gap that partly
  undoes this PR's lazy-preview work;
- barrel import costs **+128.81 kB (+31%)** because the root registers all 46 elements;
  per-path imports (`@civitai/components-react/elements/civitai-image`) cost **+27.02 kB**.
  The parked patch uses per-path.

## Gotchas / decisions
- 🔴 **`money-path.test.tsx` is NOT the right gate for a design-system bump.** It injects
  `fakeGatedCell()` (line 82), so it **stubs the cell that renders `Image`** — a green
  30/30 says nothing about the riskiest part of that change. Proven by control: mutating
  `result-image` in `GatedCell.tsx` left it green; mutating `cell-confirm-run` in
  `ResultsGrid.tsx` took it to 19 failed. It is authoritative for the run/spend flow and
  blind past that boundary.
- 🔴 **A per-component guard cannot see a seam.** The preview's read-budget tests assert
  one batched call *per card* and are correct — and could not see the open grid reading
  its images via both the matrix and its own card strip, because the duplication was
  *between* a card and the matrix. `src/gridPreviewSeam.test.tsx` pins the relationship.
- 🔴 **An id-level read dedupe does NOT exist, and the seam guard does not claim one.**
  Its ledger blesses one image being read by two overlapping cards. Accepted by the
  operator: the host limit is on *calls*, each card costs one batched call whatever ids it
  holds, and overlap is the *expected* case (the Top Grid is the top-voted members and
  community grids are built from the same popular ones).
- 🔴 **jsdom has no `IntersectionObserver`**, so `useNearViewport` initialises `near: true`
  and the deferral path is bypassed in almost every test. That is how a 604-green suite
  hid a permanent dead placeholder. A test that means to pin deferral must install a stub
  observer **and** drive the zero-ids → non-zero-ids transition; under a never-firing stub
  the DOM is identical in both states, so the discriminator has to be an observer log
  (constructions + observed elements), not markup.
- 🔴 **`grep -r` here honours `.gitignore`**, and agent worktrees live under
  `.claude/worktrees/` — which is ignored. A `-r` search over one returns a confident zero.
  Enumerate (`find … | xargs grep`) when searching a worktree.
- 🔴 **Editor/LSP diagnostics were wrong repeatedly this session** — a `useRef` "not found"
  that was imported, jest-dom matchers "missing", and a wave of module-resolution errors
  after worktrees were removed. `tsc --noEmit` in a correctly-installed tree is the
  arbiter; verify before acting on a diagnostic.
- 🔴 **`gh pr merge --delete-branch` fails the whole flag** when a local worktree holds the
  branch: it merges, errors on the local delete, and the **remote branch survives**. Remove
  worktrees first, or delete the remote branch by hand and check `git ls-remote --heads`.
- 🔴 **`app_state.py <app> <version> | tail` reports tail's exit code.** Read the rc
  unpiped — a `pending/-` beside a cheerful `rc=0` is how a not-yet-live release gets
  called live.
- 🔴 **vitest's transform cache serves stale modules for same-length edits.** A version
  bump `0.4.5`→`0.4.6` is exactly that shape. `rm -rf node_modules/.vite` between mutants,
  and keep a known-caught mutant as the positive control.
- 🔴 **A mutation battery that reverts with `git checkout HEAD -- <path>` destroys an
  uncommitted fix.** It happened here. Commit each fix before mutating over it.
- **Three false claims shipped in one comment block, all from one brief**, and each draft
  inherited the last. All three are now recorded as retracted *in the file* rather than
  quietly replaced, with the real blocker named. The original error was a name-grep of
  `src/index.ts` that could not see `export * from './elements/index.js'` — a wildcard
  re-export is invisible to a name search.
- **Decided (operator, 2026-09-26):** consent resumes to the **Confirm gate**, never an
  auto-run. Do not "fix" it.
- **Behaviour change worth knowing:** `grid-new` now renders for anonymous viewers and
  nudges sign-in rather than being hidden — the cost of collapsing two gating sites into
  one predicate. Matches the vote control's existing convention.
- The auto-retry pattern is **read-path only**; a spend never auto-retries.

## How to verify
- Gates (worktree WITH `node_modules`): `pnpm run typecheck && pnpm test && pnpm build` —
  **50 files / 624 tests**, and the 50 must match `git ls-files | grep -cE '\.test\.tsx?$'`
  exactly. Both vitest projects, read separately; exit codes from files, not through a pipe
  (per-test output goes to **stderr** here, under ~29k lines of pre-existing jsdom CSS
  noise).
- Ship check: `python3 ~/.config/opencode/skills/civitai-app-fleet/app_state.py
  model-benchmarking <version>` (rc 0 = live, **unpiped**) plus the fleet skill's
  served-bundle grep with a token you know is present as the positive control.
