# Handoff: consent-resume-and-gated-read — 2026-09-27 (SHIPPED)

## Run this first — the index, one command
```bash
cairn recall --repo /home/zach/workspace/civit/civitai-app-model-benchmarking
```
Terse pointers this doc does not carry, curated by past sessions and outliving it.
🔴 RECALL, NOT LIVE OBSERVATION — every line is a pointer to VERIFY, never a current
reading, and it may describe a gotcha already fixed. Non-blocking: if it exits
non-zero, print the stderr line and carry on.

## Goal — MET
Ship PR #44: four operator-reported defects — consent doesn't resume the run (1), the
publish prompt hides the images (2), a false "Insufficient Buzz balance" on re-submit
(3), the gated image read failing once with only a manual Retry as the cure (4).
- **closing-condition: SATISFIED 2026-09-27 00:16 CDT.**
  `app_state.py model-benchmarking 0.4.6` → `approved/live`, **rc 0**. Served bundle
  MOVED `assets/index-TFLPOa-0.js` (393,454 b) → `assets/index-CL_wLzp7.js`
  (405,448 b, matching the local build's 405.30 kB) and carries `gated-retrying` ×1,
  `cell-balance-unknown` ×1, `cell-publish-preview` ×1, `cell-publish-notice` ×1,
  `cell-publishing` ×1, with `view-switch` ×1 as the positive control — so the greps
  could see, and a zero would have meant something. Copy strings confirmed in the
  served JS too ("Your Buzz balance could not be read, so this run is held.",
  "Checking your Buzz balance", "Retry balance check", "The read stalled",
  "These are your outputs"), plus the `gated_read_error` event name.

## State now
- **0.4.6 is approved/live.** `pubreq_01M3GMAG4XF4GRS9JS6KKCTG6K`, approved by
  `zachlowdenzx` (8753561, `isModerator: true`) at 00:12 CDT, built and serving by
  00:16. `https://model-benchmarking.civit.ai/` → 200.
- PR #44 merged (squash `7dd4c8511`), verified BY CONTENT: `origin/main`'s `src/` +
  `README.md` are byte-identical to the branch head `ddfa2bc`. PR #47 (version-only
  release commit) merged (squash `0fddd6251`). `origin/main` = `0fddd62`; base clone
  fast-forwarded to it. Both remote branches deleted; all three worktrees removed
  (`/tmp/wt-mb`, `/tmp/opencode/wt-mb-gatedread`, `/tmp/wt-mb-submit-046`).
- Claim `civitai-consent-resume-gated-read-1` **RELEASED**.
- The whole browser flow (moderator queue → approve) ran on a **hidden background
  tab** via `wake`; `activate` was never called, so **zero screen switches**.

## Open investigations — live diagnosis state
### Gated read failure — WHICH mechanism fired for the operator is STILL unknown
- as-of: 2026-09-27. Unchanged by this release: 0.4.6 fixes the *family* (45s + one
  bounded auto-retry) and adds the telemetry that will name the mechanism, but the
  original occurrence was never attributed.
- **Symptom + exact repro:** live 0.4.5, operator's second run attempt: the cell's
  image read errored; clicking the cell's Retry loaded the image. Operator
  paraphrased it "failed to load image" — a string that exists nowhere in this repo
  or civitai/civitai's server tree (both grepped).
- **Ruled out:** the RUN failing with an image error (`via: code`); the `<Image>`
  broken-url fallback (`via: code`); rate-limit 429 as UNLIKELY (`via: measurement` —
  one grid mount is dozens of reads against 150/10s per blockInstanceId).
- **Leading hypothesis:** the old 15s timeout on a cold host read right after publish.
  Transport/host-error not excludable from here.
- 🔴 **Next probe, and the trap in it:** the fix tracks `gated_read_error` with a
  `message` property naming timeout vs transport vs host error — **but nothing
  consumes `track()` today.** `App.tsx`'s own `track` docstring records it: civitai's
  `hostHandlerParity.ts` says `TRACK_EVENT` is *"currently NOT bridged by EITHER host
  (no host-side analytics sink wired)"*, and no `onMessage('TRACK_EVENT')` handler
  exists in `IframeHost.tsx` or `PageBlockHost.tsx`. So **do not plan to query
  ClickHouse for this** — there is nothing to query until a sink is wired. Until
  then the only route is the operator's literal error text on the next occurrence.

## Next steps (ranked)
1. Real-host verification of 0.4.6, **human-required**: the consent → Allow → the
   pressed cell advances itself to Confirm → Confirm spends exactly once; a run with
   an unreadable balance shows "could not be read" + **Retry balance check**, never
   "Insufficient Buzz balance"; the publishing cell renders the outputs the host's
   "Publish to the shared grid?" dialog is asking about; a fresh output renders with
   "Awaiting rating" (#45), never "Hidden — rated mature". Turnstile + auth gated —
   no local run, harness run or test covers it. The no-grant fixture account for the
   press-time-consent arm is in the cairn index for this scope (client-confidential;
   read it there, never copy it into this public repo).
   forcing: none — but it is the only thing standing between "shipped" and "verified".
2. Wire a `TRACK_EVENT` sink host-side, or accept that every `track()` call in this
   app is decoration. Per this repo's `CLAUDE.md` that is a PR in `civitai/civitai`,
   not a workaround here. It is what makes step 1's telemetry half real.
   forcing: check — a `gated_read_error` row retrievable from the analytics pipeline.
3. Check the grid edit-in-place tripwire (deferred 2026-09-09, nothing watches it):
   does any published grid render a non-zero missing-member count, or is the
   Community Grids published count approaching ~10?
   forcing: none.

## Defects (batched)
Two found while releasing, both **fixed in this session's docs commit**, neither in
shipped code:
- 🔴 **`CLAUDE.md` claimed `.github/` is not in the submitted bundle. It is.**
  Measured on CLI 0.1.105: `--package-only` packaged 123 files *including*
  `.github/workflows/ci.yml`, skipping only `.envrc` (`.env*`) and `.git`. The
  conclusion it supported ("a green CI run is not evidence the platform can build
  this app") survives — CI is a different environment and the builder runs
  `buildCommand` on its own image — but the reason given for it was false.
- 🔴 **0.4.5 was packaged from a DIRTY tree and shipped three junk files.** 0.4.6's
  bundle diff shows `−3 REMOVED: pf.txt, sub.txt, val.txt` — none ever tracked in
  git, none gitignored, i.e. a prior session's `pf/sub/val` output redirects sat in
  the packaging directory and went to production. The packager takes whatever is on
  disk. `CLAUDE.md` now carries the clean-worktree rule with this incident attached.

## Gotchas / decisions / dead-ends
- 🔴 vitest's transform cache (`node_modules/.vite`) serves STALE modules for
  same-length edits between fast successive runs. **A version bump `0.4.5`→`0.4.6` is
  exactly that hazard** — same length. Clear the cache between runs. Done this
  session: the lockstep guard was watched RED on a deliberate one-sided mismatch
  (`expected '0.4.6' to be '0.4.5'`, that case specifically) with the mutant proven
  to have executed.
- 🔴 The bash guard judges `git commit` against the hook's cwd — a worktree commit
  MUST spell `git -C <worktree-path> commit -F <msgfile>`.
- 🔴 `gh pr merge --delete-branch` **fails the whole flag** when a local worktree
  holds the branch: it merges, then errors on the local delete, and the **remote**
  branch survives. Hit twice this session. Remove worktrees first, or delete the
  remote branch by hand and verify with `git ls-remote --heads`.
- 🔴 `app_state.py <app> <version> | tail` reports **tail's** exit code, not the
  script's. Read the rc without a pipe — a `pending/-` state printed alongside a
  cheerful `rc=0` is how a not-yet-live release gets called live.
- Post-consent behavior is DECIDED (operator, 2026-09-26): resume to the CONFIRM
  gate — consent authorises spend-up-to-cap, only Confirm authorises this spend. Do
  not "fix" it into an auto-run.
- The `+N more` publish-preview branch is deliberately kept although statically
  unreachable (the orchestrator's honouring of `quantity: 1` is an external contract
  nobody here can assert). PR #44's body has the full trace.
- The auto-retry pattern is read-path ONLY — never copy it onto the money path.
- Two non-blocking review observations on #44, recorded and NOT fixed (full text in
  PR #44's review comment): (a) `GatedCell`'s `retrying` flag is reset by the fetch
  effect, so "The read stalled — retrying…" shows during the 2s backoff but not
  during the retry read itself — cosmetic, the spinner stays; (b) `consentAskedRef`
  and `balanceRefetchedOnGrantRef` are not cleared on a viewer swap (only
  `pendingConsentRunRef` is), so a viewer arriving with the scope gets one spare
  balance read and a viewer swapping in after the slot was consumed gets no on-grant
  refetch. Both pre-date #44's concern; the new Retry button is the way out.

## How to verify
- Gates (in a worktree WITH `node_modules`): `pnpm run typecheck && pnpm test &&
  pnpm build` — **46 files / 564 tests**, and the 46 should match `git ls-files`
  exactly (16 `.test.ts` node + 30 `.test.tsx` dom). Both vitest projects must be
  read; a mismatch between those counts means a project was silently excluded.
- Ship check: `python3 ~/.config/opencode/skills/civitai-app-fleet/app_state.py
  model-benchmarking 0.4.6` (rc 0 = live, **read it unpiped**) plus the fleet skill's
  served-bundle grep with `view-switch` as the positive control.
- Real host (human): step 1 above.
