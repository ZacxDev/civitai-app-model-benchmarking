# Handoff: model-benchmarking IA — sidebar/subnav/modals, 0.4.9 — 2026-09-29

⚠️ **Slug is `ia-refactor-landed` for continuity — the EFFORT is this app block's IA work,
and this doc is updated in place rather than forked.** The one-page-IA arc it was named
for CLOSED 2026-09-28; two further operator feedback rounds opened the arc below. Ranks 4
and 5 are carried forward from that arc and are still live — do not drop them.

## Run this first — the index, one command
```bash
cairn recall --repo /home/zach/workspace/civit/civitai-app-model-benchmarking
```
Terse pointers this doc does not carry, curated by past sessions and outliving it.
🔴 RECALL, NOT LIVE OBSERVATION — every line is a pointer to VERIFY, never a current
reading, and it may describe a gotcha already fixed. Non-blocking: if it exits non-zero,
print the stderr line and carry on.

⚠️ **No `clawgate-task:` field.** `clawgate_handoff.sh resolve` exited **5** (nothing
resolved). An unknown session id answers 200 with an empty array, so that zero cannot
distinguish "touched no task" from "wrong id". It is not a clean bill of health.

## State now
- **`main` = `e8775c0`**, clean, synced with `origin/main`. Base clone freshly installed.
- **Three PRs merged this session**, each verified by CONTENT on `origin/main` (never by
  ancestry — a squash merge makes `merge-base --is-ancestor` false forever):
  - **#59** `0a06df2` — drop `grid-new` (both sites), relabel Contribute to
    `Grid`/`Matchup`/`Prompt` with explicit `aria-label`s, exclude the open grid from the
    all-grids list, take Archive off the community board.
  - **#60** `c5863b0` — local `SideNav` (Home + expandable My Benchmarks), `BoardNav`
    mounting ONE community board, `MyPublished`/`MyGridsView`, My/Community sub-tabs
    removed, 720px top-bar collapse, version → 0.4.9.
  - **#61** `e8775c0` — extracted `Menu` + two ⋮ menus, SVG vote glyph + tooltip, ALL
    badges removed from both detail modals *and* the list cards, grid-title underlines,
    optional `LoraRef.modelId`, resource links removed as unshippable.
- **Gates on `main`, measured by me in the base clone:** typecheck rc 0 · `pnpm test`
  rc 0 = **59 files / 804 tests** · `git ls-files | grep -cE '\.test\.tsx?$'` = 59 =
  collected · build rc 0, **440.22 kB**.
- **0.4.9 is APPROVED and BUILDING — NOT LIVE.** `pubreq_01M3PX578J3B4A7K95P1D6HMM2`,
  source `e8775c0`. Measured ~25 min after approval and still `approved/building`
  (`app_state.py … 0.4.9` rc **1**).
- **Production still serves 0.4.8.** Measured on the served bundle
  `assets/index-PwE4InET.js`: `side-nav` 0, `board-nav` 0, `nav-my-grid` 0,
  `grid-open-members` 0, with the positive control firing in the same grep
  (`section-grids` 1, `grid-open-panel` 1, `contribute-trigger` 1). ⚠️ Do NOT use
  `resource-name` as a discriminator — it reads 2 in the 0.4.8 bundle.
- **Store listing is now STALE.** Its three screenshots depict the 0.4.7 one-page IA,
  which this stack replaces. Listing media is not version-scoped, so they are stale
  rather than broken.
- Leftover worktree: `civitai-app-model-benchmarking-release049` (detached at `e8775c0`,
  clean) — the submit worktree. Remove it when done.
- Claim `mb-sidebar-ia-feedback` is still HELD. Release it when this arc closes.

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
1. **Verify 0.4.9 actually went live, as two separate claims.** Deployed ≠ verified.
   `app_state.py model-benchmarking 0.4.9` rc **0** read UNPIPED, **and** the served
   bundle carrying `side-nav`/`board-nav`/`grid-open-members` with a positive control in
   the same grep. Repo `civitai-app-model-benchmarking`.
   forcing: gate — the release is submitted and approved but unverified; the arc's
   closing-condition is this check and it currently FAILS.
2. **Get a human to LOOK at it, at desktop width and at ≤720px.** 🔴 Nothing in this
   repo can judge any of it: jsdom performs no layout. Unjudged: the sidebar's depth
   indent (fixed this session, but only its DECLARED value is asserted), the top-bar
   collapse under 720px, the ⋮ trigger's rendered WIDTH (the 44px floor is height-only
   and this is the app's first text-less control), the new `grid-open-members` summary
   beside the title, the vote SVG at a single-digit count, and the grid-title underlines.
   forcing: user — the operator asked for these visual changes; no automated check in
   this repo can answer whether any of them reads correctly.
3. **Repair the store listing.** The capture recipe in `civitai/civitai`
   `.claude/skills/app-capture/scripts/recipes/model-benchmarking.json` pins
   `[data-testid='contribute-trigger']` and `waitForText: "Build a grid"` — **both are
   deleted by this stack**, so the recipe fails at step 1. Needs a PR there, a re-shoot,
   and a second moderator approval. 🔵 Possible upside worth measuring first: because
   `BoardNav` mounts one board at a time the page should be far shorter than the 2166
   CSS px that clipped `section-matchups`/`section-prompts` out of frame, so this may
   ADD screenshots rather than only repair one. That is a HYPOTHESIS and needs the
   released artifact.
   forcing: regression — the live listing depicts a UI that no longer exists, and the
   tool that would re-shoot it is broken by this change.
4. **Contribute menu still does NOT use the upstream component** — CARRIED FORWARD from
   the closed one-page-IA arc, still live. The ask was "use same upstream component as
   native site's nav Create button". The dropdown is now gone entirely (replaced by
   `SideNav` + the ⋮ `Menu`), so re-read the ask before acting: what survives is the
   local `src/components/Menu.tsx`. Blocked on `civitai-app-starters` **issue #485** —
   `<civitai-menu>` throws on MOUNT in any non-browser DOM (`:popover-open` is evaluated
   on the first update because `open` has a constructor default), and upgrading jsdom
   only moves the failure to `panel.showPopover is not a function`; its panel also has no
   app-settable testid. 🔵 Note the NAV elements are NOT blocked by #485 (no popover API).
   forcing: gate — #485 closing, or a real-browser test runner for this repo.
5. **The five-package bump — parked.** CARRIED FORWARD, still live. Patch preserved
   outside this public repo at
   `/home/zach/workspace/civit/.parked/mb-five-package-bump-perpath-b778de4.patch`.
   `civitai-app-starters` **PR #487** (`loading`/`decoding` on `CivitaiImage`) is a
   PREREQUISITE, still OPEN. 🔵 Its prize has CHANGED since it was parked: deleting
   `ContributeMenu.tsx` is no longer the prize (that file is gone), but the bump is now
   what unlocks the real `<civitai-nav-list>`/`<civitai-nav-item>` swap for `SideNav`.
   forcing: gate — #487 merging and releasing.

## 🔴 What the one-page IA cost the listing, and the one way back

**Two of the three sections cannot be photographed at all.** The host sizes the iframe with
`flex: 1 1 0%` inside an `overflow: hidden` parent — to the **viewport**, not to content —
and the app renders **2166 CSS px**, so it is clipped. Measured at three viewport heights
(900/1100/1400 → iframe 752/952/1253): `section-matchups` (y 1175..1482) and
`section-prompts` (y 1500..2142) are below the iframe edge at **every** one. The community
boards are unphotographable by this pipeline, which is a real loss against the tabbed IA.

🔴 **BUT THE APP DOES SCROLL INSIDE ITS OWN IFRAME** — `scrollTo(0,800)` moves `scrollY`
and the host page never moves. An earlier version of this doc claimed scrolling was
"refused twice over"; the second refusal (host-page scroll → `frame.py` `crop_rect_outside`)
is **RETIRED**. Only the first stands: **there is no `scroll` verb** in `KNOWN_ACTIONS`, and
adding one is a change to `plan.py` + `capture.sh` + the bridge op + the mutation battery.
That is the one route to photographing the boards. Recorded as a real option, **not** as
licence to build it unasked.

## What the capture states are now

Three **overlay** states, which need no scroll, keep `yFrom: appFrame`, and each carry
their own testid discriminator — fixing structurally the defect where all three old
`waitForText` anchors matched simultaneously:

| click | overlay | 
|---|---|
| `contribute-trigger` | `contribute-menu-items` |
| `grid-group-matchup` | `matchup-detail` |
| `grid-col-header` | `prompt-detail` |

Two defects **no gate caught**, both now guarded:
- `h=1087` is the tightest *legal* crop height, passes every gate, exits 0 — and puts the
  **support widget** in all three assets. `h=1040` clears it.
- `capture.sh` does **not reload before the FIRST state**, so a run can inherit a
  hand-driven tab and ship an asset with two overlays open. Each state now asserts the
  other two are closed (watched failing on a contaminated setup, exit 4, no asset).

Weakest remaining link, flagged in-file: `waitForText "Matchup"` is a single word unique
only **by case** — a future title-case "Matchups" heading would silently make it inert.

## Still open (ranked)
Retired — superseded by `## Next steps (ranked)` above, which carries the same items with
their forcing functions. Do not add items here.

## The parked bump — why it did not ship, and what would unblock it
Built, measured, deliberately not shipped. Patch preserved **outside this public repo** at
`/home/zach/workspace/civit/.parked/mb-five-package-bump-perpath-b778de4.patch` (583 lines;
applied cleanly to `b778de4`, reached typecheck rc 0 / build rc 0 / money-path 30-30).

🔴 **Its prize was deleting `src/components/ContributeMenu.tsx` (388 lines), and that is
impossible either way** — so the bump buys currency and nothing else:
- `<civitai-menu>` uses the **native popover API** (`panel.showPopover()`,
  `panel.matches(':popover-open')`) and jsdom implements neither. ⚠ **Sharpened against a
  REAL MOUNT, and both corrections make it worse:** it throws on **MOUNT**, not on open —
  `open` has a constructor default, so `changed.has('open')` is true on the first update and
  the element evaluates `:popover-open` immediately (`DOMException: unknown pseudo-class
  selector`). There is no state in which it renders inertly. And **upgrading jsdom is not an
  escape route**: measured at jsdom 30.1.1, the selector stops throwing and the failure
  merely moves to `TypeError: panel.showPopover is not a function`.
- `contribute-menu-items` is part of the capture contract, and upstream renders the panel
  inside its own shadow root. ⚠ Also sharpened: `part="panel"` **does** exist and
  `::part(panel)` resolves, so **styling is not the gap — addressability is**.
  `document.querySelector('[part="panel"]')` is null, and wrapping the items in a consumer
  `<div data-testid>` makes upstream's `assignedElements` see `['DIV']`, so its
  `role="menuitem"` filter yields **zero** items and focus goes nowhere.
  `shadowRoot.querySelector('.panel')` works but couples to an internal class name.

**Filed upstream 2026-09-27** — `civitai/civitai-app-starters` **issue #485** covers both of
the above as one consumer story (either alone still blocks adoption). Closing it needs a
maintainer API decision, or a real-browser runner for this repo.

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
- **`loading="lazy"` was not expressible** on `CivitaiImage` (the element builds its own
  `<img>` in `renderMedia()` and declared no such property), which partly undoes this PR's
  lazy-preview work. ✅ **Fixed upstream in `civitai-app-starters` PR #487** — `loading` and
  `decoding` both pass through, 20/20 CI. Awaiting a maintainer merge and release, so it is
  a *prerequisite* of the bump rather than a cost of it now;
- barrel import costs **+128.81 kB (+31%)** because the root registers all 46 elements;
  per-path imports (`@civitai/components-react/elements/civitai-image`) cost **+27.02 kB**.
  The parked patch uses per-path.

## Upstream, filed 2026-09-27 (`civitai/civitai-app-starters`)
Raised out of this repo's failed adoption attempt; none is ours to close.
- **issue #485** — the menu is not adoptable by an app block: the mount-time popover throw
  and the panel's addressability gap, as one consumer story. Needs an API decision.
- **issue #486** — a **real WCAG 2.5.8 (AA)** finding on shared controls: `<civitai-checkbox>`
  is 16×16 and `<civitai-switch>` 36×20, passing singly via the spacing exception but failing
  in the ordinary stacked-form layout (3 checkboxes → 3 violations). 🔴 The repo's own sweep
  is structurally blind: axe-core 4.12.1 ships `target-size` **disabled**, and its a11y test
  also sets `resultTypes: ['violations']`, so `incomplete` is never collected.
  ⚠ Note what this ISN'T: `<civitai-menu-item>` at 33.6px **clears** 2.5.8 (24×24 AA) and is
  in band with the whole set (button 36, action-button 36, nav-item 28) — 44×44 is 2.5.5
  **AAA**. An earlier framing of mine called it a violation; it is a deliberate density
  choice, and filing it would have sent a maintainer to working code.
- **PR #487** — `loading`/`decoding` passthrough on `CivitaiImage` (above).

## Gotchas / decisions
- 🔴 **A RANK'S PREMISE ROTS WHILE IT SITS IN THE QUEUE — re-derive it before working it,
  not just the claim it makes.** Rank 2 here read "#53 branched BEFORE the IA refactor, so
  expect the disjoint-file break shape". By the time anyone picked it up another session had
  merged `main` into #53 **twice**, and the stated risk could not occur. The doc was not
  wrong when written; it was wrong when read, and nothing in it could say so. **The cheap
  discriminator is ancestry, and it costs one command** — `git merge-base --is-ancestor
  <the-refactor> <pr-head>` plus `git log --oneline <pr-head>..origin/main` — run it BEFORE
  building the integration branch, because it can collapse the whole task. Widest reading:
  any queued item whose justification names *where a branch sits* is a claim with an expiry
  date. Related, and the reason this matters more here than usual: a handoff doc is written
  by a session that cannot see what the next one will find.
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

- 🔴 **THIS ARC IS INVISIBLE TO `--arc`, IN BOTH HALVES — do not read its silence as an
  empty arc.** (a) `find-session.py --arc` exits **5** here: none of the four repo handles
  (`$DEVRC`/`$HOMELAB`/`$DATAPACKET`/`$CIVITAI`) covers
  `civitai-app-model-benchmarking`, so it reads **nothing at all**. (b) Of the six commits
  that ever touched this doc, exactly **one** carries a `Claude-Session-Id:` trailer — the
  genesis `7f4945b` (`ses_f1f51c0d7ffen67u3KpidIMYy5`, an **opencode** session). Every
  later doc commit has none, so the writers half cannot see them.
  **What DOES work:** a corpus-wide keyword search on the slug
  (`find-session.py "consent-resume-and-gated-read" --all-time`) returns exactly **2**
  sessions — the opencode genesis and Claude session
  `96de3010-98d5-4e7b-9c5d-8994e60b24e9`.
- ⚠ **`extract_user_msgs.py` is Claude-Code-only** — it walks `~/.claude/projects`, so the
  opencode genesis session's messages are NOT readable by it (it says so: "1 of 2 selected
  session(s) have NO transcript on this host"). That is a measured limitation, not an
  absence of asks. It also counts background **task-notifications as `typed`**, which
  inflates the count: 28 records here were 9 genuine typed asks, 6 answers, and 13
  notification payloads — separate them by size before reading them as operator messages.
- 🔴 **The release and the capture re-measure were DEADLOCKED, and this doc said the order
  backwards for a while.** The re-measure needs the new IA live; the old instruction said
  not to release first. Releasing was the cheap side, because **listing media is not
  version-scoped** — shipping a version leaves screenshots stale rather than broken.
  Recorded because the same shape will recur on any IA change: *a capture recipe can only
  be measured against a released artifact.*
- 🔴 **A store-listing review opens a MODAL, not a page navigation** — the URL never
  changes, so a click that worked reads as inert and invites re-clicking. Worse, the
  Mantine overlay then intercepts every later click. Hit-test
  (`document.elementFromPoint`) instead of retrying; `Escape` plus a firm `wake` clears a
  stuck overlay; and the modal's Approve button sat at **y=3045** against a 1134px
  viewport, needing `scrollIntoView` before it was reachable.
- 🔴 **A moderator queue can hold MORE THAN ONE app.** The 0.4.7 approval queue listed an
  unrelated `yt-thumbnail` submission ABOVE this one in oldest-first order, so the
  positional selector that worked for 0.4.6 would have approved someone else's app.
  Identify the row BY CONTENT and re-assert it immediately before the click.

- 🔴 **RESOURCE LINKS ARE IMPOSSIBLE FROM AN APP BLOCK TODAY — all three routes measured
  shut, do not re-derive this.** (a) `useCivitaiNavigate(path,'current')` — the host
  rewrites every `NAVIGATE` path to `/apps/run/<slug>/<cleaned>` and shallow-pushes
  (`civitai/civitai` `PageBlockHost.tsx:1883`); the payload's `target` is read **zero**
  times. It is DELIBERATE: that file's security posture at `:175` says a block "can
  deep-link WITHIN its page but can't push the host off to an arbitrary route".
  (b) `'new_tab'` — the host never implements it. (c) `<a target="_blank">` built from
  the SDK transport's `hostOrigin` — `allow-popups` IS grantable, but without
  `allow-popups-to-escape-sandbox` (absent from `ALLOWED_SANDBOX_TOKENS`, stripped by
  `intersectSandbox`) the popup INHERITS the opener's sandbox. **Measured live on the
  running host page: `sandbox="allow-scripts allow-forms"`, no `allow-same-origin`, i.e.
  `trustTier='unverified'`** — so the tab would load civitai.com at an opaque origin,
  logged out. 🔵 **The unlock is a TRUST-TIER change, not a code change.** Filed as
  `civitai/civitai#5209` with the measurement. `LoraRef.modelId` and its round-trip were
  KEPT so the data accrues from today (another author's shared rows can never be
  migrated); `lib/resourceLink.ts` was DELETED because a 4-line string builder has no
  retroactivity cost.
- 🔴 **A SQUASH MERGE BREAKS A STACK, AND THE CHILDREN MUST BE REBASED `--onto`.** After
  merging #59, retargeting #60 to `main` immediately went `CONFLICTING/DIRTY` — the
  squash is a new commit with different parents, so the children genuinely do not descend
  from it. The recipe that worked, twice:
  `git rebase --onto origin/main <old-parent-tip>` (replays ONLY the child's own
  commits), verify the gates on the result, then `git push --force-with-lease=<branch>:<old-sha>`.
  🔴 And **retarget to `main` BEFORE force-pushing**, not after — see the CI gotcha below.
- 🔴 **A FORCE-PUSH DURING THE PARENT'S MERGE CAN DROP THE CI EVENT ENTIRELY.** #61's
  rebased head got **zero** check-runs for 5+ minutes while every other head got one.
  The zero was proven real by running the same query against #60's known-green head as a
  **positive control** (`build=success`), which separated "no CI ran" from "my query is
  wrong". Remedy: `gh pr close` + `gh pr reopen` fires `pull_request: reopened` and CI
  runs. Do not merge on a `CLEAN` mergeStateStatus alone — that is a CONFLICT signal and
  says nothing about CI having finished.
- 🔴 **THE MODERATOR QUEUE HELD TWO APPS, AND THE OTHER ONE WAS FIRST.** `prompt-lab` sat
  ABOVE `model-benchmarking` in oldest-first order, so a positional selector would have
  approved someone else's submission to production. Identify the row **by content**,
  refuse unless exactly one matches, and re-assert immediately before the click.
  Confirmation it worked: `prompt-lab` was still `pending` afterwards.
- 🔴 **THE APPROVE BUTTON IS PARTIALLY COVERED BY THE SITE'S OWN STICKY BOTTOM BAR.**
  `Approve + build` sits at y≈1082 h=36 in a pinned action bar; the site footer
  (`FOOTER.sticky`, 45px, opaque, `z-50`) covers everything below y=1089, so the button's
  CENTRE — which the click op targets — lands on the bar. `elementFromPoint` returns a
  DIV, not the button. The window cannot scroll (`scrollHeight - clientHeight == 0`).
  Remedy that worked and changes no layout: set `pointer-events: none` on the sticky
  footer, re-hit-test, click, then RESTORE it. Hit-test before every approval click.
- 🔴 **THE WHOLE SESSION'S PATTERN: every defect that mattered PASSED CI, and none would
  have been caught by reading the code.** Five guards proved less than they claimed:
  (1) the sidebar depth indent was DEAD — `padding: '6px 10px'` after `paddingLeft` in
  the same style object, and React serialises in INSERTION ORDER, so every nav row sat at
  10px; the only witness asserted `--civitai-nav-depth`, **which nothing in this tree
  consumes**. (2) `money-path` §5 case 1 was VACUOUS — its spend-attempt helper pressed
  Run, which set `confirming`, which made the cell render as `running`, so the helper
  REPAIRED both observables the case then asserted. (3) the no-navigation guard pinned
  the MECHANISM (`NAVIGATE`) not the STATE, so `window.open` and `window.location.href`
  handlers both survived. (4) `includedCount={0}` at two of four call sites left the full
  suite green. (5) a report test switched BOARDS rather than unmounting, so its mutant
  stayed green. **The lesson that generalises: ask what property your witness actually
  reads, and whether anything consumes it.**
- 🔴 **jsdom SYNTHESISES the `padding` shorthand from four longhands**
  (`"6px 10px 6px calc(24px)"`), so `style.padding === ''` cannot distinguish "no
  shorthand written" from "four longhands written" and can never catch the override bug.
  It also FOLDS `calc()`: `calc(10px + 14px)` reads back as `calc(24px)`. Assert
  `paddingLeft` against LITERALS — deriving the expectation from the component's own
  `NAV_DEPTH_STEP_PX` is exactly what made the deleted guard unable to fail.
- 🔴 **`Object.freeze` on a `Set` is decoration** — it does not prevent `.add()`/
  `.delete()`. Found by an independent auditor on this session's own reported-keys work.
- 🔴 **LSP/editor diagnostics in this repo were WRONG SEVEN TIMES this session** —
  phantom `Cannot find module 'react'` waves, jest-dom matchers "missing", and a filename
  reported in the wrong case (which sent me chasing a non-existent `gridsview.tsx`).
  `tsc --noEmit` in a correctly-installed tree is the ONLY arbiter. Do not act on one.
- 🔴 **`find` does NOT follow pnpm's symlinks.** `find node_modules/@civitai -name '*.d.ts'`
  yielded **2** files; `find -L` yielded **150**. That blindness made me report "there is
  no navigation API" when `useCivitaiNavigate` was sitting in the installed
  `blocks-react@0.51.0`. Always run a positive control before believing a zero.
- ⚠️ **A rank's premise rots while it sits in the queue** (carried forward, still true):
  re-derive it before working it. `git merge-base --is-ancestor` plus
  `git log --oneline <pr-head>..origin/main` costs one command and can collapse the task.
- **Decided (operator, 2026-09-29):** badges are removed from the list CARDS as well as
  the detail modals · the open-grid panel carries vote/withdraw/report (the Top Grid,
  being a system entry, offers none) · reported-keys are hoisted to `App` so the settled
  state survives a menu close · the sidebar is LOCAL, mirroring the upstream
  `civitai-nav-list`/`civitai-nav-item` contract, with the swap deferred.
- 🔵 **The upstream nav elements are jsdom-safe** — `<civitai-nav-list>`/
  `<civitai-nav-item>` use no popover API, so starters **#485 does NOT block them** (it
  blocks `<civitai-menu>`). The swap is gated only on the five-package bump, whose own
  prerequisite is starters **PR #487**, still open. Two snags at swap time: upstream puts
  the clickable at `part="link"`/`part="button"` inside its shadow root, and its ~32px
  height is below this repo's 44px floor.

## How to verify
- Gates, in a worktree WITH `node_modules`: `pnpm run typecheck && pnpm test && pnpm build`
  — **59 files / 804 tests**, and 59 must equal `git ls-files | grep -cE '\.test\.tsx?$'`.
  Read BOTH vitest projects separately; exit codes from files, not through a pipe.
- Release: `python3 ~/.config/opencode/skills/civitai-app-fleet/app_state.py model-benchmarking 0.4.9`
  rc 0 = live, **read UNPIPED**.
- Served bundle, with the positive control in the SAME command:
  ```bash
  B=$(curl -s https://model-benchmarking.civit.ai/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
  curl -s "https://model-benchmarking.civit.ai/$B" > /tmp/live.js
  for t in side-nav board-nav grid-open-members; do echo "$t $(grep -c $t /tmp/live.js)"; done   # expect >0
  for t in section-grids grid-open-panel; do echo "CONTROL $t $(grep -c $t /tmp/live.js)"; done  # expect >0
  ```
- 🔴 **What CANNOT be verified here, ever:** the real Buzz spend loop (Turnstile + auth
  gated — no local, harness or test run proves a cell charged correctly), and anything
  about LAYOUT or appearance (jsdom performs no layout). Say so plainly rather than
  reporting a green suite as if it covered either.
## Goal
Ship the operator's second and third rounds of IA feedback — a sidebar nav with My
Benchmarks, a one-board-at-a-time subnav, community-only boards, a ⋮ row menu, an SVG
vote glyph, no badges in the detail modals — and release it as 0.4.9.
- **closing-condition:** `check` — `app_state.py model-benchmarking 0.4.9` exits **0**
  (`approved/live`, read UNPIPED), **and** the served bundle at
  `https://model-benchmarking.civit.ai/` carries `side-nav`, `board-nav` and
  `grid-open-members` with a positive control present in the same grep.
  🔴 **NOT MET as of 2026-09-29.** Approved, still `building`; production serves 0.4.8.
- ✅ **The PRIOR arc is CLOSED and its condition was MET 2026-09-28** — carried forward so
  the closure is not lost when this section is replaced again. That arc was "ship the
  one-page IA refactor and get it live, then restore the store listing"; all three of its
  checks passed (`app_state.py … 0.4.7` rc 0, the served bundle carrying
  `section-grids`/`contribute-trigger` with `view-switch-*` at 0, three screenshots taken
  against 0.4.7). Two of its ranks also closed and must NOT be re-opened: the dropped
  "make it full-width" instruction (operator: **drop it, superseded** — the CLOSED block
  under Open investigations carries the ruled-out evidence, and the shell-width reading is
  disproven, do not re-derive it), and the PR #53 SDK-port test-merge (green, merged as
  0.4.8).

## Standing deferrals (not queued)
🔴 **Deliberately NOT ranks.** Nothing external is asking for either, so under this doc's own
rule they are not eligible to be worked — giving them a rank would inflate the queue with
items no one can close. Promote one to `## Next steps` only when something external starts
asking.

- **Real-host verification.** Turnstile + auth gated; no local, harness or test run covers
  it. The consent → Allow → Confirm path spends exactly once; an unreadable balance offers
  **Retry balance check** and never claims a shortfall. Also the two VISUAL asks nothing has
  judged — "update styling so it's intuitive" (the matchup section band) and "improve their
  display" (the inline grid previews). jsdom performs no layout, so no test in this repo can
  answer either; the captured screenshots show the bands rendering, but nobody has ruled on
  whether they READ as intuitive.
- **Grid edit-in-place tripwire** (deferred 2026-09-09, nothing watches it): does any
  published grid render a non-zero missing-member count, or is the published-grid count near
  ~10?

## Open investigations — live diagnosis state
### ✅ CLOSED 2026-09-28 — "make it full-width" (was: a dropped operator instruction)
🔴 **RESOLVED BY ASKING, WHICH IS WHAT THE `Next probe` BELOW PRESCRIBED. Do not re-open
this, and do not re-derive the shell-width reading.** Put to the operator on 2026-09-28;
the answer was **"drop it — superseded"**: whatever it referred to no longer exists or no
longer matters after the 0.4.7 one-page IA refactor. **No layout change is owed, and none
should be made on the strength of this entry.** The diagnosis below is preserved only as
the record of what was ruled out — every "Ruled out" line was re-checked against the live
tree at close time and still holds (`contentStyle` carries no `maxWidth`; the only
`maxWidth`s in `src/` are `RootBoundary.tsx:76` = 440, `EmptyState.tsx:38` = 380, and
`ResultsGrid.tsx:292` = `'100%'`).

<details>
<summary>Original investigation (closed — evidence only)</summary>

- as-of: 2026-09-28
- **Symptom + exact repro:** the operator typed `make it full-width` and received no
  response of any kind. Reproduce the evidence with:
  `python3 $DEVRC/scripts/session-analysis/extract_user_msgs.py --session 96de3010-98d5-4e7b-9c5d-8994e60b24e9 --include-answers -o /tmp/msgs.md`
  then read message **#3**.
- **Observed (with values):** record **500** of
  `~/.claude/projects/-home-zach-workspace-civit-civitai-app-model-benchmarking/96de3010-98d5-4e7b-9c5d-8994e60b24e9.jsonl`,
  `ts=2026-09-27T05:25:21.034Z`, body exactly `make it full-width`. Walking forward from
  record 500, the next `type=assistant` record carrying a text block is **empty output** —
  no assistant turn responded. It arrived immediately after the 0.4.6 completion report
  (the preceding assistant text ends "...~33 stale merged remote branches — deleting those
  is a separate call.") and the next handled message was the IA-refactor feedback at
  `05:34:06`.
- **Ruled out:** *"the app shell is already capped and this is asking to uncap it"* —
  `src/theme.ts` `contentStyle` carries `width: '100%'` and `margin: '0 auto'` with **no**
  `maxWidth`, and its own comment reads "uncapped full-width behaviour from #16 is
  unchanged"; a tree-wide search finds `maxWidth` only in `RootBoundary.tsx:76` (440,
  an error card), `ResultsGrid.tsx:292` (`'100%'`, a containment cap) and
  `EmptyState.tsx:38` (380, body copy). `via: code`
- **Ruled out:** *"it was answered later under a different wording"* — no assistant turn
  between `05:25:21` and the `05:34:06` feedback message addresses width, and the phrase
  appears nowhere else in the transcript. `via: command`
- **Leading hypothesis:** it referred to something the operator had on screen at 05:25 —
  most likely the live app at `/apps/run/model-benchmarking` under the 0.4.6 IA — and not
  to the app shell's CSS, which was already uncapped. Unresolvable from the repo alone.
  ⚠ Note the app is **full-bleed at the host** (`APPFRAME_RECT` reports `leftInset=0`,
  `rightGap=-1` — the app frame IS the viewport), which makes a shell-width reading
  *less* likely, not more.
- **Next probe:** ASK THE OPERATOR what it referred to. Do not guess and ship a layout
  change — this is a one-question unblock, and the cost of guessing wrong is a visual
  regression on a live app that nothing in this repo can test (jsdom performs no layout).
  ✅ **Done 2026-09-28. Answer: drop it — superseded. See the CLOSED banner above.**

</details>

### 0.4.9 approved but stuck in `building` for 25+ minutes
- as-of: 2026-09-29
- **Symptom + exact repro:** `python3 ~/.config/opencode/skills/civitai-app-fleet/app_state.py model-benchmarking 0.4.9`
  prints `model-benchmarking 0.4.9 approved/building`, rc **1**, unchanged across ~50
  polls over ~25 minutes. The CLI's own text says approval usually deploys "in a few
  minutes".
- **Observed (with values):** approval landed 2026-09-29 ~10:43 CDT (the review page
  showed "Submission approved. Returning to the review queue."). `civitai app status`
  lists `model-benchmarking 0.4.9 approved building e8775c0`. The served bundle is
  still `assets/index-PwE4InET.js` (434,453 B) and carries none of the four 0.4.9-only
  tokens while the positive control fires. `via: measurement`
- **Ruled out:** *"it deployed and my check is wrong"* — the bundle grep carries a
  positive control in the same command (`section-grids` 1, `grid-open-panel` 1,
  `contribute-trigger` 1), so the four zeros are real and not a broken pattern.
  `via: measurement`
- **Ruled out:** *"the wrong commit was submitted"* — `civitai app status` reports
  SOURCE `e8775c0`, which is `origin/main`'s tip. `via: command`
- **Leading hypothesis:** an ordinary slow platform build (the builder runs
  `block.manifest.json`'s `buildCommand` on its own image, cold, and CI is a different
  environment), OR a stalled/failed build the state field has not yet reflected.
  Nothing observed distinguishes them.
- **Next probe:** `python3 ~/.config/opencode/skills/civitai-app-fleet/app_state.py model-benchmarking 0.4.9`
  read UNPIPED (a pipe reports `tail`'s rc, which is how a pending gets called live).
  If still `building` after another hour, check the platform build log / Tekton side —
  the app-blocks platform skill in `talos-infra` owns that surface, not this repo.

### An unexplained SECOND publish request for 0.4.9
- as-of: 2026-09-29
- **Symptom + exact repro:** `civitai app status model-benchmarking` reports
  `Publish request: pubreq_01M3PXAZQKRAE1M8SXKE9XGCGX`, `Status: withdrawn`,
  `Submitted: 2026-09-29 10:43 CDT`, `Deploy state: -`.
- **Observed (with values):** `civitai app submit --yes` was run **exactly once** this
  session and returned `pubreq_01M3PX578J3B4A7K95P1D6HMM2` at ~10:39. That first one is
  the `approved building e8775c0` row. The second, at 10:43 — the same minute as the
  approval click — has **no source sha** and is withdrawn. `civitai app status` with no
  argument shows both rows. `via: command`
- **Ruled out:** *"I submitted twice"* — one `submit` invocation, one returned pubreq id,
  recorded in the transcript. `--package-only` was run once before it and writes only a
  `.zip`. `via: command`
- **Leading hypothesis:** the approval flow supersedes the open request and records the
  superseded one as `withdrawn`; the 10:43 timestamp matching the approval click is the
  main support. UNVERIFIED — this is a guess about platform behaviour, not a reading.
- **Next probe:** compare against another app's approval in the same window —
  `civitai app status` (no arg) already lists `yt-thumbnail` and `sensei` rows; check
  whether every approved version there also carries a paired `withdrawn` row of the same
  version. If it does, this is normal platform bookkeeping and the investigation closes.
## Defects (batched)
Round-1 audit findings that were reported and deliberately NOT fixed. Fix as one batch.
🔴 Each is a claim from an audit, not a measurement of mine — re-verify before acting.
- **#59 — pressing `grid-open` dumps keyboard focus on `<body>`.** The card holding the
  just-clicked button unmounts (it is filtered out of the list), and no focus management
  was added. At base the button survived as `Showing`/`aria-pressed="true"`. This repo
  already treats the hazard as real (`ContributeMenu.tsx:127`) and asserts focus with
  `toHaveFocus` in three suites. NOT in the fix round's brief — still open.
- **#60 — `nav-my-group` is a `role="list"` rendered as a direct child of another
  `role="list"`**, so AT reads a flat 2-item list then an unrelated 3-item one; the
  parent/child relation is not conveyed. `sideNav.test.tsx` encodes the flattening as
  correct.
- **#61 — `document.location.href = …` escapes the no-navigation guard.** Narrow: a bare
  `location.href` IS caught; only the explicit `document.` spelling escapes, and an
  `<a href>` created inside a handler is invisible to jsdom. Both documented in-file with
  a surviving mutant proving the gap's exact size.
- **#61 — `MyPublished` renders an empty line beside the error** on all three nouns;
  suppressing it is a `MyPublished` change with three callers.
- **#59 — three scaffolding simplifications** (a fixture-distinctness assertion that can
  only fire if the test's own table is edited; two of three `grid-preview-shown-above`
  archaeology markers; a criterion-10 tail duplicated at the node tier).
