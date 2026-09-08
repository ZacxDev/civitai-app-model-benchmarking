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
});
