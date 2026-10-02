# Archive — resolved investigations, `handoff-ia-refactor-landed`

Moved out of the live handoff on 2026-09-30 because the doc hit its byte ceiling.
🔴 **EVICTED, NOT DELETED.** Every block below is CLOSED or explicitly SUPERSEDED. They
are kept so a future session does not re-derive a question already answered, and so the
ruled-out theories stay readable. Nothing here is current state.

---

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

### ✅ CLOSED 2026-09-29 — the paired `withdrawn` publish request is normal bookkeeping
- as-of: 2026-09-29
🔴 **SUPERSEDES the block titled "An unexplained SECOND publish request for 0.4.9" below.
That block's `Next probe` is DISCHARGED — do not run it.** The probe it proposed was to
check whether every approved version carries a paired `withdrawn` row. Answer: it does.
**Measured three for three** — 0.4.9 (`pubreq_01M3PXAZQKRAE1M8SXKE9XGCGX`), 0.4.10, and
0.4.11 (`pubreq_01M3Q8HAWHCDN835ZR9AF0B3HB`) each produced a second, source-less
`withdrawn` record within minutes of the approval click, while the originally-submitted
pubreq carried the source sha and went on to build. The approval flow creates and
withdraws a paired record. Nothing was double-submitted; `civitai app submit` was run
exactly once per version. `via: measurement`

### ✅ RESOLVED 2026-09-29 — why 0.4.9/0.4.10 never deployed: the registry push, not the build
- as-of: 2026-09-29
🔴 **SUPERSEDES the block titled "0.4.9 approved but stuck in `building` for 25+ minutes"
below. Its `Next probe` and its "ordinary slow platform build" hypothesis are BOTH
retired — do not re-derive either.**
- **Observed (with values):** `civitai app status model-benchmarking` on 0.4.10 reported
  `Status: approved`, `Deploy state: failed`, and a `Deploy detail` ending, in order:
  `kaniko build exit: 0` · `trivy scan PASSED (F10 gate): 0 un-ignored HIGH/CRITICAL`
  (alpine 3.23.4, 70 packages) · `Error: Get "https://<image-ref>": dial tcp
  <registry-ip>:443: i/o timeout` · `crane push exit: 1`. The image BUILT and the scan
  PASSED; the pipeline failed **pushing the image to the container registry, at the
  network layer**. 🔴 The concrete registry IP is deliberately NOT recorded here — this
  repo is a PUBLIC mirror and a `bash-guard` hook refused a commit message containing it.
  Read it live from `civitai app status model-benchmarking`. `via: measurement`
- **Ruled out:** *"the platform builder chokes on something in our bundle that CI cannot
  see"* — the plausible CI-is-a-different-environment story, and it is FALSE here:
  `kaniko build exit: 0` says the build succeeded every time. `via: measurement`
- **Ruled out:** *"dependency drift / `minimumReleaseAge` / the absent
  `pnpm-workspace.yaml`"* — `git diff 938e3d9..8fc1adb -- package.json pnpm-lock.yaml`
  is the version field and nothing else, and 0.4.8 shipped from `938e3d9`. `via: command`
- **Resolution:** transient. An identical tree succeeded as 0.4.11 on the third attempt.
- ⚠️ **Still NOT explained: why 0.4.9 never flipped to `failed`.** 0.4.10 went
  approval→failed in ~7 minutes; 0.4.9 has sat at `building` for hours. Unresolved, and
  the reason rank 3 exists.
- 🔵 **`building` vs `deploying` IS a discriminator** — 0.4.11 went
  `building → deploying → live`, so a version that never reaches `deploying` has not got
  past build/push. That is the state read worth making, and it is NOT "slow vs stuck".


## EVICTED 2026-09-30 from the main doc — `## What landed` (0.4.6 and the IA refactor)
🔴 Pure release history, MOVED not deleted, to keep the main doc under its 65,536 B ceiling
while 0.4.12/0.4.13's release record was added. Nothing here is load-bearing for current
work: 0.4.6's four run-path fixes and PR #49's one-page IA both shipped and were verified
live long ago. The `## Goal` section of the main doc still records the arcs they closed.

### What landed (0.4.6 → the IA refactor)
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

## EVICTED 2026-10-01 from the main doc — the parked five-package bump, in full
🔴 MOVED, not deleted. Evicted to keep the main doc under its 65,536 B ceiling while the
second operator-feedback batch was recorded. 🔴 TWO PREMISES BELOW ARE NOW FALSE and are
corrected in the main doc: starters PR #487 is MERGED, and #485 is fixed upstream by PR
#493 — so the claim that deleting `ContributeMenu.tsx` is impossible NEEDS RE-DERIVING.
Every measurement is still good; the conclusions drawn from #485/#487 are not.

### The parked bump — why it did not ship, and what would unblock it
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
- `loading="lazy"` was not expressible on `CivitaiImage`. ✅ **CLOSED — starters PR #487
  MERGED 2026-09-30 05:52.** No longer a prerequisite and no longer a cost;
- barrel import costs **+128.81 kB (+31%)** because the root registers all 46 elements;
  per-path imports (`@civitai/components-react/elements/civitai-image`) cost **+27.02 kB**.
  The parked patch uses per-path.

### EVICTED 2026-10-01 — upstream issue #486 (WCAG 2.5.8 on shared controls)
Upstream, informational, never ours to close.

- **issue #486** — a **real WCAG 2.5.8 (AA)** finding on shared controls: `<civitai-checkbox>`
  is 16×16 and `<civitai-switch>` 36×20, passing singly via the spacing exception but failing
  in the ordinary stacked-form layout (3 checkboxes → 3 violations). 🔴 The repo's own sweep
  is structurally blind: axe-core 4.12.1 ships `target-size` **disabled**, and its a11y test
  also sets `resultTypes: ['violations']`, so `incomplete` is never collected.
  ⚠ Note what this ISN'T: `<civitai-menu-item>` at 33.6px **clears** 2.5.8 (24×24 AA) and is
  in band with the whole set (button 36, action-button 36, nav-item 28) — 44×44 is 2.5.5
  **AAA**. An earlier framing of mine called it a violation; it is a deliberate density
  choice, and filing it would have sent a maintainer to working code.

### EVICTED 2026-10-01 — the arc's FIRST closure, met at 0.4.11
Superseded by the re-measured closure at 0.4.13, which the live doc carries in full. Kept
because it is the original evidence that the arc's closing-condition was ever met.

- ✅ **MET 2026-09-29 at version 0.4.11.** `app_state.py … 0.4.11` → `approved/live`,
  **rc 0**. Served bundle `assets/index-t70oWAUj.js` (440,492 B, changed from 0.4.8's
  `index-PwE4InET.js` / 434,453 B): `side-nav` 2 · `board-nav` 1 · `nav-my-grid` 1 ·
  `grid-open-members` 1 · retired `contribute-trigger` **0** and `view-switch` **0** ·
  positive control `section-grids` 1 / `grid-open-panel` 1. **The arc is CLOSED against
  this line.** Everything in `Next steps` is a NEW arc or a pre-existing deferral.

### EVICTED 2026-10-01 — three closed/historical bullets, for the byte ceiling
Moved verbatim from the live doc. Each left a one-line pointer there.

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
- 🔵 **BOTH "use the upstream component" ESCALATION CLAUSES WERE HONOURED — this is NOT a
  dropped instruction, and an earlier reading nearly recorded it as one.** Round 1 said "if
  MISSING in upstream components, dispatch open a PR to add it": `<civitai-menu>` is not
  missing, it is present-but-unadoptable (throws on mount in any non-browser DOM), so the
  clause never triggered and an ISSUE (#485) was the right instrument. Round 2 said "if it's
  not, pull it from the native site settings page": that is exactly what shipped, a local
  `SideNav` mirroring the upstream contract. **Check the CONDITION on an escalation clause
  before reporting it unmet.**
- 🔴 **A BYTE-CEILING GATE CAN AND SHOULD CHANGE THE DESIGN, NOT JUST THE WORDING.** devrc's
  `test_resume_skill_size.py` caps `resume/SKILL.md` at 22,400 B with an 800 B headroom
  floor; the file sat at 21,509, leaving **91 bytes**. Four rounds of tightening ended with
  the detail in the sidecar and a one-line pointer in the body — the correct shape, reached
  because the gate refused the lazy one. `--override-size-ratchet`-style escapes existed and
  were deliberately not taken: **raising a ceiling to fit your own note is the weakest move
  available.**

### EVICTED 2026-10-01 (second pass) — superseded by 0.4.14 going live
Moved verbatim; each left a pointer in the live doc.

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

6. ✅ **CLOSED — #66/#67 shipped as 0.4.13 (2026-09-30), #70–#73 as 0.4.14 (2026-10-01).**
   0.4.12 failed on `Deploy timed out` and 0.4.13 was a byte-identical retry. The ordering
   caveat here was DELIBERATELY OVERRIDDEN by the operator both times — production was
   generations behind `main`, so there was nothing live to judge. **Do not re-open.**
   forcing: none — closed.


### EVICTED 2026-10-01 — the two capture defects, now fixed in the merged recipe

Two defects **no gate caught**, both now guarded:
- `h=1087` is the tightest *legal* crop height, passes every gate, exits 0 — and puts the
  **support widget** in all three assets. `h=1040` clears it.
- `capture.sh` does **not reload before the FIRST state**, so a run can inherit a
  hand-driven tab and ship an asset with two overlays open. Each state now asserts the
  other two are closed (watched failing on a contaminated setup, exit 4, no asset).

Weakest remaining link, flagged in-file: `waitForText "Matchup"` is a single word unique
only **by case** — a future title-case "Matchups" heading would silently make it inert.


### EVICTED 2026-10-01 — the paired `withdrawn` publish-request account (CLOSED)

- 🔵 **THE PAIRED `withdrawn` RECORD IS NOW FOUR FOR FOUR** (0.4.9, 0.4.10, 0.4.11, and 0.4.12 —
  `pubreq_01M3T96D9BZVKHAGN2CX62KJCB`, source-less, minutes after the approval click, while the
  submitted pubreq carried the sha and went on to build). Normal platform bookkeeping, already
  CLOSED in the ARCHIVE. `civitai app submit` was run exactly once per version. Do not
  re-investigate it; do not read it as a double submit.

### EVICTED 2026-10-01 — extract_user_msgs.py inflation, worked numbers

- ⚠ **`extract_user_msgs.py` is Claude-Code-only** (walks `~/.claude/projects`), so the opencode
  genesis session's messages are unreadable by it — a measured limitation, not an absence of
  asks. It also counts task-notifications as `typed`, inflating the count: 28 records here were
  9 typed asks, 6 answers, 13 notification payloads. Separate them by size first.

### EVICTED 2026-10-01 — the squash-breaks-a-stack rebase recipe

- 🔴 **A SQUASH MERGE BREAKS A STACK, AND THE CHILDREN MUST BE REBASED `--onto`.** After
  merging #59, retargeting #60 to `main` immediately went `CONFLICTING/DIRTY` — the
  squash is a new commit with different parents, so the children genuinely do not descend
  from it. The recipe that worked, twice:
  `git rebase --onto origin/main <old-parent-tip>` (replays ONLY the child's own
  commits), verify the gates on the result, then `git push --force-with-lease=<branch>:<old-sha>`.
  🔴 And **retarget to `main` BEFORE force-pushing**, not after — see the CI gotcha below.

### EVICTED 2026-10-01 — the force-push CI-event drop

- 🔴 **A FORCE-PUSH DURING THE PARENT'S MERGE CAN DROP THE CI EVENT ENTIRELY.** #61's
  rebased head got **zero** check-runs for 5+ minutes while every other head got one.
  The zero was proven real by running the same query against #60's known-green head as a
  **positive control** (`build=success`), which separated "no CI ran" from "my query is
  wrong". Remedy: `gh pr close` + `gh pr reopen` fires `pull_request: reopened` and CI
  runs. Do not merge on a `CLEAN` mergeStateStatus alone — that is a CONFLICT signal and
  says nothing about CI having finished.

### EVICTED 2026-10-01 — the one-page-IA listing cost, full measurements

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


### EVICTED 2026-10-01 — the approval-queue positional-selector account

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

### EVICTED 2026-10-01 — the sticky-footer hit-test geometry

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


### EVICTED 2026-10-02 — the Qwen-Image cell, full ruled-out evidence

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

### EVICTED 2026-10-02 — two open investigations, full prose (720px, mock host)

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


### EVICTED 2026-10-02 — the five guards that proved less than they claimed

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
