import { describe, expect, it } from 'vitest';

import pkg from '../package.json';
import { manifest, manifestBuzzBudgetPerGen, validateManifest } from './manifest.js';
import { DECLARED_SCOPES } from './scopes.js';

const DESCRIPTION = "Settle which setup actually wins. A grid is matchups down the side, prompts across the top, and every cell the same prompt run on a different setup. Build your own by picking the matchups and prompts you want in it, or read the community's — including a Top Grid the app keeps from the highest-voted matchups and prompts.\n\nSubmit a matchup — a checkpoint plus its weighted LoRA stack, up to eight configs in one entry — or submit a prompt with its generation settings and optional per-ecosystem overrides for SDXL, Pony, Flux and the rest. Matchups, prompts and grids all start private: keep yours to yourself while you work on it, then publish when it is ready. Votes rank what everyone sees, and published grids can be voted on too.\n\nRunning a cell spends your own Buzz. The app prices the run first and shows the exact cost, and Confirm stays disabled until that estimate comes back and fits your balance — nothing is charged until you press it. Reload mid-run and the cell comes back still generating, so you check on it rather than pay twice. The images it produces are added to the public benchmark grid, so every run you pay for fills a gap everyone else can read.\n\nMatchups and prompts you submitted stay yours: edit one in place as the board evolves, or remove it for good. Archiving is different — it hides an item from your own list while it stays on the board for everyone else.";

describe('block manifest', () => {
  it('validates as a full BlockManifest (page-app source augmented)', () => {
    const validated = validateManifest();
    expect(validated.blockId).toBe('model-benchmarking');
  });

  // 🔴 This assertion used to be a LITERAL (`toBe('0.1.2')`). The v0.1.3
  // design-system bump moved the manifest and left the literal behind, so `main`
  // went red on a version bump and STAYED red — every subsequent PR inherited a
  // failing build it had not caused. A permanently-red gate is worse than no
  // gate: it trains everyone to merge through it, and the next real defect
  // arrives looking exactly like this one.
  //
  // The literal also pinned nothing worth pinning. Nobody learns anything from
  // "the version is the version". The invariant that DOES matter is that the
  // manifest and the package agree — the store reads one, the build reads the
  // other, and a bump that touches only one is a real, shippable defect. That
  // cannot rot on a bump, and it still fires when someone bumps just one.
  it('keeps block.manifest.json and package.json versions in lockstep', () => {
    const validated = validateManifest();
    expect(validated.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(validated.version).toBe(pkg.version);
  });

  // 🔴 THIS GUARD EXISTS BECAUSE ITS ABSENCE SHIPPED AN INERT CHANGE. PR #32 added
  // the whole boot-skeleton mechanism — the pre-paint script, the dark-base inline
  // stylesheet, the skeleton markup, `paintTheme()` — and 23 tests covering all of
  // it, then merged WITHOUT this key. Every one of those tests passed, because they
  // each verify the mechanism works; none asserted the one line that turns it on.
  //
  // The key is not decoration. `bootSkeleton: true` is what makes the full-page run
  // host stand down its opaque veil; without it the host keeps covering the iframe
  // and the entire mechanism is dead code that nobody can see working or failing.
  // Its counterpart in index.html (the skeleton inside #root) is asserted by
  // src/bootSkeleton.test.tsx — the two must ship together, because the key over an
  // EMPTY #root is strictly worse than not opting in at all.
  it('opts into the boot skeleton, and the markup that entitles it to', () => {
    expect(manifest.bootSkeleton).toBe(true);
  });

  it('declares exactly the scopes the code depends on (in lockstep with scopes.ts)', () => {
    const declared = (manifest.scopes as string[]) ?? [];
    expect([...declared].sort()).toEqual([...DECLARED_SCOPES].sort());
  });


  // 🔴 THE STORE DESCRIPTION IS PINNED WHOLE, AND THAT IS DELIBERATE.
  //
  // 527 shipped a description advertising "a slider widens or narrows how many
  // rows and columns you see" — a control the same PR DELETED. The app pins its
  // absence (`gridsView.test.tsx`: "renders NO 'Show top N' control, and no such
  // copy, anywhere in the app"), but this field was asserted on by NOTHING, so
  // the false sentence sailed through five audit rounds. It was caught by the
  // sixth, reading the manifest rather than the code.
  //
  // WHY A WHOLE-STRING LITERAL, when the version assertion above exists BECAUSE
  // a literal rotted and left `main` permanently red: the two fields differ in
  // CHURN, which is the property that decides it. `version` moves every release
  // — pinning it guarantees a stale literal. `description` is MODERATOR-REVIEWED
  // (docs/matchups.md §6.2): changing it costs a review cycle, so it moves
  // rarely and only on purpose. Here a pin that forces a deliberate update is
  // the point, not the hazard.
  //
  // A KEYWORD guard was considered and rejected: the artifact under test is
  // PROSE, and a guard on words ("slider") is walkable by a reword that
  // re-implies the same dead affordance. Only the whole normalised string closes
  // that. The cost is real — a cosmetic reword now fails this test — and it is
  // the cost we want, because a cosmetic reword of this field is not cosmetic:
  // it is a moderator-reviewed change to what the store promises users.
  //
  // TO CHANGE THE COPY: edit block.manifest.json, paste the new string here, and
  // say in the PR that the listing needs re-review. Do not delete this test to
  // make it pass.
  it('pins the moderator-reviewed store description, so a deleted feature cannot stay advertised', () => {
    // 🔴 Read off the RAW manifest, not validateManifest(): the SDK's
    // `BlockManifestV1` does not declare `description` at all, even though the
    // platform's STORE renders it and moderators review it. So the typed
    // accessor cannot see this field, and `manifest` is
    // `Record<string, unknown>` — hence the runtime type assertion below, which
    // is not ceremony: it is what makes the `toBe` comparison meaningful rather
    // than an `unknown` that would fail `tsc` while the suite stayed green.
    const description = manifest.description;
    expect(typeof description).toBe('string');
    expect(description as string).toBe(DESCRIPTION);
    // The specific claim that failed: the per-viewer top-N slider is gone from
    // the app, so it must be gone from what the store promises.
    expect((description as string).toLowerCase()).not.toContain('slider');
  });

  it('exposes a page app with a per-gen buzz budget', () => {
    expect((manifest.page as { path: string }).path).toBe('/');
    expect(manifestBuzzBudgetPerGen()).toBe(1000);
  });
});
