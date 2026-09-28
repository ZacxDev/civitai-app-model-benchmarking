# Handoff: IA refactor landed, 0.4.6 live, 0.4.7 unreleased — 2026-09-27

## Run this first — the index, one command
```bash
cairn recall --repo /home/zach/workspace/civit/civitai-app-model-benchmarking
```
🔴 RECALL, NOT LIVE OBSERVATION — every line is a pointer to VERIFY, never a current
reading. Non-blocking: if it exits non-zero, print the stderr line and carry on.

## State now
- **`main` = `b8de2d6`**, clean, synced with `origin/main`. No worktrees. No claims held.
- **0.4.7 is LIVE** — `approved/live`, rc 0 (read unpiped), serving
  `assets/index-nlC3M9Z1.js` (414,348 B). `main` and the released version agree.
- **Store listing updated and moderator-approved** — three screenshots captured against
  live 0.4.7. The three that depicted the deleted tab strip are gone.
- **Capture recipe re-measured and merged** — `civitai/civitai` `d9dc5ba` (PR #5183).
- ⚠️ The base clone's `node_modules` is **stale** (blocks-react 0.46.0 against a `^0.51.0`
  pin), so `pnpm run typecheck` fails there until `pnpm install`. Every gate number in this
  doc was measured in a freshly-installed worktree.
- **No `clawgate-task:` field** — `clawgate_handoff.sh resolve` exited **5** (nothing
  resolved). An unknown session id answers 200 with an empty array, so that zero cannot
  distinguish "touched no task" from "wrong id". It is not a clean bill of health.

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
1. 🔴 **Resolve the DROPPED operator instruction — "make it full-width".** See the Open
   investigations block below. It is the only item here that is an unanswered ask rather
   than a known deferral. Repo `civitai-app-model-benchmarking`; likely `src/theme.ts`
   (`contentStyle`) if it turns out to mean the app shell, but the referent is UNKNOWN and
   must be established before any edit.
   forcing: user — typed 2026-09-27 05:25:21 and never answered; the transcript shows no
   assistant turn following it.
2. **Test-merge PR #53 against the new `main`.** `zach/sdk-port-model-benchmarking`
   ("move data + host UI onto `@civitai/sdk`") is another session's work, branched BEFORE
   the 39-file IA refactor. `gh pr view 53 --json mergeable` says CLEAN, which is a
   conflict claim and NOT a semantic one — build an integration branch off `main`, merge
   it, and run the full suite there.
   forcing: regression — a clean textual merge of a pre-refactor branch over a refactor
   this size is the documented disjoint-file break shape.
3. **Contribute menu still does NOT use the upstream component** — the literal ask was
   "use same upstream component as native site's nav Create button". It is a local
   `src/components/ContributeMenu.tsx` (388 lines). Blocked on `civitai-app-starters`
   **issue #485** (jsdom implements no part of the popover API `<civitai-menu>` mounts
   with; the panel testid the capture contract needs is inside upstream's shadow root).
   forcing: gate — #485 closing, or a real-browser test runner for this repo.
4. **The five-package bump — parked.** See its own section below; patch preserved outside
   this public repo. Note `civitai-app-starters` **PR #487** (`loading`/`decoding` on
   `CivitaiImage`) is a PREREQUISITE of it, not a cost of it, and is still OPEN.
   forcing: gate — #487 merging and releasing, plus either blocker in #485.

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

## How to verify
- Gates (worktree WITH `node_modules`): `pnpm run typecheck && pnpm test && pnpm build` —
  **50 files / 624 tests**, and the 50 must match `git ls-files | grep -cE '\.test\.tsx?$'`
  exactly. Both vitest projects, read separately; exit codes from files, not through a pipe
  (per-test output goes to **stderr** here, under ~29k lines of pre-existing jsdom CSS
  noise).
- Ship check: `python3 ~/.config/opencode/skills/civitai-app-fleet/app_state.py
  model-benchmarking <version>` (rc 0 = live, **unpiped**) plus the fleet skill's
  served-bundle grep with a token you know is present as the positive control.
## Goal
Ship the one-page IA refactor for `model-benchmarking` and get it live, then restore the
store listing that the refactor invalidated.
- **closing-condition:** `check` — `app_state.py model-benchmarking 0.4.7` exits 0, the
  served bundle carries `section-grids`/`contribute-trigger` with `view-switch-*` at 0
  (positive control present), and `civitai app listing status` shows three screenshots
  taken against 0.4.7. ✅ **ALL THREE MET 2026-09-28.**
  ⚠ Restored here — an earlier rewrite of this doc dropped the field entirely. The arc is
  CLOSED against it. Everything in `Next steps` below is either a NEW arc (the dropped
  instruction) or a pre-existing deferral; none of it extends this condition.

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
### 🔴 A typed operator instruction — "make it full-width" — was dropped and never answered
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
