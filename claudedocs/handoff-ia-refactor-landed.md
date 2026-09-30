# Handoff: model-benchmarking IA — sidebar/subnav/modals, 0.4.9 — 2026-09-29

⚠️ **Slug is `ia-refactor-landed` for continuity — the EFFORT is this app block's IA work,
and this doc is updated in place rather than forked.** The one-page-IA arc it was named
for CLOSED 2026-09-28; two further operator feedback rounds opened the arc below. Ranks 4
and 5 are carried forward from that arc and are still live — do not drop them.

## Run this first — the index, one command
```bash
$DEVRC/scripts/cairn-ops/read.sh recall --repo "/home/zach/workspace/civit/civitai-app-model-benchmarking"
```
Terse pointers this doc does not carry, curated by past sessions and outliving it.
🔴 RECALL, NOT LIVE OBSERVATION — every line is a pointer to VERIFY, never a current
reading, and it may describe a gotcha already fixed. `scope-absent`/`scope-empty` means
nothing is recorded yet: ordinary, not an error, and not a clean bill of health.
Non-blocking: if it exits non-zero, print the stderr line and carry on.

⚠️ **No `clawgate-task:` field.** `clawgate_handoff.sh resolve` exited **5** (nothing
resolved) on both sessions of this arc, and `… field <doc>` exits **1** (none present).
An unknown session id answers 200 with an empty array, so that zero cannot distinguish
"touched no task" from "wrong id". It is not a clean bill of health.

## State now
- **`main` = `7c20155`.** Two feature PRs landed earlier: **#66** (`36777e5`) and **#67**
  (`53609a7`), both merged after a full audit ladder. Then two release PRs this session:
  **#68** (`a9cd81e`, 0.4.12) and **#69** (`7c20155`, 0.4.13). Session branch
  `docs/handoff-arc-audit-and-recipe-repair` carries this doc; **PR #65 is still OPEN**, so
  `main`'s copy is the pre-#65 version — update here, not on `main`.
- ✅ **0.4.13 IS LIVE AND #66/#67 ARE IN PRODUCTION — verified by served content, 2026-09-30.**
  `app_state.py … 0.4.13` → `approved/live`, **rc 0**, read unpiped. Served bundle moved to
  `assets/index-DlkHPI8F.js` (448,095 B, from 0.4.11's `index-t70oWAUj.js` / 440,492 B):
  the three testids that are net-new between the 0.4.11 base `5a83f89` and `main` —
  `my-list-panel` · `my-list-empty` · `draft-badge` — each grep **1** where they grepped **0**
  on 0.4.11, with the carried controls `side-nav` 4 · `board-nav` 1 · `grid-open-members` 1 ·
  `section-grids` 1 · `grid-open-panel` 1 all firing and retired `contribute-trigger` /
  `view-switch` at **0** as the negative control. ⚠️ The served hash is NOT the locally-built
  one (`index-DkIWM9P2.js`, 447,826 B) — the platform builds on its own image, so **byte
  identity is not available as evidence; the testid deltas are what establish content.**
- 🔴 **0.4.12 IS `approved/failed` — `Deploy detail: Deploy timed out`.** Approved 18:08, failed
  18:15. A FOURTH distinct release failure mode for this app, and the LATEST in the pipeline so
  far: it got past build AND registry push into `deploying`, unlike 0.4.9/0.4.10's
  `crane push exit: 1`. Fixed by a retry at 0.4.13, no code change — same bundle bytes.
- ✅ **THE ORIGINAL ARC'S CLOSING-CONDITION IS MET AND THAT ARC IS CLOSED** (see `## Goal`, met at 0.4.11, re-met at 0.4.13). Everything in `Next steps` is a NEW arc or a pre-existing deferral. 🔴 This line has now been dropped by THREE successive `State now` replaces and restored each time by the durable-drop warning — carry it forward.
- 🔴 **0.4.9 is STILL `approved/building`** — unchanged after four more releases, still a
  rollback hazard. Rank 3. Note the contrast that makes it the hazard: `building` is QUEUED,
  while 0.4.12's `failed` is TERMINAL and harmless.
- 🔴 **`app_state.py <version>` rc 0 IS TRUE FOR TWO VERSIONS AT ONCE** — both 0.4.11 and 0.4.13
  read `approved/live` rc 0 right now, because a per-version record is not retired when a newer
  one deploys. So rc 0 on an older version is neither a rollback signal nor proof of anything
  about the live bundle. Details under `How to verify`.
- **#66 — six UI changes** (`36777e5`): My Benchmarks open by default · a visible active nav
  row mirroring `BoardNav`'s segmented control · responsive matrix `minmax(200px, 420px)` ·
  System-grid badge dropped from both sites · compact-nav grouping + chrome · `token.surface2`
  DELETED and consolidated to `recessedSurface`. Gates 60 files / 822 tests.
- **#67 — My Benchmarks rework** (`53609a7`): one `MyList.tsx` per noun replacing
  `MyPublished.tsx` + `UnpublishedList.tsx` (both deleted) · a primary New CTA · a `Draft`
  badge with per-state actions · Edit on the row, Remove/Archive in a ⋮ · **`updateGrid` —
  published grids were not editable at all before this**. Gates 60 files / **846** tests.
- **Claim `ia-refactor-landed-1` HELD** (rank 1). `ia-refactor-landed-2` released.
- ⚠️ **No `clawgate-task:` field.** `clawgate_handoff.sh resolve` exited **5** again. An
  unknown session id answers 200 with an empty array, so that zero cannot distinguish
  "touched no task" from "wrong id". Not a clean bill of health.
- ⚠️ **`.claude/` is UNTRACKED and NOT gitignored** in this repo (`git status` shows `?? .claude/`).
  Agent worktrees live under `.claude/worktrees/`. Harmless while `git add -A` stays banned,
  but an earlier note claiming that path is gitignored was wrong.

## Next steps (ranked)
🔴 **Ranks 1–5 keep their numbers — a live claim is keyed to rank 1. Do not re-rank.**
1. **The operator judges the live app. ✅ NOW UNBLOCKED — 0.4.13 is live and carries #66/#67.**
   Covers the 16 taste findings in the contact sheet, plus everything #66/#67 changed that
   nothing here can see — whether cells render larger, whether the 420px ceiling is right,
   whether the active nav row is legible in either theme, whether the New CTA reads as primary,
   and the ⋮ placement. jsdom resolves no layout. Repo `civitai-app-model-benchmarking`.
   🔴 **The deadlock that blocked this is GONE, and it is worth naming because it will recur:**
   this rank said "judge the live app" while the live app was three generations behind `main`,
   and rank 6 said release only AFTER rank 1 — so neither could move. **The operator broke it by
   choosing to release first** (2026-09-30), on the reasoning that listing media is not
   version-scoped. The alternative, recorded as viable and not taken: photograph a LOCAL build
   of `main` in a real browser, which reviews layout without shipping. Either resolves it; the
   ordering as written does not.
   forcing: user — the operator commissioned these changes; no automated check in this repo can
   judge appearance, and they are now live and unjudged.
2. **Repair the store listing.** ✅ The recipe half is DONE and merged (`civitai/civitai`
   **#5247**, squash `7bf4d1bde1`) — 5 states, then cut to 3 boards, crop `h=1224`. 🔴 **But it
   is already stale again:** #66's responsive matrix and #67's list rework both changed the
   layout the crop was measured against, and #66 made `nav-my` a TOGGLE, so any recipe step
   pressing it to reveal sub-items must drop that press. **Re-measure and re-shoot before
   attaching.** Still blocked on the two content problems in `## Defects (batched)`.
   forcing: regression — the live listing depicts a UI three generations old, and the recipe's
   crop no longer matches the app it photographs.
3. **Watch 0.4.9, or get the platform to cancel it.** `app_state.py model-benchmarking 0.4.9`
   read UNPIPED. 🔵 `building` vs `deploying` is the discriminator.
   forcing: regression — a queued build that would revert a live, verified deployment.
4. **The upstream overlay decision — now THREE items behind one gate.** `civitai-app-starters`
   **#485** (menu), **#496** (the dialog family), **#497** (the lightbox). All OPEN.
   forcing: gate — a maintainer API decision on #485/#496; #497 is explicitly blocked on it.
5. **The five-package bump — parked.** Patch outside this public repo at
   `/home/zach/workspace/civit/.parked/mb-five-package-bump-perpath-b778de4.patch`.
   Starters **PR #487** is the prerequisite, still OPEN.
   forcing: gate — #487 merging and releasing.
6. ✅ **DONE 2026-09-30 — #66 + #67 are live as 0.4.13.** Two attempts: **#68** → 0.4.12
   (approved, then `Deploy timed out`); **#69** → 0.4.13, byte-identical bundle, `approved/live`.
   Verified by served content, both controls — see `## State now`. 🔴 **The ordering caveat here
   was DELIBERATELY OVERRIDDEN by the operator**, not skipped: production was three generations
   behind `main`, so there was nothing live to judge. **Do not re-open**; what remains is rank 1
   (judging it) and rank 2.
   forcing: none — closed.

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
- 🔴 **LSP/EDITOR DIAGNOSTICS IN THIS REPO HAVE BEEN WRONG NINE TIMES ACROSS THIS ARC —
  `tsc --noEmit` IN A CORRECTLY-INSTALLED TREE IS THE ONLY ARBITER. DO NOT ACT ON ONE.**
  ⚠️ CONSOLIDATED 2026-09-30 from three bullets; the nine are the union. The shapes seen:
  phantom `Cannot find module 'react'` waves · a `useRef` "not found" that was imported ·
  jest-dom matchers reported "missing" · module-resolution errors after worktrees were removed ·
  a filename reported in the wrong CASE, which sent a session chasing a non-existent
  `gridsview.tsx` · symbols that exist in no tree. **The usual root cause is an agent worktree
  with no `node_modules`** — which is also why a fresh worktree needs `.envrc` copied,
  `direnv allow`, and `pnpm install --frozen-lockfile` before any diagnostic means anything.
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

- 🔴 **THIS ARC IS INVISIBLE TO `--arc`, IN BOTH HALVES, AND ALWAYS WILL BE UNTIL A HANDLE
  COVERS THIS REPO — do not read its silence as an empty arc.** ⚠️ CONSOLIDATED 2026-09-30 from
  two bullets; the earlier one's "six commits, exactly one trailer" count is SUPERSEDED (see the
  four-sessions bullet: 9 commits, 4 with trailers). (a) `find-session.py --arc` exits **5**
  here — the four handles are `$DEVRC`, `$HOMELAB`, `$DATAPACKET` and
  `$CIVITAI=/home/zach/workspace/civit/civitai`, none of them this app repo — and **exit 5 means
  nothing was read AT ALL**, which is not an empty arc. Re-measured 2026-09-30. (b) Most doc
  commits carry no `Claude-Session-Id:` trailer, so the writers half cannot see them either.
  **What DOES work:** enumerating the project's own transcript directory
  (`~/.claude/projects/-home-zach-workspace-civit-civitai-app-model-benchmarking/*.jsonl`),
  which is exhaustive for the Claude half; or a corpus-wide keyword search on the slug
  (`find-session.py "<slug>" --all-time`). The opencode genesis session is readable by neither
  that nor `extract_user_msgs.py` (Claude-Code-only, walks `~/.claude/projects`).
  🔴 Same blindness bit `handoff_search.py` on 2026-09-30: it printed
  `in_scope_docs=520` EQUAL to `indexed_docs=520` with `excluded=ia-refactor-landed`, i.e. the
  exclusion parsed but matched nothing — **this repo's handoff docs are not in the corpus at
  all**, because it is not in `REPO_ENV_HANDLES`. Read `excluded=` and the doc-count PAIR, never
  `excluded=` alone.
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
- 🔴 **THE APPROVAL QUEUE HOLDS MORE THAN ONE APP AND THE OTHER ONE IS USUALLY FIRST — SIX
  ATTEMPTS, SIX TIMES.** ⚠️ CONSOLIDATED 2026-09-30 from three near-identical bullets that had
  accumulated across sessions; every measurement below was in one of them. `yt-thumbnail` sat
  above this app at 0.4.7; `prompt-lab` sat above it at 0.4.9, 0.4.10, 0.4.11, **and again at
  0.4.12 and 0.4.13** (submitted 9/29, so oldest-first puts it first every time). A positional
  selector would approve **someone else's submission to production**. The recipe: assert exactly
  ONE row whose text matches the app slug, assert that row does NOT mention the other app, stamp
  a temporary marker attribute on its single `Review` control, click the marker selector, remove
  the attribute — refusing rather than guessing at every step, and re-asserting immediately
  before the click. Same shape for `Approve + build`, whose immediate neighbour is `Reject…`.
  Confirmation it worked, every time: `prompt-lab` stayed `pending` afterwards.
- 🔴 **THE APPROVE BUTTON MAY OR MAY NOT BE COVERED BY THE SITE'S OWN STICKY FOOTER — SO
  HIT-TEST EVERY TIME AND NEVER APPLY THE WORKAROUND BY HABIT.** ⚠️ CONSOLIDATED 2026-09-30 from
  three bullets. `Approve + build` sits at y≈1082 h=36 in a pinned action bar against a 1134px
  viewport, and `FOOTER.sticky` (45px, opaque, `z-50`) covers everything below y=1089 — so the
  button's CENTRE, which the click op targets, can land on the bar; `elementFromPoint` then
  returns a DIV. The window cannot scroll (`scrollHeight - clientHeight == 0`) and
  `scrollIntoView` does not always clear it. **Measured covered on 0.4.9; NOT covered on 0.4.10,
  0.4.11, 0.4.12 and 0.4.13** (`hitIsBtn: true` straight away). Remedy when it IS covered,
  changing no layout: set `pointer-events: none` on the sticky footer, re-hit-test, click,
  then RESTORE it.

- 🔴 **RESOURCE LINKS ARE IMPOSSIBLE FROM AN APP BLOCK TODAY — all three routes measured shut;
  DO NOT RE-DERIVE.** 🔵 The unlock is a **TRUST-TIER change, not a code change**; filed
  `civitai/civitai#5209` (re-checked 2026-09-30: still OPEN). `LoraRef.modelId` was KEPT so data
  accrues from today; `lib/resourceLink.ts` was DELETED. ⚠️ **The full measured detail —
  `PageBlockHost.tsx:1883` and its `:175` security posture, the `'new_tab'` gap, the live
  `sandbox="allow-scripts allow-forms"` / `trustTier='unverified'` reading, and
  `ALLOWED_SANDBOX_TOKENS` / `intersectSandbox` — lives in the cairn entry
  `model-benchmarking-block` (2026-09-29), evicted from here 2026-09-30 for the byte ceiling.**
  Recall it with the command at the top of this doc rather than re-measuring.
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
- 🔴 **`find` does NOT follow pnpm's symlinks.** `find node_modules/@civitai -name '*.d.ts'`
  yielded **2** files; `find -L` yielded **150**. That blindness made me report "there is
  no navigation API" when `useCivitaiNavigate` was sitting in the installed
  `blocks-react@0.51.0`. Always run a positive control before believing a zero.
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

- 🔴 **A RELEASE CAN FAIL ON THE REGISTRY PUSH AFTER BUILDING AND SCANNING CLEAN — READ
  `Deploy detail`, NOT THE STATE STRING.** `approved/building` and `approved/failed` are
  the only signals `app_state.py` gives, and neither distinguishes a slow build from a
  dead one. `civitai app status model-benchmarking` carries a truncated `Deploy detail`
  with the actual pipeline output, and that is where `crane push exit: 1` and the registry
  i/o timeout live. 🔴 The generalisable error was mine: I reasoned from
  *CI-is-a-different-environment* toward "the builder must be choking on our bundle" and
  was wrong — `kaniko build exit: 0` sat directly above the network error the whole time.
  **Read the failure output before theorising about the cause.** Three attempts, only the
  third landed; the fix was a retry, not a code change.
- 🔴 **`click ok = true` IS A CLAIM ABOUT DISPATCH, NOT ABOUT EFFECT — a THROTTLED tab
  eats clicks silently.** A "Review" click on `/apps/review` returned ok, hit-tested clean
  (`hitIsButton: true`, `disabled: false`) and did nothing; `visibilityState` was
  `hidden`. Only a `browser wake` **immediately before** the click made it land. A `wake`
  earlier in the same sequence is not enough — the tab re-throttles. Re-wake before every
  click in a background tab, and verify the EFFECT on an independent surface: the
  approval that mattered read `approved: false` in the DOM while `app_state.py` already
  said `approved/building`.
- 🔴 **A PUBLIC-REPO COMMIT MESSAGE IS A LEAK SURFACE, AND THE HOOK IS THE ONLY READER.**
  `bash-guard` refused a commit whose message quoted the platform's registry IP — correct,
  and this repo is a public OSS mirror. Elide infrastructure addresses as
  `<registry-ip>`/`<image-ref>` and point at the live command instead. ⚠️ Note
  `handoff_doc.py` reports **no leak scanner in this repo** (`tests/leakscan.py` absent),
  so a handoff delta is a PASS BY ABSENCE, never a clean result.
- ⚠️ **A HANDOFF PR LEFT OPEN MAKES `main` THE WRONG BASE FOR THE NEXT UPDATE.** #62 was
  still open when this update was written, so `main`'s copy of this doc was the PRE-update
  version; running `handoff_doc.py` on `main` would have merged against a stale base and
  lost the earlier delta. The fix is to update ON the open PR's branch (rebased onto
  `main` first). Check `gh pr list --state open` before choosing where to run it.

- 🔴 **`resume-state.sh`'s `handoff-read:` STALE VERDICT HAS NOW INVERTED THREE TIMES ON THIS
  DOC, AND FOLLOWING IT WOULD FRAME A WHOLE SESSION ON THE WRONG COPY.** ⚠️ CONSOLIDATED
  2026-09-30 from two bullets plus a third occurrence measured that day. **It is a LINE COUNT,
  and a line count cannot tell "behind" from "ahead".** (1) At #62 it called the working tree
  STALE (660 lines vs 395) when the tree was two commits AHEAD, and its `DOD`/`DRIFT` blocks were
  then computed from the older copy — a superseded closing-condition (`0.4.7` for `0.4.11`) and a
  false `PR #53 framed as open`. (2) Same again later on #62. (3) **2026-09-30 on #65: STALE at
  780 local vs 792 on `origin/main`, while the tree was THREE commits ahead** — the count
  inverted because commit `0844c79` had EVICTED five closed investigations to the ARCHIVE, so the
  authoritative copy was genuinely SHORTER. That is the sharpest form of the trap: **an eviction
  makes the newer doc smaller, so size-based staleness gets it exactly backwards.**
  **The discriminator costs one command:** `git log --oneline origin/main..HEAD -- <doc>` —
  non-empty ⇒ the working tree is ahead and the verdict is inverted. Any tool that assumes the
  mainline is authoritative is wrong for the whole life of an open docs PR.
  ✅ Reader-side fix merged upstream in `devrc` PR **#1935** (`c8b65c97`); ⚠️ the SCRIPT still
  reports a difference rather than a direction, so this will recur.
- 🔴 **NO BROWSER WORK ON THIS APP HAS EVER NEEDED THE OPERATOR'S SCREEN — ZERO RAISES, TWICE.**
  ⚠️ CONSOLIDATED 2026-09-30 from two bullets. CDP reads, clicks and screenshots all work on a
  background tab, so `browser activate` was never called on either the capture pass (focused
  window `39845914` and workspace `1` read back identical) or the 0.4.12/0.4.13 approvals.
  **Ask for zero before settling for raise-once** — they are different claims and the rules
  require naming which you achieved. 🔴 **And check you CAN restore before deciding a raise is
  affordable:** on 2026-09-30 `xdotool getactivewindow` and the i3 workspace query BOTH returned
  EMPTY (no `DISPLAY` in the shell), so `PREV_WIN`/`PREV_WS` were unobtainable and any raise
  would have been **unrestorable**. The restore values are not always there.
- 🔴 **Light theme was obtained by a contained in-frame `data-theme="light"` override, NOT by
  flipping the host colour scheme** — the host toggle writes `localStorage` for the whole
  origin and would have changed the operator's other Civitai tabs. Any future capture pass
  must do the same.
- 🔴 **THE ARMED WITHDRAW CONFIRM MUST NOT BE PHOTOGRAPHED ON LIVE.** One stray click removes
  a real published row, author-scoped and unrecoverable. It was skipped deliberately and
  should stay skipped; capture it in the harness or not at all.
- 🔴 **~10 RUN-CELL STATES ARE PHOTOGRAPHABLE NOWHERE WITH TODAY'S TOOLING** — `cell-progress`,
  `cell-stalled`, `cell-failed`, `cell-insufficient`, `cell-balance-retry`, `cell-publishing`,
  `cell-publish-preview`, `cell-resume-run`, `cell-unknown`, and `cell-confirm-run` past the
  gate. Live needs real Buzz or a forced production failure; the harness renders gated cells
  fail-closed (⚠ but see the Open investigations block — that premise is now in doubt). Only
  the component tests reach them, via `fakeGatedCell()` at `src/test-helpers.tsx:498`. That
  gap is itself the finding; closing it means a fixture/story page, which nobody has asked for.
- 🔴 **`grep -c` on a `.d.ts` inside `node_modules` needs `-L` and a positive control** —
  pnpm's real files live under `node_modules/.pnpm/…` and `node_modules/@civitai/<pkg>` is a
  symlink; `find` without `-L` yields ~2 files where `find -L` yields ~150. Every zero quoted
  in the Open investigations block above carries its control in the same command.
- **Decided (this session):** taste-pass findings are filed as **DEFECTS, not ranks** — the
  rank list stays at five so the live claims keep their identity. Fixing them is one batch,
  and F9 should be fixed by CONSOLIDATING the surface-2 rule rather than patching the third
  site.

- 🔴 **THE ARC IS FOUR SESSIONS ACROSS TWO DOCS, AND THIS DOC'S OWN ACCOUNT OF IT WAS
  STALE.** Re-derived 2026-09-30 by enumerating
  `~/.claude/projects/-home-zach-workspace-civit-civitai-app-model-benchmarking/*.jsonl`
  rather than trusting the note. The chain: **opencode `ses_f1f51c0d7ffen67u3KpidIMYy5`**
  (created `handoff-consent-resume-and-gated-read.md`, genesis `7f4945b`) → **`96de3010`**
  (09-27→09-28, founded THIS doc at `150760b`) → **`78510afc`** (09-28→09-29) →
  **`0514fcfc`** (09-29→09-30). The two docs are NOT a rename — `git log --follow` does not
  link them and the first was deleted. ⚠️ The previous note said "six commits, exactly one
  carries a session id"; it is now **9 commits, 4 with trailers**. **A count written into a
  doc about that doc's own history is stale the moment the doc is next written.**
- 🔴 **EVERY OPERATOR ASK IN THIS ARC WAS AUDITED LINE BY LINE ON 2026-09-30, AND THE RESULT
  IS: ONE functional ask never shipped.** 34 genuinely-typed messages (of 64 extracted
  records — the rest were task-notifications and answer payloads, the documented inflation).
  Round 1 (09-27 05:34) 6 of 7 · round 2 (09-28 20:53) **8 of 8** · round 3 (09-28 21:14)
  7 of 8. **The miss is round 3's "make the checkpoint and lora and resource titles
  clickable links to the resource page"** — impossible today, all three routes measured
  shut, filed `civitai/civitai#5209` (re-checked 2026-09-30: still OPEN). Verified by
  measurement, not assumed: the vote tooltip DID ship (`VoteButton.tsx:117`, asserted at
  `VoteButton.test.tsx:77`), archive IS off the community board (moved to `MyPublished`;
  `GridsView` carries none), and `civitai/civitai#5176` ("merge 5176 and release") merged
  2026-09-28. **Do not re-run this audit** — re-read this bullet instead.
- 🔵 **BOTH "use the upstream component" ESCALATION CLAUSES WERE HONOURED — this is NOT a
  dropped instruction, and an earlier reading nearly recorded it as one.** Round 1 said "if
  MISSING in upstream components, dispatch open a PR to add it": `<civitai-menu>` is not
  missing, it is present-but-unadoptable (throws on mount in any non-browser DOM), so the
  clause never triggered and an ISSUE (#485) was the right instrument. Round 2 said "if it's
  not, pull it from the native site settings page": that is exactly what shipped, a local
  `SideNav` mirroring the upstream contract. **Check the CONDITION on an escalation clause
  before reporting it unmet.**
- 🔴 **A TEMPLATE-LITERAL `data-testid` READS AS ABSENT IN A BUNDLE GREP, AND IT BIT AGAIN
  ON 0.4.11.** `board-nav-grids` / `board-nav-matchups` / `board-nav-prompts` each grep
  **0** against the served bundle while `board-nav` greps 1 — because `BoardNav.tsx` emits
  `` data-testid={`board-nav-${board}`} `` and a template literal never appears
  concatenated in minified output. The capture recipe already documents this trap for
  `subtab-my-`; it recurred in a new spelling one IA later. **Only the static prefix
  survives — drive a browser for the rest, and never quote such a zero as an absence.**
- 🔴 **A SQUASH MERGE MUST BE VERIFIED BY CONTENT.** Both merges this session were confirmed
  by grepping the merged file on the target ref with a negative control in the same command,
  never by `git merge-base --is-ancestor` — which returns false after every squash, forever,
  and reads as "not merged".
- 🔴 **A BYTE-CEILING GATE CAN AND SHOULD CHANGE THE DESIGN, NOT JUST THE WORDING.** devrc's
  `test_resume_skill_size.py` caps `resume/SKILL.md` at 22,400 B with an 800 B headroom
  floor; the file sat at 21,509, leaving **91 bytes**. Four rounds of tightening ended with
  the detail in the sidecar and a one-line pointer in the body — the correct shape, reached
  because the gate refused the lazy one. `--override-size-ratchet`-style escapes existed and
  were deliberately not taken: **raising a ceiling to fit your own note is the weakest move
  available.**
- **Decided (operator, 2026-09-30):** the 16 taste findings are filed as DEFECTS and the fix
  bucket is the operator's call — no fixes were applied by the pass or after it.

- 🔴 **A GUARD'S DIAGNOSTIC WAS PRE-EMPTED FIVE TIMES IN ONE ARC, BY FOUR DIFFERENT
  MECHANISMS.** Each time a mutation went red and the named assertion never ran, so the kill
  was scored by something else and the message the author wrote never printed. The four:
  (a) **a whole-string `.toBe` literal placed BEFORE the named claims** — fix by putting the
  named claims first and the literal last as a backstop; (b) **an earlier literal assertion in
  the same test reading the same value** — the inset seam, where the reachable mutation was on
  the OTHER side of the relationship; (c) **`screen.getByTestId` inside `expect(...)`** — it
  THROWS during argument evaluation, so the custom message never attaches; use `queryByTestId`
  plus a named `.not.toBeNull()`; (d) **two properties removed by one mutation**, so the second
  assertion never executes — isolate the mutation. 🔴 **The rule that generalises: a mutation
  going red is NOT evidence your guard works. Require the failure to carry THAT guard's own
  message.**
- 🔴 **A COMMENT THAT CLAIMS A MECHANISM IS A CLAIM, AND THIS ONE WOULD HAVE SHIPPED A BUG.**
  `App.tsx` said the grid-edit narrowing was "the same shape as the matchup and prompt
  surfaces". Measured: `MatchupsView`/`PromptsView` pass `onEdit` on the COMMUNITY card and
  narrow in the body (`MatchupBody.tsx:122`); `GridsView` has `grep -c onEdit` = **0** and no
  body-level edit gate. A maintainer mirroring the matchup call site would have put Edit on
  every foreign row. 🔴 **And the FIX was false in the other direction** — "the same outcome"
  unqualified, when only the NON-OWNER outcome is shared. Three drafts; the comment now names
  itself draft 3 and tells a fourth writer to qualify the noun rather than reach for a cleaner
  phrasing.
- 🔴 **A SECTION HEADER CAN OVER-CLAIM WHAT ITS OWN BODY DENIES.** `myBenchmarks.test.tsx`'s
  header said "None is an invariant guard" while a per-case label 350 lines down said two arms
  were. The header is where a reader looks first, so the block read as 23 cases of regression
  coverage when it is 21. Re-measured at base: 43 tests, 31 failed / 12 passed.
- 🔴 **`compact.ts` INJECTS ITS CSS AS A `<style>` ELEMENT, so every comment in that file
  reaches `document.body.textContent`** — the word "draft" in a comment tripped
  `myCommunity.test.tsx`'s viewer-facing-word guard. Comments there are shipped content. AND
  **the CSS is a TEMPLATE LITERAL**: an unescaped backtick in a comment ends it (13 syntax
  errors). Both cost a gate round.
- 🔴 **A `gap` DECLARATION IN THE COMPACT SHEET IS INERT** — `SideNav.tsx` writes `gap: 2`
  INLINE, and an inline declaration outranks every non-`!important` author rule. Two such
  declarations shipped in #66 and were deleted; the file states that cascade fact FOUR times,
  once nine lines above the rule that lost to it. Tests reading the sheet's TEXT cannot see it.
  **Deleting was also correct on the merits:** a 4px gap across five items ADDS ~16px to a strip
  already overflowing.
- 🔴 **THE OPERATOR'S TWO BADGE STATEMENTS ARE INVERSES, AND THE LATER ONE WON.** The typed ask
  was "use a badge to indicate if **published**"; the answered fork was "a **Draft** badge".
  #67 badges drafts and leaves published rows bare. Badging the minority state is the better
  design, but the PR resolved the contradiction silently — flagged, not re-opened.
- 🔴 **AN AUDITOR'S OWN INSTRUMENT FAILED AND ITS POSITIVE CONTROL CAUGHT IT.** A round-2 agent
  `cp -a`'d `node_modules` while running `vitest` from the worktree's copy, splitting the
  `expect` instance — `Invalid Chai property: toHaveTextContent`, **310 spurious failures**, and
  a base reading of "41 failed / 2 passed" it would have reported as fact. The unmutated head
  copy should have been green and was 310-red. **Symlink `node_modules`; never `cp -a` it.**
- 🔴 **`--audited` TAKES A SINGLE SHA, NOT A RANGE.** Passing `a..b` yields
  `audited=a..b..<head>`, which the parser splits on the FIRST dot-pair — a corrupted anchor
  that copies forward into every later round. Refused at exit 4.
- **Decided (operator, 2026-09-30):** responsive cells over a fixed bump, accepting the capture
  cost · a generous 420px ceiling once the unbounded case was found · full edit on published
  grids including members · one list with actions varying by state.

- 🔴 **A STORE-LISTING REVIEW OPENS A MODAL; AN APP PUBLISH-REQUEST REVIEW IS A ROUTE — this doc
  asserted the modal for both, now measured WRONG for the approval path.** `Review` on
  `/apps/review` NAVIGATES to `/apps/review/<pubreq_id>`: the URL changes and `[role=dialog]` is
  correctly null. The "URL never changes / Mantine overlay eats later clicks" advice is the
  **store-listing** modal only. Verify an approval click by your own `pubreq` id in the URL.
  ⚠️ A navigation RE-THROTTLES the tab — re-`wake` or the next click is silently inert.
- 🔴 **`civitai app status <app>` SHOWS THE NEWEST PUBLISH REQUEST, WHICH AFTER AN APPROVAL IS
  THE PAIRED `withdrawn` ONE — so the bare form reports `Status: withdrawn` / `Deploy state: -`
  for a version that is building fine.** That reads exactly like a failed or cancelled release
  and it is not. **Use `civitai app status --id <the pubreq the submit printed>`** — that is the
  record carrying the source sha, the real `Status`, and the `Deploy detail`. This supersedes
  the earlier instruction to read `Deploy detail` off the bare command; the bare command cannot
  reach it once the paired record exists.
- 🔵 **THE PAIRED `withdrawn` RECORD IS NOW FOUR FOR FOUR** (0.4.9, 0.4.10, 0.4.11, and 0.4.12 —
  `pubreq_01M3T96D9BZVKHAGN2CX62KJCB`, source-less, minutes after the approval click, while the
  submitted pubreq carried the sha and went on to build). Normal platform bookkeeping, already
  CLOSED in the ARCHIVE. `civitai app submit` was run exactly once per version. Do not
  re-investigate it; do not read it as a double submit.
- 🔴 **THERE IS NO REDEPLOY OR RETRY MECHANISM — a failed deploy costs a whole new VERSION, and
  this was established by measurement, not assumed.** `civitai app` exposes no such subcommand
  (create, dev-token, dev-tunnel, doctor, init, list, listing, metrics, pull, status, submit,
  validate, view, withdraw). And the approved submission's own moderator page offers none: every
  button on it was enumerated live — `Create`, `ZA2.2m`, `More`, `App sections`,
  `Save curation`, `Iframe`, `Other manifest fields (5)`, `🛟 Support` — with the words
  redeploy/retry/rebuild appearing **nowhere** in its text. So budget a version number per
  attempt, and expect more than one: this app has now needed a retry on two separate releases.
- 🔵 **A FAILED DEPLOY DOES NOT TAKE PRODUCTION DOWN — measured, not assumed.** Throughout
  0.4.12's `deploying` → `failed` window the app answered **HTTP 200** and kept serving 0.4.11's
  exact bundle (`index-t70oWAUj.js`, 440,492 B, the three new testids at 0, controls firing).
  Worth knowing before anyone panics into a rollback: the previous version keeps serving.

## How to verify
- Gates, in a worktree WITH `node_modules`: `pnpm run typecheck && pnpm test && pnpm build` —
  **60 files / 846 tests** on `main` @ `7c20155`, and 60 must equal
  `git ls-files | grep -cE '\.test\.tsx?$'`. Read BOTH vitest projects; exit codes from files,
  never through a pipe. ⚠️ A fresh worktree has neither `.envrc` nor `node_modules` — copy
  `.envrc`, `direnv allow`, `pnpm install --frozen-lockfile`.
- Release state: `python3 ~/.config/opencode/skills/civitai-app-fleet/app_state.py model-benchmarking 0.4.13`
  rc 0, **read UNPIPED**. Same with `0.4.9` is the rank-3 rollback watch. 🔴 **rc 0 alone proves
  NOTHING about what is serving** — both 0.4.11 and 0.4.13 return rc 0 `approved/live` right now,
  because a per-version record is not retired when a newer one deploys. Pair it with the bundle
  grep below, always.
- Served bundle, positive control in the SAME command:
  ```bash
  B=$(curl -s https://model-benchmarking.civit.ai/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
  curl -s "https://model-benchmarking.civit.ai/$B" > /tmp/live.js
  for t in my-list-panel my-list-empty draft-badge; do echo "$t $(grep -c $t /tmp/live.js)"; done # >0 since 0.4.13
  for t in side-nav board-nav grid-open-members; do echo "$t $(grep -c $t /tmp/live.js)"; done   # >0
  for t in section-grids grid-open-panel; do echo "CONTROL $t $(grep -c $t /tmp/live.js)"; done  # >0
  for t in contribute-trigger view-switch; do echo "RETIRED $t $(grep -c $t /tmp/live.js)"; done # 0
  ```
  At 0.4.13 the served bundle is `assets/index-DlkHPI8F.js` (448,095 B). 🔴 **The three
  `my-list-*`/`draft-badge` lines are the ONLY ones that distinguish post-#66/#67 code from
  0.4.11** — every other testid above predates both PRs, so a check built from those alone would
  have passed against the old bundle.
  ⚠️ A **template-literal** testid (`board-nav-<board>`, `my-list-<noun>`) greps 0 whether or
  not it exists — only static prefixes are answerable this way.
  ⚠️ **Do NOT expect the served hash to equal a local `pnpm build` hash.** The platform builds on
  its own image: locally `index-DkIWM9P2.js` / 447,826 B, served `index-DlkHPI8F.js` / 448,095 B
  for the same commit. Byte identity is not available as evidence here — content greps are.
- **The visual inventory:** https://claude.ai/code/artifact/8e396242-06f7-4323-809c-7e69fa00a73b
  🔴 Photographs **0.4.11**, i.e. BEFORE #66 and #67, so its plates DO NOT match what is now
  live. It remains a faithful record of the pre-#66/#67 UI and is the reference for the 16 taste
  findings' full text — but it is no longer a picture of production. **Rank 1 needs a fresh
  pass.**
- 🔴 **What CANNOT be verified here, ever:** the real Buzz spend loop (Turnstile + auth gated),
  and anything about LAYOUT or colour (jsdom resolves neither). Every layout claim in this arc
  is about declared values, emitted stylesheet text or module structure.
## Goal
Ship the operator's second and third rounds of IA feedback — a sidebar nav with My
Benchmarks, a one-board-at-a-time subnav, community-only boards, a ⋮ row menu, an SVG
vote glyph, no badges in the detail modals — and get it live.
- **closing-condition:** `check` — `app_state.py model-benchmarking <version>` exits **0**
  (`approved/live`, read UNPIPED), **and** the served bundle at
  `https://model-benchmarking.civit.ai/` carries `side-nav`, `board-nav` and
  `grid-open-members` with a positive control present in the same grep.
  ✅ **STILL MET 2026-09-30 at version 0.4.13** — re-measured after the release: rc 0
  `approved/live`, served `assets/index-DlkHPI8F.js` carrying `side-nav` 4 · `board-nav` 1 ·
  `grid-open-members` 1 with `section-grids` 1 / `grid-open-panel` 1 as the positive control.
  The arc stays CLOSED; shipping 0.4.13 did not re-open it.
  ✅ **MET 2026-09-29 at version 0.4.11.** `app_state.py … 0.4.11` → `approved/live`,
  **rc 0**. Served bundle `assets/index-t70oWAUj.js` (440,492 B, changed from 0.4.8's
  `index-PwE4InET.js` / 434,453 B): `side-nav` 2 · `board-nav` 1 · `nav-my-grid` 1 ·
  `grid-open-members` 1 · retired `contribute-trigger` **0** and `view-switch` **0** ·
  positive control `section-grids` 1 / `grid-open-panel` 1. **The arc is CLOSED against
  this line.** Everything in `Next steps` is a NEW arc or a pre-existing deferral.
- ✅ **The PRIOR arc is also CLOSED, its condition MET 2026-09-28** — carried forward so
  the closure survives the next replace. That arc was "ship the one-page IA refactor and
  get it live, then restore the store listing". Two of its ranks closed and must NOT be
  re-opened: the dropped "make it full-width" instruction (operator: **drop it,
  superseded**; the CLOSED block under Open investigations holds the ruled-out evidence
  and the shell-width reading is disproven — do not re-derive it), and the PR #53
  SDK-port test-merge (green, shipped as 0.4.8).

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
🔴 **Five CLOSED/SUPERSEDED blocks were EVICTED 2026-09-30 to
`claudedocs/handoff-ia-refactor-landed-ARCHIVE.md`** (the doc hit its 65,536 B ceiling).
They are MOVED, not deleted: the full-width instruction, the 0.4.9 `building` stall and
its resolution (the registry push, not the build), and the paired `withdrawn` publish
request and its resolution (normal bookkeeping). 🔴 Their `Next probe` lines are all
DISCHARGED — read the archive before re-running any of them.

### Does the installed mock host serve gated images? `Harness.tsx:22-25` may be stale prose
- as-of: 2026-09-29
- **Symptom + exact repro:** `src/Harness.tsx:22-25` asserts "the 0.30 publish/gated hooks
  have no mock-host scenario in the installed (pre-0.30) testing package, so the grid's gated
  cells render fail-closed (hidden) in the harness". The taste pass reported this as factually
  wrong. It decides whether ~10 run-cell states are capturable at all.
- **Observed (with values):** installed is `@civitai/blocks-react@0.51.0` — the comment's
  "(pre-0.30)" premise is stale by version number alone, **confirmed**. But the installed
  `dist/testing.d.ts` is 3,989 B and contains **0** occurrences of `gated`, `Gated`,
  `publish`, `Publish` or `image`, against a firing positive control in the SAME command
  (`Harness` 9, `createMockHost` 3, `viewer` 1) — so the zeros are real and not a broken
  pattern. `src/test-harness.tsx:17` confirms gated images ride the bridge `<Harness>`, not
  the REST fake. `via: measurement`
- **Ruled out:** *"the type surface settles it"* — `testing.d.ts` is a thin 4 KB re-export
  surface; a scenario implemented at runtime need not be named there. **A type declaration is
  not a code path**, and its silence is evidence about the `.d.ts`, not about the mock host.
  `via: code`
- **Leading hypothesis:** the comment's PREMISE is stale (confirmed) while its CONCLUSION may
  still hold by accident — 0.51.0 may still not implement those scenarios. The taste pass ran
  against the LIVE app and never booted the harness, so it is unclear what evidence it had;
  treat its runtime claim as UNVERIFIED. 🔴 The same wrong constraint was written into this
  session's own recon and into the agent's brief, so it has now propagated three times.
- **Next probe:** boot it and look — `pnpm run dev:harness` then, in headless chromium,
  grep the DOM for `result-image` / `result-hidden` / `result-pending` / `gated-loading`.
  Present ⇒ the comment is wrong and must be corrected in-file; absent ⇒ the comment is right
  for a stale reason and its "(pre-0.30)" clause should be rewritten. Either way the file
  changes.

### A 720px viewport reports `innerWidth: 721` and the block stays desktop
- as-of: 2026-09-29
- **Symptom + exact repro:** emulate a 720px-wide viewport against the live app; the block
  reports `innerWidth: 721` and renders the desktop sidebar rather than the compact top bar.
  Reproduced **3×**.
- **Observed (with values):** `innerWidth` 721 at a requested 720. The breakpoint is
  `MOBILE_BREAKPOINT_PX` in `src/compact.ts`, consumed by `src/useMediaQuery.ts` as
  `(max-width: <n>px)` — an inclusive bound, so 721 legitimately fails it. The collapse DOES
  fire at 718. `via: measurement`
- **Leading hypothesis:** nothing has been eliminated yet — two rivals, and nothing observed
  separates them — (a) OOPIF/CDP
  emulation rounding, i.e. an artefact of how the block's iframe is sized inside the host
  page, or (b) a real off-by-one in how the host sizes the frame, which would mean a physical
  720px device gets the desktop layout. 🔴 An empty/ambiguous result cannot distinguish them;
  do not pick the convenient one.
- **Next probe:** the discriminator is a NON-EMULATED 720px width — a physical device, or a
  real browser window resized to 720 outer width with the iframe's own `innerWidth` read from
  inside the frame. If the frame reports 720 there, (a) is confirmed and this closes.

### The Qwen-Image cell can never be filled, and this account cannot remove it
- as-of: 2026-09-30
- **Symptom + exact repro:** the Top Grid's Qwen-Image × "Lighthouse on a rocky coast at sunset"
  cell renders `not generated yet` / `Run this cell` and appears in ALL THREE board capture
  assets, because the Top Grid matrix renders above every board. The operator reports the
  checkpoint is no longer available, so the cell can never produce an image.
- **Observed (with values):** live, as session `zachlowdenzx` (id 8753561): 20 grid cells, 19
  `result-image`, 1 empty. The Run button is **`disabled: false`** — the app does not know the
  checkpoint is gone and would attempt a spend. The matchup holding it, "Modern text-to-image
  baselines", offers **Edit 0 · Withdraw 0 · Report 1**; the sibling card "Community
  checkpoints: SD 1.5 vs Illustrious" offers **Edit 1 · Withdraw 1 · Report 0** as a positive
  control proving the query can see those controls. `via: measurement`
- **Ruled out:** *"remove it from the operator's own grid"* — the empty cell is in the SYSTEM
  Top Grid, whose members are `topByVotes(combinations, DEFAULT_TOP_N)` (`App.tsx:1001`);
  `openGridKey` defaults to `null` = Top Grid (`App.tsx:535`), and the captures are taken at
  boot. Editing the operator's own grid changes nothing in the assets. `via: code`
- **Ruled out:** *"the operator can edit or withdraw the matchup"* — `canEdit = isOwn && …`
  (`MatchupBody.tsx:122`), and both controls are absent for this viewer against a firing
  positive control on the sibling card. They do not own it. `via: measurement`
- **Ruled out:** *"sign in as another account"* — workbench `work` and laptop `work` are both
  `zachlowdenzx` (8753561); laptop `personal` returns `{}` (signed out), read same-origin after
  a cross-origin read returned a misleading `None`. No second Civitai account is reachable on
  either host. `via: measurement`
- **Leading hypothesis:** nothing this account can do removes it. It leaves the board only by
  the author acting, or by the matchup falling out of the top-N on votes — and with two
  matchups on the board and `DEFAULT_TOP_N` above that, it cannot fall out today.
- **Next probe:** decide rather than measure — ship the placeholder as a recorded exception,
  submit a competing matchup with live checkpoints, or ask the author. If ships-as-is, note it
  against `shelf-life-and-what-not-to-shoot.md:59` in the capture PR.
## Defects (batched)
🔴 Re-verify before acting. Fix as batches, never one rank per finding.
⚠️ **These are ONE-LINE POINTERS. The 16 taste findings' full text — measured values, `file:line`, severity reasoning — is in the Contact Sheet artifact linked under `How to verify`, and in this doc's revision at `5a83f89` (`git show 5a83f89:claudedocs/handoff-ia-refactor-landed.md`). `Defects` is a REPLACE section, so the detail cannot live here across updates; do not re-derive it from these lines.**

**CLOSED by #66/#67** — F1 (invisible active nav row), F9 (`surface2` in light theme), F6
(members count as a badge, superseded by the badge removal). F2's GROUPING half shipped.

**Still open from the taste pass** — F3 (card action row jumps with description length,
`MatchupBody.tsx:127-128`) · F4 (⋮ affordance, `variant="subtle"` beside a bordered vote pill) ·
F5 (Edit left-aligned, Remove centred; panel overhangs its card by 49px) · F7 (365px dead band
beside a 3-column matrix) · F8 (`unpublished-empty` bare sentence — ⚠️ that component is DELETED;
re-derive against `MyList.tsx`) · F10 (`▸` promises expand, opens a modal) · F11 (four forms
disagree on required markers) · F12 (GridPicker focus ring reads as selection) · F13 (destructive
Remove is the quietest control) · F14 (`docs/screenshots/` stale to 2026-07-27, its Playwright
script never committed) · F16 (720px viewport reported `innerWidth: 721`, cause unestablished).

**Carried forward, round-1 audit findings** — #59 focus dumped on `<body>` after `grid-open` ·
#60 `nav-my-group` is a `role="list"` inside a `role="list"` · #61 `document.location.href`
escapes the no-navigation guard · #59 three scaffolding simplifications.

**NEW, from #66/#67's audit ladders:**
- 🔴 **F2's CLIPPING half is NOT closed and is now UNCONDITIONAL on mobile Home.** Net saving
  ≈ −24px of a ~90px overflow (the indent removal takes 42px out, the new chrome adds ~18px
  back). Before #66 the strip was two items on Home and fit; `useState(true)` makes the
  five-item overflowing strip the default first paint. Closing condition is in `compact.ts`:
  a live 390px reading on Home, no interaction, `side-nav-list.scrollWidth <= clientWidth`.
- **`optimisticUpdate` is unguarded on ALL THREE mutations.** Dropping it from `updateGrid`
  survives — and so does the identical mutation on `updateCombination`, its control. A
  pre-existing gap inherited verbatim; fix across all three in one change, or not at all.
- **`flexDirection: 'column-reverse'` on the merged list SURVIVES mutation**, reversing what a
  viewer sees with the suite green. Named at its line. It escapes drafts-before-published,
  which is the ONE requirement nobody asked for.
- **Grid authors cannot edit from the community board; matchup and prompt authors can.**
  Deliberate, now recorded in `App.tsx`'s `updateGrid` docblock and pinned in both directions
  (`myBenchmarks.test.tsx:892`, `e2e.test.tsx:145`).
- 🔴 **The Qwen-Image cell can never be filled and is NOT removable by this account** — see
  the Open investigation below.
