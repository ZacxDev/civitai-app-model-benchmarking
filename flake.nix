{
  description = "Model Benchmarking — a Civitai App Block. Dev shell: node + pnpm, pinned.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      # A public OSS mirror: contributors are not all on this workstation, and
      # a devShell costs nothing to *evaluate* for a system nobody builds on.
      # Only x86_64-linux is exercised in CI and locally — see CLAUDE.md.
      #
      # `x86_64-darwin` is absent on purpose: nixpkgs-unstable (26.11) dropped
      # it, so listing it would hand an Intel-Mac contributor a `throw` from
      # nixpkgs rather than a shell. Measured — every system below evaluates.
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system:
        f (import nixpkgs { inherit system; }));

      # =====================================================================
      # Toolchain pins
      #
      # Node has exactly ONE authority: `.nvmrc`, read here and consumed by CI
      # via `actions/setup-node`'s `node-version-file`. Restating the version
      # in this file is what lets the flake and CI drift, so it isn't restated.
      # A bare MAJOR is deliberate — a patch pin would drift the moment nixpkgs
      # moved `nodejs_24` under us, and neither consumer cares about the patch.
      #
      # pnpm cannot use that trick: `pnpm/action-setup` reads either its own
      # `version:` input or `package.json`'s `packageManager` field, and adding
      # `packageManager` here would change what the PLATFORM's own builder does
      # (`buildCommand: pnpm run build` runs against this same package.json), a
      # blast radius this repo's dev ergonomics do not justify. So the pnpm
      # major is stated in both places and `src/toolchain-lockstep.test.ts`
      # asserts the two agree — a red test rather than a silent divergence.
      # =====================================================================

      nodeMajor = nixpkgs.lib.trim (builtins.readFile ./.nvmrc);

      # 🔒 LOCKSTEP: `src/toolchain-lockstep.test.ts` parses this exact line and
      # requires it to equal the pnpm major installed by
      # `.github/workflows/ci.yml`. Change both, or neither.
      pnpmMajor = "11";

      toolchain = pkgs:
        let
          nodejs = pkgs."nodejs_${nodeMajor}";
        in
        {
          inherit nodejs;
          # `nodejs-slim`, not `nodejs`: pnpm's launcher only needs a runtime,
          # and nixpkgs warns when the full package is used here. The override
          # keeps pnpm's shebang node on the same major as the shell's node,
          # so `pnpm` and a bare `node` can never disagree about the runtime.
          pnpm = pkgs."pnpm_${pnpmMajor}".override {
            nodejs-slim = pkgs."nodejs-slim_${nodeMajor}";
          };
        };
    in
    {
      devShells = forAllSystems (pkgs:
        let tc = toolchain pkgs; in
        {
          default = pkgs.mkShell {
            packages = [ tc.nodejs tc.pnpm pkgs.git ];

            shellHook = ''
              echo "model-benchmarking: node $(node --version), pnpm $(pnpm --version)"
              echo "  pnpm install --frozen-lockfile   restore node_modules"
              echo "  pnpm run dev:harness             mock host on :5189"
              echo "  pnpm test && pnpm build          the gates CI runs"
            '';
          };
        });

      # Exposed so `nix run .#pnpm -- …` and `nix build` work without entering
      # the shell — handy for one-shot CI-equivalent runs from outside direnv.
      packages = forAllSystems (pkgs:
        let tc = toolchain pkgs; in
        {
          inherit (tc) nodejs pnpm;
          default = tc.pnpm;
        });
    };
}
