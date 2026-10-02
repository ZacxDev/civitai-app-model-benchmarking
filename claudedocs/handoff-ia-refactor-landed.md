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
- ✅ **0.4.13 went live 2026-09-30 carrying #66/#67** — evidence in the ARCHIVE, superseded
  by 0.4.14 above.
- ✅ **THE ORIGINAL ARC'S CLOSING-CONDITION IS MET AND THAT ARC IS CLOSED** (see `## Goal`, met at 0.4.11, re-met at 0.4.13). Everything in `Next steps` is a NEW arc or a pre-existing deferral. 🔴 This line has now been dropped by THREE successive `State now` replaces and restored each time by the durable-drop warning — carry it forward.
- 🔴 **0.4.9 is STILL `approved/building`** — unchanged after four more releases, still a
  rollback hazard. Rank 3. Note the contrast that makes it the hazard: `building` is QUEUED,
  while 0.4.12's `failed` is TERMINAL and harmless.
- 🔴 **`app_state.py <version>` rc 0 IS TRUE FOR TWO VERSIONS AT ONCE** (measured: 0.4.11 and
  0.4.13 both read `approved/live`) — a per-version record is not retired when a newer one
  deploys, so rc 0 on an older version is neither a rollback signal nor proof about the live
  bundle. Pair it with the served-bundle grep; see `How to verify`.
- ✅ **THE SECOND OPERATOR FEEDBACK BATCH IS COMPLETE AND MERGED (2026-10-01). `main` =
  `66f6122`.** **#70** (`MAX_CONFIGS` 8→100 + a hand-rolled row window in `lib/virtualRows.ts`,
  **no new dependency**) · **#71** (sidebar → Prompts/Matchups/Grids · badge **Private** ·
  "N models" · no self-vote, `VoteCount`/`VoteTally` split so an author keeps the score ·
  Discard in the ⋮) · **#72** (three create modals reworked, two-step creates via a shared
  `FormSteps`, **`ResourceCard` ADOPTED** not reimplemented) · **#73** (private members in a
  grid, dependencies-first publish cascade, own-grid thumbnails). Gates on `main`: **67 files /
  987 tests**, node 22/341 + dom 45/646, typecheck + build rc 0, verified independently.
  🔴 **ONE ASK WAS NOT BUILT AND IS DELIBERATE** — "allow generating content while grid is
  draft", held for its own PR because it spends Buzz. 🔴 **ONE WAS CLOSED AS NO:** `MAX_LORAS`
  stays 5, host-enforced at the wire schema.
- ✅ **0.4.14 IS LIVE AND BATCH 2 (#70–#73) IS IN PRODUCTION — verified by served content,
  2026-10-01.** rc 0 `approved/live`; served bundle moved to `assets/index-Bax577u7.js`
  (**464,448 B**, from 0.4.13's 448,095 B), and **13 testids net-new between `7c20155` and
  `66f6122` each grep 1**, covering all four PRs — `grid-pad-top`/`grid-body` (#70) ·
  `vote-tally` (#71) · `form-next`/`form-step-content` (#72) · `grid-publish-confirm` (#73).
  Negative control `checkpoint-name` **0**; carried controls all firing. Command + the
  mechanical way to derive those markers are in `How to verify`.
  ⚠️ **The live submission reports NO source commit (`src=-`)**, so that content grep is the
  ONLY evidence of what shipped; no provenance stamp corroborates it.
- 🔴 **THE DEPLOY-BLOCKING CVE GATE WAS FIXED PLATFORM-SIDE BY ANOTHER SESSION, AND RE-CHECKING
  BEFORE ACTING IS WHAT CAUGHT IT.** For ~90 min 0.4.14 was `approved/failed`: a 4-HIGH `pcre2`
  scan refusal in the platform's own runtime base, fleet-wide (`yt-thumbnail` 0.1.8 failed on the
  identical CVEs), 0.4.15 apparently owed. All true when measured, all SPENT ~90 min later: the
  recipe gained `pcre2`, the base digest was bumped, both apps went live.
  🔴 **The generalisable point: a release blocker in a SHARED platform is the fastest-rotting
  premise in this doc — someone you are not talking to can close it. Re-measure before building
  anything against one.** Detail in the **cairn entry `model-benchmarking-block`**.
- ✅ **0.4.15 IS LIVE AND THE ARC'S LAST UNSHIPPED ASK IS SHIPPED — resource titles link out
  again. Verified by served CONTENT 2026-10-02, not by the state string.** `app_state.py …
  0.4.15` → `approved/live` **rc 0**; served bundle `assets/index-DQzwS3Wm.js` (**520,608 B**,
  from 0.4.14's `index-Bax577u7.js` / 464,448 B — the jump is #75's four-package bump).
  PR **#75** (`5c6cdbc`) re-enables them via `scope: 'site'`, the option `civitai/civitai` **#5250**
  added to the `NAVIGATE` message; `#5209` is CLOSED. It merged ONE commit past 0.4.14's source,
  so it was merged-but-dark until this release. 🔴 **The trap worth keeping: `main` sat at
  `0.4.14` — the version already live — so a submit would have been REFUSED outright. A merged
  PR after a release is invisible until BOTH version files move.**
- 🔴 **THE HOST CAPS SHARED WRITES THREE WAYS AND THIS APP SURFACES NONE — the binding one is
  a LIFETIME per-user row cap of 50 that COUNTS RESULT ROWS**, so a viewer can fill only ~45
  grid cells ever against a 20×20 board ("you have reached the maximum number of submissions
  for this app"). Operator decision 2026-10-01: **build the batch, ignore the cap for now.**
  🔴 Constants, security rationale and the ephemeral-output mechanism that side-steps them are
  in the **cairn entry `model-benchmarking-block`** — deliberately NOT here: this doc **ships
  inside the submitted bundle** and the repo is public.
- **#66/#67, shipped in 0.4.13:** My Benchmarks open by default · a visible active nav row ·
  responsive matrix `minmax(200px, 420px)` · System-grid badge dropped · `token.surface2`
  consolidated to `recessedSurface` · one `MyList.tsx` per noun (`MyPublished`/
  `UnpublishedList` deleted) · a primary New CTA · per-state row actions · **`updateGrid` —
  published grids were not editable at all before it**.
- **Claim `ia-refactor-landed-1` HELD** (rank 1). `ia-refactor-landed-2` released.
- ⚠️ **`.claude/` is UNTRACKED and NOT gitignored** in this repo (`git status` shows `?? .claude/`).
  Agent worktrees live under `.claude/worktrees/`. Harmless while `git add -A` stays banned,
  but an earlier note claiming that path is gitignored was wrong.

## Next steps (ranked)
🔴 **Ranks 1–5 keep their numbers — a live claim is keyed to rank 1. Do not re-rank.**
1. **The operator judges the live app — NOW FULLY UNBLOCKED, NOTHING LEFT TO BUILD OR SHIP.**
   🔴 **The 2026-10-01 kickoff's premise is SPENT TWICE OVER:** it said rank 1 waited on a
   moderator approving 0.4.14. 0.4.14 was then approved, its deploy FAILED on the platform's CVE
   gate, and ~90 min later another session fixed the platform and got it live — so neither the
   approval nor the CVE gate is a blocker any more. **0.4.14 is live and carries #70–#73**
   (verified by content, see `State now`), on top of 0.4.13's #66/#67.
   **This rank is now purely a HUMAN judgement call with no prerequisite.** Covers the 16 taste findings in the
   contact sheet, plus everything four PRs changed that nothing here can see — whether cells
   render larger, whether the 420px ceiling and the 100-config window hold up, whether the
   two-step modals read well, the ⋮ placement, the thumbnail strips. jsdom resolves no layout.
   🔴 **The deadlock is worth naming because it recurs:** this rank said "judge the live app"
   while the live app was generations behind `main`, and rank 6 said release only AFTER rank 1 —
   neither could move. The operator broke it twice by choosing to release first, on the
   reasoning that listing media is not version-scoped. The recorded alternative, still viable:
   photograph a LOCAL build in a real browser, which reviews layout without shipping.
   forcing: user — no automated check here can judge appearance.
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
4. **The upstream overlay decision — THE GATE HAS PARTLY OPENED, re-derive before working it.**
   `civitai-app-starters` **#485** (menu) is **fixed upstream by PR #493, issue left open**;
   **#496** (dialog family) and **#497** (lightbox) were NOT re-checked on 2026-10-01 and may
   have moved the same way. Check all three live first — see `## Upstream` for the #485 detail.
   forcing: gate — a maintainer decision on #496; #497 is explicitly blocked on it.
5. ✅ **CLOSED — THE BUMP LANDED INSIDE PR #75 (2026-10-01), NOT AS ITS OWN TASK.** It was never
   worked as rank 5: `scope: 'site'` lives in `blocks-react@0.61.0`, which peer-requires
   `app-sdk >=0.49.0` against the pinned `^0.42.0` — so the resource-links feature **forced** the
   bump as a set. Shipped: `app-sdk ^0.42→^0.54` · `blocks-react ^0.51→^0.61` · `sdk ^0.8→^0.10`
   · `theme ^0.3.1→^0.4.0`. 🔴 **`components-react` deliberately HELD at `^0.4.1`** (0.9.1 is a
   total API replacement; nothing peer-depends on it; exactly one `@civitai/components`
   resolves). Three things broke and were fixed at cause: `src/manifest.ts` now validates the
   committed bytes against the canonical schema via `@civitai/app-sdk/manifest`; `index.html`
   boot literals moved with `theme@0.4.0`; and a **new `pnpm-workspace.yaml`** waives pnpm's
   `minimumReleaseAge` for three exact versions — see `CLAUDE.md`, which documents its TWO
   expiry clocks. The parked patch is now **superseded, not pending**.
   forcing: none — closed.
6. ✅ **CLOSED — #66/#67 shipped as 0.4.13, #70–#73 as 0.4.14, both now LIVE.** The
   release-before-judging ordering was overridden by the operator both times, deliberately,
   because production was generations behind `main`. **Do not re-open.** Detail in the ARCHIVE.
   forcing: none — closed.

## 🔴 What the one-page IA cost the listing, and the one way back

Two of the three sections (`section-matchups`, `section-prompts`) are **unphotographable** by the capture pipeline: the host sizes the iframe to the VIEWPORT inside an `overflow: hidden` parent, and both sit below the edge at every height measured (900/1100/1400). 🔴 **The app DOES scroll inside its own iframe** — the single route back is adding a `scroll` verb to `KNOWN_ACTIONS` (`plan.py` + `capture.sh` + the bridge op + the mutation battery). Recorded as a real option, **not** licence to build it unasked. Measurements EVICTED 2026-10-01 to the ARCHIVE.

## What the capture states are now

Three **overlay** states, which need no scroll, keep `yFrom: appFrame`, and each carry
their own testid discriminator — fixing structurally the defect where all three old
`waitForText` anchors matched simultaneously:

| click | overlay | 
|---|---|
| `contribute-trigger` | `contribute-menu-items` |
| `grid-group-matchup` | `matchup-detail` |
| `grid-col-header` | `prompt-detail` |

Two defects no gate caught (`h=1087` smuggles the support widget in — use `h=1040`; and
`capture.sh` does not reload before the FIRST state) are fixed in the merged recipe
(`civitai/civitai` #5247); full account EVICTED 2026-10-01 to the ARCHIVE.

## The parked bump — EVICTED, and its premise has changed
🔴 **The full 4 KB account (the five-package chain, every measured cost, the barrel-vs-per-path
byte numbers, the jsdom/popover and shadow-root findings) moved to
`claudedocs/handoff-ia-refactor-landed-ARCHIVE.md` on 2026-10-01** for the byte ceiling.
Patch itself is outside this public repo at
`/home/zach/workspace/civit/.parked/mb-five-package-bump-perpath-b778de4.patch`.
🔴 **Read the archive before pricing this, because TWO of its premises are now false:** starters
**PR #487 is MERGED** (it was listed as the prerequisite) and **#485 is fixed upstream by PR
#493** (it was the reason the bump's prize — deleting `ContributeMenu.tsx` — was called
impossible). The measured peer chain still binds. See rank 5 and `## Upstream`.

## Upstream, filed 2026-09-27 (`civitai/civitai-app-starters`)
Raised out of this repo's failed adoption attempt; none is ours to close.
🔴 **RE-DERIVED 2026-10-01 — TWO OF THE THREE MOVED, AND THE DOC HAD BOTH WRONG.** Check
live state before quoting any of this; a filed-and-open issue can be fixed-but-unclosed.
- **issue #485** — the menu is not adoptable. ✅ **FIXED UPSTREAM, ISSUE LEFT OPEN** —
  starters **PR #493** merged 2026-09-30 (`38d0907`, verified an ancestor of `origin/main`).
  🔴 The fix is a **236-line `popoverShim.ts` in `civitai-blocks-react`**, exported from its
  `/testing` subpath — NOT a change to the element, NOT in `civitai-components`. Reaching it
  needs a **blocks-react bump**; it is at **0.61.0, published**, which `^0.51.0` accepts.
  ⚠️ Does NOT dissolve the five-package bump — the peer chain still binds. It removes the
  "needs an API decision" blocker. Which version first carried the shim was NOT measured.
- **PR #487** — `loading`/`decoding` passthrough on `CivitaiImage`. ✅ **MERGED 2026-09-30.**
- 🔵 **`ResourceCard` IS ADOPTABLE AND WAS ALREADY INSTALLED — the "no upstream component"
  premise was false.** Named export of `@civitai/blocks-react/ui`, present in the **installed
  0.51.0**; shipped in 0.47.0 via starters **PR #295**, whose changelog names THIS APP's rows
  as its source and says adoption was deferred until the version published. **jsdom-safe,
  proven by mounting the installed artifact** under jsdom 25.0.1: no throw, zero shadow roots,
  zero custom elements, zero popover attributes, `actions` renders as a SIBLING of the hit
  area. Use `variant="row"` + the STATIC arm — `interactive` reintroduces a focus stop;
  `variant="card"` shows "No preview" (no image field on `BlockResourceInfo`). **No upstream
  PR filed, correctly** — the condition never fired. 🔵 Unfiled candidate, operator's call:
  it REQUIRES `modelId` and never reads it, while `LoraRef.modelId` is optional forever, so
  adoption passes a fabricated `?? 0`.

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
- 🔴 **LSP/EDITOR DIAGNOSTICS IN THIS REPO HAVE BEEN WRONG TWELVE TIMES ACROSS THIS ARC —
  `tsc --noEmit` IN A CORRECTLY-INSTALLED TREE IS THE ONLY ARBITER. DO NOT ACT ON ONE.**
  ⚠️ CONSOLIDATED 2026-09-30 from three bullets; count updated 2026-10-01. The shapes seen:
  phantom `Cannot find module 'react'` waves · a `useRef` "not found" that was imported ·
  jest-dom matchers reported "missing" · module-resolution errors after worktrees were removed ·
  a filename reported in the wrong CASE, which sent a session chasing a non-existent
  `gridsview.tsx` · symbols that exist in no tree. **The usual root cause is an agent worktree
  with no `node_modules`** — which is also why a fresh worktree needs `.envrc` copied,
  `direnv allow`, and `pnpm install --frozen-lockfile` before any diagnostic means anything.
  🔴 **The 12th was the dangerous kind — PLAUSIBLE.** `MyList.tsx` was flagged
  `'onDiscardDraft' is declared but its value is never read` just as Discard moved into the ⋮,
  i.e. exactly the shape of a real orphaned handler. False: declared 106, destructured 133,
  **used 366**, `tsconfig` sets both `noUnused*`, `tsc --noEmit` rc 0. Plausibility is not
  evidence; the compiler is.
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

- 🔴 **THE SESSION-SEARCH TOOLING IS STRUCTURALLY BLIND TO THIS REPO — NEVER READ ITS SILENCE
  AS AN EMPTY ARC.** This repo is in no `REPO_ENV_HANDLES` handle, so `find-session.py --arc`
  exits **5** (nothing read at all, not an empty result) and `handoff_search.py` returns
  `in_scope_docs` EQUAL to `indexed_docs` with the slug exclusion matching nothing — this doc
  is not in that corpus. **Read `excluded=` and the doc-count PAIR, never `excluded=` alone.**
  **What works:** enumerate `~/.claude/projects/-home-zach-workspace-civit-civitai-app-model-benchmarking/*.jsonl`
  (exhaustive for the Claude half). The opencode genesis session is readable by neither that nor
  `extract_user_msgs.py`. ⚠️ This is a **devrc tooling** limitation, not a fact about this app —
  the fix belongs there, and the detail should not re-accrete in this public repo's doc.
- ⚠ **`extract_user_msgs.py` is Claude-Code-only** (so the opencode genesis session is
  unreadable by it) **and it counts task-notifications as `typed`** — separate records by
  size before quoting any ask count. Worked numbers in the ARCHIVE.
- 🔴 **The release and the capture re-measure were DEADLOCKED, and this doc said the order
  backwards for a while.** The re-measure needs the new IA live; the old instruction said
  not to release first. Releasing was the cheap side, because **listing media is not
  version-scoped** — shipping a version leaves screenshots stale rather than broken.
  Recorded because the same shape will recur on any IA change: *a capture recipe can only
  be measured against a released artifact.*
- 🔴 **THE APPROVAL QUEUE HOLDS MORE THAN ONE APP AND THE OTHER ONE IS USUALLY FIRST — six
  attempts, six times (`yt-thumbnail`, then `prompt-lab` five times). A POSITIONAL selector would
  approve SOMEONE ELSE'S submission to production.** Recipe: assert exactly ONE row matching the
  app slug, assert it does NOT mention the other app, stamp a temporary marker attribute on its
  single `Review` control, click the marker, remove it — refusing rather than guessing at every
  step, re-asserting immediately before the click. Same shape for `Approve + build`, whose
  neighbour is `Reject…`. Confirmation each time: the other app stayed `pending`. Full measured
  account EVICTED 2026-10-01 to the ARCHIVE.
- 🔴 **THE APPROVE BUTTON MAY OR MAY NOT BE COVERED BY THE SITE'S STICKY FOOTER — HIT-TEST
  EVERY TIME, NEVER APPLY THE WORKAROUND BY HABIT.** Measured covered on 0.4.9; NOT covered on
  0.4.10–0.4.13. Remedy when it IS: set `pointer-events: none` on the sticky footer, re-hit-test,
  click, then RESTORE it. Geometry and the `elementFromPoint` evidence EVICTED 2026-10-01 to the
  ARCHIVE.
- ✅ **RESOURCE LINKS SHIP AGAIN — THIS BULLET'S "IMPOSSIBLE TODAY / DO NOT RE-DERIVE" IS
  RETRACTED 2026-10-01. `src/components/ResourceName.tsx` IS THE AUTHORITY NOW, NOT THIS DOC.**
  It read as a standing prohibition and would have stopped the next session attempting work that
  is now DONE. `civitai/civitai#5209` is **CLOSED**; fixed upstream by **#5250** (`72436ad8c1`,
  2026-09-30), which added a `scope` to the `NAVIGATE` message — `scope: 'site'` resolves the
  path at the civitai.com root instead of rewriting it under `/apps/run/<slug>/`. **PR #75 is
  MERGED** (`5c6cdbc`) and re-enables the links in the matchup detail modal; `LoraRef.modelId`
  being KEPT is what made it retrofittable.
  🔴 **"The unlock is a TRUST-TIER change" WAS WRONG, and an earlier draft of this retraction
  repeated it.** `scope: 'site'` is granted **per SURFACE** by the host's
  `BLOCK_HOST_SITE_NAVIGATION` record — which is exactly why #5250's unlock landed while this
  block still runs at `trustTier: 'unverified'`. 🔴 **Route (c) — `<a target="_blank">` from the
  block — IS STILL SHUT** (`allow-popups-to-escape-sandbox` is not grantable) and remains the
  live hazard deciding the element. Only routes (a) and (b) opened.
  🔴 **Merged ≠ live** — see `State now` for the 0.4.15 release that carries it.
- 🔴 **A squash merge BREAKS A STACK — children must be `git rebase --onto origin/main <old-parent-tip>`, retargeted to `main` BEFORE the force-push.** Worked recipe and the CI-event-drop it pairs with: EVICTED 2026-10-01 to the ARCHIVE.
- 🔴 **A force-push during a parent's merge can drop the CI event entirely** (#61 got ZERO check-runs; proven real by a positive control against a known-green head). Remedy: `gh pr close` + `gh pr reopen`. Detail EVICTED 2026-10-01 to the ARCHIVE.
- 🔴 **EVERY DEFECT THAT MATTERED IN THIS ARC PASSED CI, AND NONE WOULD HAVE BEEN CAUGHT BY
  READING THE CODE. Five guards proved less than they claimed** — a dead `paddingLeft` whose only
  witness asserted a CSS var nothing consumes · a vacuous spend-attempt case whose helper REPAIRED
  both observables it then asserted · a no-navigation guard pinning the MECHANISM not the STATE
  (so `window.open` and `location.href` both survived) · `includedCount={0}` at two of four call
  sites, suite still green · a report test that switched BOARDS rather than unmounting. **The
  lesson that generalises: ask what property your witness actually reads, and whether anything
  consumes it.** Worked cases EVICTED 2026-10-02 to the ARCHIVE.
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

- 🔴 **A RELEASE CAN FAIL AFTER BUILDING AND SCANNING CLEAN, IN MORE THAN ONE PLACE — READ
  `Deploy detail`, NEVER THE STATE STRING.** ⚠️ CONSOLIDATED 2026-10-01 from three bullets.
  `app_state.py` gives only `approved/building`|`failed`, which cannot tell a slow build from a
  dead one. **THREE modes measured**: `crane push exit: 1` / registry i/o timeout (0.4.9, 0.4.10),
  `Deploy timed out` (0.4.12 — PAST build and push, in `deploying`), and 🔴 **a CVE-SCAN REFUSAL
  BEFORE publish (0.4.14, 2026-10-01) — which breaks this bullet's own "scanning clean" premise
  and is the ONE mode a retry CANNOT fix.** Discriminate in `Deploy detail`: a scan refusal names
  CVEs and a package; a transient names a push error or a timeout. A scan refusal is platform-side
  and hits every app, so retrying it only burns versions. 🔴 **No redeploy or
  retry mechanism exists** — established by enumerating `civitai app`'s subcommands AND every
  button on the approved submission's moderator page. 🔴 **BUT "a failed deploy costs a whole new
  VERSION" IS FALSE — RETRACTED 2026-10-01 BY MEASUREMENT.** A failed deploy never published, so
  the version is NOT consumed: `0.4.14` was re-SUBMITTED at the **same version** after its
  `failed` deploy and went `approved/live` (and `yt-thumbnail` 0.1.8 did the same, same hour —
  two instances). So there is no in-place redeploy *button*, but a same-version re-submit is the
  retry, and it is free. Budget attempts, not version numbers (0.4.11 took three attempts). 🔵 **It does
  NOT take production down** — HTTP 200 throughout, still serving the previous bundle; don't
  panic into a rollback. 🔴 The generalisable error was mine: I reasoned from
  *CI-is-a-different-environment* toward "the builder must be choking on our bundle" and was
  wrong — `kaniko build exit: 0` sat directly above the network error. **Read the failure
  output before theorising.** The fix was a retry for the first two modes ONLY.
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

- 🔴 **The arc's own session chain (4 sessions, 2 docs) was EVICTED 2026-10-01 to the ARCHIVE** — and its lesson: a count written into a doc about that doc's own history is stale the moment the doc is next written.
- ✅ **EVERY OPERATOR ASK IN THIS ARC IS NOW ACCOUNTED FOR — ROUNDS 1–4. Do not re-run either
  audit; re-read this bullet.** Rounds 1–3 were audited line by line 2026-09-30 (34 typed
  messages of 64 extracted records — the rest task-notifications and answer payloads, the
  documented inflation): round 1 **6 of 7** · round 2 **8 of 8** · round 3 **7 of 8**, verified by
  measurement (the vote tooltip DID ship, `VoteButton.tsx:117`; archive IS off the community
  board; `civitai/civitai#5176` merged 09-28). 🔴 **That audit's single miss — round 3's
  "clickable resource titles" — IS NO LONGER A MISS:** `#5209` closed, PR **#75** merged. The arc
  therefore has **ZERO never-shipped functional asks**.
  **Round 4 (2026-10-01 03:23, session `66c3b9ac`) audited 2026-10-01: 22 functional asks →
  20 SHIPPED, 1 deliberately deferred, 1 closed as NO.** Deferred = "allow generating content
  while grid is draft" (spends Buzz, owed its own PR; verified absent against a firing control).
  NO = `MAX_LORAS` stays 5, host-enforced at the wire schema (verified `MAX_LORAS = 5`).
- 🔵 **Both "use the upstream component" escalation clauses WERE honoured — not dropped instructions.** Detail EVICTED 2026-10-01 to the ARCHIVE. **Check the CONDITION on an escalation clause before reporting it unmet.**
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
- 🔴 **A byte-ceiling gate should change the DESIGN, not the wording — raising a ceiling to fit your own note is the weakest move available.** Worked example EVICTED 2026-10-01 to the ARCHIVE.
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
  correctly null. Verify an approval click by your own `pubreq` id in the URL.
  ⚠️ A navigation RE-THROTTLES the tab — re-`wake` or the next click is silently inert.
  🔴 **The modal advice still stands for the STORE LISTING** (rank 2), where the URL really
  never changes, a worked click reads as inert and invites re-clicking, and the Mantine overlay
  then intercepts every later click: hit-test with `elementFromPoint` instead of retrying,
  `Escape` plus a firm `wake` clears a stuck overlay, and that modal's Approve sat at **y=3045**
  against a 1134px viewport, needing `scrollIntoView` to be reachable.
- 🔴 **`civitai app status <app>` SHOWS THE NEWEST PUBLISH REQUEST, WHICH AFTER AN APPROVAL IS
  THE PAIRED `withdrawn` ONE — so the bare form reports `Status: withdrawn` / `Deploy state: -`
  for a version that is building fine.** That reads exactly like a failed or cancelled release
  and it is not. **Use `civitai app status --id <the pubreq the submit printed>`** — that is the
  record carrying the source sha, the real `Status`, and the `Deploy detail`. This supersedes
  the earlier instruction to read `Deploy detail` off the bare command; the bare command cannot
  reach it once the paired record exists.
- 🔵 **A paired `withdrawn` record beside an approval is NORMAL bookkeeping — seen on every
  approval 0.4.9–0.4.14 (0.4.14 carries TWO, one per approval). Not a double submit; do not
  re-investigate. Account in the ARCHIVE.**
- 🔴 **THE TEST-MERGE EARNED ITS KEEP AND `mergeable: MERGEABLE` DID NOT SEE IT.** #70/#71
  were each CI-green and each `MERGEABLE` — a claim against `main`, never about the tree the
  two create. An integration branch produced a **real conflict** in `src/lib/benchmark.test.ts`
  (both appended to one alphabetical import block). ⚠️ My own disjointness check said "no
  overlap" and was WRONG: I grepped #70's diff against #71's *component* files, never the two
  diffs against each other — **compare the file SETS of both diffs.** `git rerere` re-applying
  a resolution is a CLAIM: re-read the region, and **re-run the merged-tree gate when either
  side moves** (#71 was amended after the first run, invalidating it).
- 🔴 **`git checkout <ref> -- <path>` DESTROYED UNCOMMITTED WORK AGAIN (2nd time) — and the
  brief warned the OTHER agent.** Reverting production files for a base reading ate uncommitted
  work; reconstructed and re-verified, nothing lost. **Commit-then-measure**, and put that
  warning in EVERY brief asking for a base reading, not just the mutation one.
- 🔴 **A RANGE DELETE IS AS DANGEROUS AS A `count=1` REPLACE — ENUMERATE WHAT IS INSIDE IT.**
  Trimming this doc, I deleted from one bullet to the next `##` heading and silently ate **four
  unrelated bullets I had just written**, because I never listed the region's contents. Caught
  only by grepping for each bullet's own headline afterwards. **After any range edit, grep back
  for a sentinel from every item that was supposed to survive.**
- 🔴 **A CROSS-LINE GREP CANNOT VERIFY JSX COPY, AND ITS NEGATIVE CONTROL IS EQUALLY BLIND.**
  `grep -c '>Private<'` returned **0** — and so did `grep -cE '>\s*Draft\s*<'`, reading as a
  passing control. Both useless: the badge spans three lines, grep matches within one. **When
  a pattern AND its control both return zero, suspect the pattern.** Use `grep -A3` on the
  testid, `grep -cw` with a firing control, or what the SUITE asserts.

## How to verify
- Gates, in a worktree WITH `node_modules`: `pnpm run typecheck && pnpm test && pnpm build` —
  **67 files / 987 tests** on `main` @ `66f6122`, and 67 must equal
  `git ls-files | grep -cE '\.test\.tsx?$'`. Read BOTH vitest projects; exit codes from files,
  never through a pipe. ⚠️ A fresh worktree has neither `.envrc` nor `node_modules` — copy
  `.envrc`, `direnv allow`, `pnpm install --frozen-lockfile`.
- Release state: `app_state.py model-benchmarking 0.4.15` — **`approved/live` rc 0**; the next
  release is 0.4.16. ⚠️ **One version can hold SEVERAL submissions and this command collapses
  them**: 0.4.14 has a `failed`, two `live` and two `withdrawn` records, and the command read
  `approved/failed` before the live one existed and `approved/live` after — so an earlier failed
  attempt at the same version is INVISIBLE here (it is not reporting the newest record either;
  the newest is `withdrawn`). The exact rule was not measured — read `civitai app status --json`
  for the per-submission history rather than inferring one. ⚠️ `Deploy detail` is truncated **server-side at the head** ("Build None
  …(truncated)") in BOTH the table and `--json`, so the build log before the scan table is NOT
  retrievable either way; `--json` is still the one that carries `deployDetail` per row for
  every app at once, which is how the fleet-wide reading was taken.
  `0.4.13` is rc 0 live, `0.4.9` is the rank-3 rollback watch. Read UNPIPED. 🔴 **rc 0 alone
  proves NOTHING about what is serving** (two versions return it at once). Pair it with the
  bundle grep below, and read a submission by `--id <pubreq>` — the bare `civitai app status`
  shows the newest record, which after an approval is the paired `withdrawn` one.
- Served bundle, positive control in the SAME command:
  ```bash
  B=$(curl -s https://model-benchmarking.civit.ai/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
  curl -s "https://model-benchmarking.civit.ai/$B" > /tmp/live.js
  for t in my-list-panel my-list-empty draft-badge; do echo "$t $(grep -c $t /tmp/live.js)"; done # >0 since 0.4.13
  for t in side-nav board-nav grid-open-members; do echo "$t $(grep -c $t /tmp/live.js)"; done   # >0
  for t in section-grids grid-open-panel; do echo "CONTROL $t $(grep -c $t /tmp/live.js)"; done  # >0
  for t in contribute-trigger view-switch checkpoint-name; do echo "RETIRED $t $(grep -c $t /tmp/live.js)"; done # 0
  # 0.4.14 / batch 2 — one marker per PR, all >0 since 2026-10-01:
  for t in grid-pad-top grid-body vote-tally form-next form-step-content grid-publish-confirm \
           checkpoint-card unpublished-menu prompt-override-reveal; do echo "0414 $t $(grep -c $t /tmp/live.js)"; done
  ```
  At 0.4.14 the served bundle is `assets/index-Bax577u7.js` (**464,448 B**); 0.4.13 was
  `index-DlkHPI8F.js` (448,095 B). 🔴 **A TESTID DELTA IS NOT ALWAYS AVAILABLE — AND WHEN IT IS
  EMPTY THE RECIPE BELOW SILENTLY PROVES NOTHING.** 0.4.15 (#75) added **zero** new testids, so
  the `comm -13` below returned an EMPTY set: every candidate marker was carried, and a check
  built from carried markers passes against the OLD bundle. **The fallback that worked, and the
  one to reach for whenever the delta is empty: KEEP THE PREVIOUS RELEASE'S BUNDLE and diff the
  two served files directly.** For 0.4.15 the decisive string was the compiled navigate payload
  `models/${e}?modelVersionId=${t}` — present in `index-DQzwS3Wm.js`, **absent from the saved
  0.4.14 `index-Bax577u7.js`**, i.e. the negative control runs in the same comparison. Counts
  moved too (`models/` 0→2, `scope:` 2→5, `NAVIGATE` 2→4). 🔴 **Save each release's bundle before
  the next one ships; once it is gone this control is unavailable.**
  🔴 **Derive the discriminating testids MECHANICALLY rather
  than guessing — a check built only from carried testids passes against the OLD bundle:**
  ```bash
  for r in <old-release-sha> <new-release-sha>; do git grep -ho 'data-testid="[a-z0-9-]*"' $r -- 'src/*' \
    | sed 's/.*"\(.*\)"/\1/' | sort -u > /tmp/tid-$r.txt; done
  comm -13 /tmp/tid-<old>.txt /tmp/tid-<new>.txt   # ADDED — the only valid positive markers
  comm -23 /tmp/tid-<old>.txt /tmp/tid-<new>.txt   # REMOVED — candidate negative controls
  ```
  🔴 **Then check each candidate control for a SUPERSTRING before trusting it.** `config-label`
  was "removed" yet greps 1 forever, because `grid-config-label` still ships — a substring
  collision makes a negative control silently useless. `checkpoint-name` has none and reads 0.
  ⚠️ A **template-literal** testid (`board-nav-<board>`, `my-list-<noun>`) greps 0 whether or
  not it exists — only static prefixes are answerable this way.
  ⚠️ **Do NOT expect the served hash to equal a local `pnpm build` hash.** The platform builds on
  its own image: locally `index-DkIWM9P2.js` / 447,826 B, served `index-DlkHPI8F.js` / 448,095 B
  for the same commit. Byte identity is not available as evidence here — content greps are.
- **The visual inventory:** https://claude.ai/code/artifact/8e396242-06f7-4323-809c-7e69fa00a73b
  🔴 Photographs **0.4.11** — BEFORE #66/#67 AND before batch 2, so its plates are now two
  releases stale. Still the reference for the 16 taste findings' full text, no longer a picture
  of production. **Rank 1 needs a fresh pass.**
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
  ✅ **STILL MET 2026-10-01 at 0.4.14** — rc 0 `approved/live`, served `index-Bax577u7.js`
  carrying `side-nav`/`board-nav`/`grid-open-members` plus the 13 batch-2 markers, controls
  firing, `checkpoint-name` 0. Re-met at 0.4.13. The arc stays CLOSED.
  ✅ Also MET 2026-09-29 at 0.4.11 — the arc's FIRST closure; its evidence was EVICTED
  2026-10-01 to `claudedocs/handoff-ia-refactor-landed-ARCHIVE.md` for the byte ceiling.
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
- as-of: 2026-09-29 — OPEN. It decides whether ~10 run-cell states are capturable at all.
- **The comment claims** the publish/gated hooks have no mock-host scenario in the installed
  "(pre-0.30)" testing package, so gated cells render fail-closed in the harness. Installed is
  **`@civitai/blocks-react@0.51.0`** (0.61.0 since #75), so the version premise is stale by
  number alone. But `dist/testing.d.ts` is a 4 KB re-export surface with **0** hits for
  `gated`/`publish`/`image` against a firing control — and 🔴 **a type declaration is not a code
  path**, so that zero is evidence about the `.d.ts`, not the mock host.
- **Next probe:** boot it and look — `pnpm run dev:harness`, then grep the DOM for
  `result-image`/`result-hidden`/`gated-loading`. Present ⇒ the comment is wrong; absent ⇒ right
  for a stale reason. Either way the file changes. Detail EVICTED 2026-10-02 to the ARCHIVE.

### A 720px viewport reports `innerWidth: 721` and the block stays desktop
- as-of: 2026-10-02 — **STILL UNRESOLVED, and now known to be UNRESOLVABLE from here.**
- **Symptom:** emulate 720px against the live app; the block reports `innerWidth: 721` and renders
  the desktop sidebar. Reproduced 3x. `MOBILE_BREAKPOINT_PX` (`src/compact.ts`) is consumed as
  `(max-width: <n>px)`, an inclusive bound, so 721 legitimately fails it; collapse fires at 718.
- **Two rivals, nothing observed separates them:** (a) OOPIF/CDP emulation rounding, (b) a real
  off-by-one in how the host sizes the frame — which would mean a physical 720px device gets the
  desktop layout. 🔴 Do not pick the convenient one.
- **Next probe — and it is the ONLY one that can work:** a NON-EMULATED 720px width (a physical
  device, or a real window resized to 720 outer with the frame's own `innerWidth` read inside).
  🔴 **Every emulated measurement is structurally incapable of deciding this**, confirmed again by
  the 2026-10-02 taste pass. Full measurements EVICTED 2026-10-02 to the ARCHIVE.

### The Qwen-Image cell can never be filled, and this account cannot remove it
- as-of: 2026-10-02 — **re-confirmed LIVE this session**: still renders `not generated yet` /
  `Run this cell` with the button **enabled**, so the app does not know the checkpoint is gone
  and would attempt a spend.
- **Why it is stuck:** the empty cell is in the SYSTEM Top Grid (`topByVotes(...)`,
  `App.tsx:1001`), which renders above every board and is what the captures photograph at boot,
  so editing the operator's own grid changes nothing. They do not own the matchup holding it
  (`canEdit = isOwn`, `MatchupBody.tsx:122`), and no second Civitai account is reachable here.
- **Leading hypothesis:** nothing this account can do removes it — it leaves the board only by
  the author acting, or by falling out of top-N on votes, impossible today at 2 matchups.
- **Next probe:** decide rather than measure — ship it as a recorded exception, submit a
  competing matchup with live checkpoints, or ask the author.
  ⚠️ Full ruled-out evidence EVICTED 2026-10-02 to the ARCHIVE.

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

**NEW, from the 0.4.14 LIVE taste pass (2026-10-02, browser-driven, zero raises):**
- 🔴 **THE CELLS GREW AND THE IMAGES DID NOT — `GatedCell.tsx:203` lays each cell out as
  `repeat(auto-fill, minmax(72px, 1fr))`, and every cell holds exactly ONE image, so `auto-fill`
  turns the extra column width into EMPTY TRACKS.** Measured live: at a 3014px viewport the cell
  is 403px with **5 tracks x 77px** -> **19% fill**; at 1440px, 184px with 2 x 90px -> **49%**. ✅ #66's `minmax(200px, 420px)` IS working (`grid-body`
  tracks read `220px 420px x5` at 3014, `180px 200px x5` at 1440) — the gain is absorbed
  downstream, which is why "make cells larger" did not land visibly. 🔴 **`auto-fit` is NOT a
  free one-word fix:** one image with `object-fit: cover` in a 403px track makes the ROW ~403px
  tall (~5x today), so it needs a max (`minmax(72px, ~200px)`) — a sizing decision, not a typo.
- 🔴 **F2's closing condition FAILS, measured live.** At 390px on Home with no interaction,
  `side-nav-list.scrollWidth` **411** vs `clientWidth` **345** — overflowing by **66px** (the
  doc's 90-24 estimate was right). "Grids" is OFF-SCREEN on first paint with a visible
  scrollbar; `useState(true)` expanding My Benchmarks puts five items in a 345px strip. 🔵 Not a defect, checked and cleared: the 1180px matrix's horizontal scroll
  IS properly contained (`results-grid` is `overflow-x: auto` and genuinely scrollable).
- 🔴 **F3 IS WORSE THAN "the action row jumps with description length" — the SAME control pair
  lands in two different CORNERS.** Two matchup cards in one list: a 1-line description puts
  the ⋮ + vote at **top-right** (`y 17, x 1055`), a 2-line one at **bottom-left**
  (`y 113, x 17`). Mechanism: the foreign card's vote is an interactive button inside the
  cluster, the owned card's is a non-interactive count (#71's `VoteCount`/`VoteTally` split, which
  is itself behaving correctly), so the cluster reflows.
- **F13 confirmed live:** on the grid card `Open` is bordered, `Remove` is bare red text, the
  vote a bordered pill — the destructive control is the quietest of the three.
- ⚠️ **NOT covered by this pass, and not guessed at:** F10/F11/F12 need create/edit modals opened,
  which is outside the capture recipe's vetted-clickable set (an in-frame click is a plain
  authenticated write and nothing refuses one). F16 is unanswerable by emulation BY CONSTRUCTION —
  its discriminator is a NON-emulated 720px width.

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
