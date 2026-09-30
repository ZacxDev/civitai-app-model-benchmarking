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
