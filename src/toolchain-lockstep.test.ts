import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * 🔴 A LOCAL SHELL AND CI THAT INSTALL DIFFERENT TOOLCHAINS MAKE A GREEN RUN
 * MEAN NOTHING.
 *
 * `flake.nix` is what a contributor's shell installs (`nix develop` / direnv);
 * `.github/workflows/ci.yml` is what the merge gate installs. When those two
 * disagree, "it passes locally" stops being evidence about the gate and the
 * gate stops being evidence about anyone's machine — and nothing announces the
 * split, because both sides stay green while testing different things.
 *
 * That is the state this repo was in when the flake landed. There was no flake
 * at all: CI hardcoded `node-version: 22` and installed with npm, README told
 * contributors "Requires Node 22+", and whatever node happened to be on a
 * given machine's PATH is what actually ran the tests. Nobody could reproduce
 * the gate's toolchain deliberately, so nobody could tell a real failure from
 * a version skew.
 *
 * The two pins are handled asymmetrically, on purpose:
 *
 *   node — ONE authority, `.nvmrc`. flake.nix reads it with `builtins.readFile`
 *          and CI reads it via `actions/setup-node`'s `node-version-file`.
 *          Neither restates a version, so neither can drift. What this file
 *          guards is that the arrangement is still WIRED THAT WAY: a future
 *          edit that hardcodes `node-version: 22` back into the workflow would
 *          reintroduce exactly the split described above, and nothing else
 *          would notice.
 *
 *   pnpm — TWO statements, because `pnpm/action-setup` reads only its own
 *          `version:` input or `package.json`'s `packageManager` field, and
 *          adding `packageManager` would change what the PLATFORM's builder
 *          does (`block.manifest.json`'s `buildCommand: pnpm run build` runs
 *          against that same file). So the major is written down twice and
 *          asserted equal here. This is the assertion that actually compares
 *          two values; the node ones assert a structure.
 *
 * Read off disk rather than imported: none of the three files is a module this
 * project can import (`.nvmrc` and `flake.nix` are not JSON, and `.github/` is
 * outside `tsconfig.json`'s `include`). `import.meta.url` makes the paths
 * independent of the working directory the runner happens to use.
 *
 * Every extractor below THROWS when the shape it expects is missing, rather
 * than returning undefined. A guard that silently passes once someone deletes
 * the step it inspects is worse than no guard: it reads as coverage while
 * providing none.
 */

function repoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

/**
 * The `with:` block belonging to one `- uses: <action>` step, as raw lines.
 *
 * Deliberately not a YAML parse: this repo ships no YAML dependency, and
 * adding one to read a 35-line workflow would be a bigger change than the
 * thing it verifies. The workflow is small and fully under this repo's
 * control, so a line scan bounded by the next list item at the step's own
 * indentation is sufficient — and it fails loudly if the step is gone.
 */
function stepBlock(workflow: string, actionPrefix: string): string[] {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) =>
    new RegExp(`^\\s*-\\s+uses:\\s*${actionPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(line),
  );
  if (start === -1) {
    throw new Error(`ci.yml has no \`- uses: ${actionPrefix}…\` step`);
  }
  const indent = lines[start].match(/^\s*/)![0].length;
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    // A new list item at the same indentation ends this step. Blank lines and
    // deeper-indented lines belong to it.
    if (line.trim() !== '' && new RegExp(`^\\s{${indent}}-\\s`).test(line)) break;
    block.push(line);
  }
  return block;
}

/** Every `key: value` at any depth inside a step block, as pairs. */
function settingsIn(block: string[]): Array<[string, string]> {
  return block
    .map((line) => line.match(/^\s*([A-Za-z][\w-]*):\s*(\S.*?)\s*$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => [m[1], m[2]] as [string, string]);
}

/**
 * The package manager CI actually INVOKES, read out of the workflow's commands.
 *
 * Not the presence of a `pnpm/action-setup` step: that says only what is
 * INSTALLED on the runner, and a workflow can install pnpm and then run npm.
 * Measured in this repo, not reasoned about — with the setup step left exactly
 * in place and the four `run:` lines switched to their npm equivalents, the
 * step-presence version of this check answered "pnpm" and all 5 assertions in
 * this file stayed green, for a CI job that never touches pnpm. That is the
 * precise split the assertion below is named for, reported as agreement.
 *
 * Comments are stripped first so a line of prose mentioning `npm ci` is not
 * mistaken for a step. Two or more distinct managers is not a package manager
 * the builder can match, so it throws rather than picking one — same rule as
 * every other extractor in this file: no silent answer for a shape this cannot
 * read.
 *
 * Matched anywhere in the stripped workflow rather than as a `- run:` list item
 * on purpose: the same step is written more than one way across these repos,
 * and a guard that goes red on a reformat is a guard people learn to merge
 * through.
 */
function ciPackageManager(workflow: string): string {
  const active = workflow.replace(/(^|\s)#.*$/gm, '$1');

  const invoked = new Set(
    [...active.matchAll(/\b(npm|pnpm|yarn|bun)\s+(?:install|ci|run|test|build|exec)\b/g)].map(
      (m) => m[1],
    ),
  );

  if (invoked.size === 0) {
    throw new Error(
      'ci.yml invokes no npm/pnpm/yarn/bun command — there is no CI package manager to compare against',
    );
  }
  if (invoked.size > 1) {
    throw new Error(
      `ci.yml invokes more than one package manager (${[...invoked].sort().join(', ')}) — ` +
        'the platform builder runs exactly one, so it cannot match all of them',
    );
  }

  return [...invoked][0];
}

describe('toolchain lockstep', () => {
  const workflow = repoFile('../.github/workflows/ci.yml');
  const flake = repoFile('../flake.nix');
  const nvmrc = repoFile('../.nvmrc');

  it('states the node major once, in .nvmrc, in the form the flake can consume', () => {
    // flake.nix interpolates this straight into the attribute name
    // `pkgs."nodejs_${nodeMajor}"`. A patch-level `.nvmrc` (`24.19.0`) names an
    // attribute nixpkgs does not have, so the shell dies on eval rather than
    // falling back — the failure is loud, but it is also entirely preventable
    // here, and `actions/setup-node` accepts a bare major just as happily.
    expect(nvmrc.trim()).toMatch(/^\d+$/);
  });

  it('has flake.nix read .nvmrc rather than restating the node version', () => {
    expect(flake).toContain('builtins.readFile ./.nvmrc');
  });

  it('has CI read .nvmrc rather than restating the node version', () => {
    const setupNode = settingsIn(stepBlock(workflow, 'actions/setup-node@'));
    const byKey = new Map(setupNode);

    expect(byKey.get('node-version-file')).toBe('.nvmrc');

    // The half that actually stops the drift. `node-version-file` being
    // present proves nothing on its own: `actions/setup-node` accepts BOTH
    // inputs and prefers the literal `node-version`, so a workflow carrying
    // both would read `.nvmrc` in this assertion's eyes and install something
    // else in reality — which is precisely the `node-version: 22` line this
    // repo shipped before the flake landed.
    expect(byKey.has('node-version')).toBe(false);
  });

  it('pins the same pnpm major in flake.nix and in CI', () => {
    const flakePin = flake.match(/^\s*pnpmMajor = "(\d+)";/m);
    if (!flakePin) {
      throw new Error('flake.nix has no `pnpmMajor = "<n>";` line to compare against');
    }

    const setupPnpm = new Map(settingsIn(stepBlock(workflow, 'pnpm/action-setup@')));
    const ciPin = setupPnpm.get('version');
    if (ciPin === undefined) {
      // Not a soft pass. `pnpm/action-setup` falls back to package.json's
      // `packageManager` when `version:` is absent — and this repo declares no
      // such field, so the step would fail at runtime. Either way the pins are
      // no longer comparable, which is the state this guard exists to catch.
      throw new Error('ci.yml pnpm/action-setup step declares no `version:` to compare against');
    }

    // Majors, not full versions: nixpkgs carries whatever patch it carries and
    // the action resolves the latest of the major. Pinning the patch here
    // would rot on a routine `nix flake update` and turn main red for nothing —
    // a permanently-red gate teaches everyone to merge through it.
    expect(ciPin).toBe(flakePin[1]);
  });

  it('keeps the platform builder on the same package manager as CI', () => {
    // `block.manifest.json`'s `buildCommand` is what the PLATFORM's builder
    // runs against the submitted bundle. CI being green says nothing about it:
    // `.github/` is not IN that bundle, so the merge gate never executes the
    // command this field names. A mismatch therefore hands the builder a tree
    // its package manager cannot install — one lockfile, the wrong tool — and
    // every signal this repo produces stays green while it happens.
    //
    // Not hypothetical: `generate-from-model` shipped exactly that state (a
    // pnpm repo whose manifest named no build command at all, so the builder
    // fell back to its legacy `npm run build` default against a tree with no
    // `package-lock.json`) and the only thing that caught it was
    // `civitai app validate` at submission time.
    //
    // BOTH sides are derived, and CI's side is derived from the commands the
    // workflow RUNS — not from the toolchain it installs. An earlier draft
    // hardcoded 'pnpm' for CI, and the draft after that read the presence of a
    // `pnpm/action-setup` step; both made this assertion's own name false,
    // because a workflow can install pnpm and then invoke npm, and neither
    // version could see it. A guard that reads as coverage while providing
    // none is worse than no guard at all.
    const manifest = JSON.parse(repoFile('../block.manifest.json')) as {
      buildCommand?: unknown;
    };
    if (typeof manifest.buildCommand !== 'string') {
      throw new Error('block.manifest.json has no string "buildCommand" to compare against');
    }

    const builderPackageManager = manifest.buildCommand.trim().split(/\s+/)[0];
    if (builderPackageManager === '') {
      throw new Error('block.manifest.json "buildCommand" is empty — no package manager to compare');
    }

    expect(builderPackageManager).toBe(ciPackageManager(workflow));
  });
});
