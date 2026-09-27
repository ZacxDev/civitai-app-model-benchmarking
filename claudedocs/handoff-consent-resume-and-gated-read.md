# Handoff: consent-resume-and-gated-read — 2026-09-26

## Run this first — the index, one command
```bash
cairn recall --repo /home/zach/workspace/civit/civitai-app-model-benchmarking
```
Terse pointers this doc does not carry, curated by past sessions and outliving it.
🔴 RECALL, NOT LIVE OBSERVATION — every line is a pointer to VERIFY, never a current
reading, and it may describe a gotcha already fixed. Non-blocking: if it exits
non-zero, print the stderr line and carry on.

## Goal
Ship PR #44 (ZacxDev/civitai-app-model-benchmarking#44): four operator-reported defects —
consent doesn't resume the run (1), the publish prompt hides the images (2), a false
"Insufficient Buzz balance" on re-submit (3), and the gated image read failing once with
only a manual Retry as the cure (4, this session). Live version is 0.4.5; the PR is
unreviewed.
- **closing-condition:** `check` — `python3 ~/.config/opencode/skills/civitai-app-fleet/app_state.py model-benchmarking 0.4.6` exits 0 AND the served bundle's grep carries `gated-retrying` and `cell-balance-unknown` (positive control `view-switch`), per the fleet skill's bundle recipe.

## State now
- PR #44: open, head `ddfa2bc`, CI SUCCESS, `MERGEABLE/CLEAN`, **unreviewed**. Commits (old→new): `f72716b` resume+preview, `4460f79` TTL drop, `c9447d2` buzz-balance, `7c257ec` merge of main (carries #45 `ratingPending` + #46), `ddfa2bc` gated-read 45s + auto-retry + telemetry.
- This session: merged main into the branch; added `ddfa2bc`; appended "Defect 4" to the PR body. All gates green on the merged tree: typecheck, 46 files / 564 tests (both vitest projects), build.
- Live = 0.4.5 (`app_state.py model-benchmarking 0.4.5` → `approved/live`), bundle `assets/index-TFLPOa-0.js` (393,454 b).
- **Claim HELD:** `civitai-consent-resume-gated-read-1` (canonical remote; release it when the ship decision lands).
- Worktree `/tmp/opencode/wt-mb-gatedread` — branch `zach/gated-read-45s-auto-retry` (= PR branch + merge + `ddfa2bc`), node_modules installed (blocks-react 0.51.0). STALE sibling `/tmp/wt-mb` holds the PR branch at `c9447d2` from a prior session (clean; untouched).
- Base clone `node_modules` STALE: blocks-react@0.46.0 vs package.json `^0.51.0` — its typecheck fails on `ratingPending` until `pnpm install`.

## Open investigations — live diagnosis state
### Gated read failure — WHICH mechanism fired for the operator is still unknown
- as-of: 2026-09-27
- **Symptom + exact repro:** live 0.4.5, operator's second run attempt: the cell's image read errored; clicking the cell's Retry button loaded the image. Operator paraphrased it "failed to load image".
- **Observed (with values):** live bundle `index-TFLPOa-0.js` contains `Timed out loading images` ×1, `failed to fetch gated images` ×1, `gated-retry` ×1. NO literal "failed to load image" anywhere in this repo or civitai/civitai's server tree (grepped both). Candidates: the app's 15s timeout (`src/components/GatedCell.tsx:35` pre-`ddfa2bc`), SDK `useGatedImages.js:28` fallback, host error strings verbatim (civitai `src/pages/api/v1/blocks/gated-images.ts`: 401 "Block token required", 429 "Rate limit exceeded, please retry shortly."). Host read rate limit: 150/10s per blockInstanceId (`block-catalog-rate-limit.ts:88-89`).
- **Ruled out:** the RUN failing with an image error — `via: code`; no matching string in civitai/civitai's orchestrator/server tree (closest `poll-iteration.ts:47` `Failed to download: ${status}`), and `cell-retry` re-spends via Confirm, which doesn't match "retry worked". The `<Image>` broken-url fallback ("unavailable", no Retry) — `via: code`. Rate-limit 429 as UNLIKELY — `via: measurement`; one viewer's grid mount is dozens of reads vs 150/10s.
- **Leading hypothesis:** the 15s timeout on a cold host read right after publish (the operator's own reading); transport/host-error not excludable from here — which is why the fix covers the family (45s + one bounded auto-retry) and telemetry now names the mechanism next time.
- **Next probe:** on the next occurrence, read the `gated_read_error` event's `message` property in the host analytics pipeline (ClickHouse) — it names timeout vs transport vs host error. If the operator still has the session, ask for the literal error text.

## Next steps (ranked)
1. Review and merge PR #44 — the PR is ready (CI green, mergeable CLEAN, four defects fixed with watched red/green + mutation batteries).
   forcing: user — the operator reported all four defects; #44 is their fix, awaiting their review.
2. Release 0.4.6 after the merge: bump BOTH `package.json` + `block.manifest.json` (`src/manifest.test.ts` enforces lockstep), `civitai app validate`, `app_state.py` floor + preflight, submit from a clean worktree off origin/main (fleet skill), moderator approve at `/apps/review`, verify by served-bundle grep.
   forcing: gate — blocked on #44 merging and on moderator approval; nothing moves without both.
3. Real-host verification, human-required: the consent→Allow→Confirm→run click path on the released version, AND the 0.4.5 press-time-consent flag (the no-grant fixture account is recorded in the cairn index for this scope — client-confidential, read it there, never copy it into this public repo). Turnstile + auth gated; no local or harness run can cover it.
   forcing: none
4. Check the grid edit-in-place tripwire (deferred 2026-09-09, nothing watches it): does any published grid render a non-zero missing-member count, or is the Community Grids published count approaching ~10?
   forcing: none

## Defects (batched)
- (none this session — review found nothing; CI green on the merged tree)

## Gotchas / decisions / dead-ends
- 🔴 vitest's transform cache (`node_modules/.vite`) served STALE modules for same-length edits between fast successive runs — a mutation sweep here MUST clear it between mutants (`rm -rf node_modules/.vite`), or a SURVIVED may mean the mutant never ran. Measured this session: M2/M3 passed green with the mutant verifiably on disk.
- 🔴 The bash guard judges `git commit` against the hook's cwd (the base clone, on main) — a worktree commit MUST spell `git -C <worktree-path> commit -F <msgfile>`. Bare `git commit` in a worktree is refused; the `-C` spelling is the guard's own documented resolution.
- gh's PR commits rollup lists oldest→newest; the branch tip was `c9447d2`, not the first-listed `f72716b`. Verify the tip from the ref, not the UI order.
- Post-consent behavior is DECIDED (operator, 2026-09-26): resume to the CONFIRM gate — consent authorises spend-up-to-cap, only Confirm authorises this spend. Do not "fix" it into an auto-run.
- The `+N more` publish-preview branch is deliberately kept although statically unreachable (the orchestrator's honouring of `quantity: 1` is an external contract nobody here can assert). PR body has the full trace.
- The auto-retry pattern is read-path ONLY — do not copy it onto the money path (a spend never auto-retries).
- Local install discipline: pnpm repos here resolve through the worktree's own `pnpm install --frozen-lockfile`; the base clone's node_modules can be stale relative to package.json (it is right now).

## How to verify
- Gates (in a worktree WITH node_modules installed): `pnpm run typecheck && pnpm test && pnpm build` — 46 files / 564 tests, BOTH vitest projects must be read.
- GatedCell alone: `pnpm vitest run src/components/GatedCell.test.tsx` (9 cases).
- Ship check: `python3 ~/.config/opencode/skills/civitai-app-fleet/app_state.py model-benchmarking 0.4.6` (exit 0 = live) + the fleet skill's bundle grep — backtick tokens: `gated-retrying`, `cell-balance-unknown` expected NEW, `view-switch` as the always-present positive control.
- Real host (human): consent → Allow → the pressed cell advances itself to Confirm → Confirm spends exactly once; a run with an unreadable balance shows "could not be read" + Retry balance check, never "Insufficient Buzz balance"; the fresh output renders with "Awaiting rating" (#45), never "Hidden — rated mature".
