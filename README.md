# civitai-apps/starter — App Blocks v0 starter template

This directory is the source material for the `civitai-apps/starter` repo on
Forgejo. It is **not** consumed by Flux or any cluster automation — push the
files here to Forgejo as a template repo, and `blocks.submitApp` will clone
from it every time a new app is submitted.

## Bootstrap (one-time, after the Forgejo IngressRoute lands)

```bash
# 1. Set up Forgejo auth (admin token from SOPS forgejo-admin secret).
export FORGEJO_TOKEN=$(sops -d \
  /home/zach/workspace/civit/datapacket-talos/clusters/production/apps/forgejo/secrets/forgejo-admin.enc.yaml \
  | yq '.[] | select(.metadata.name=="forgejo-admin") | .stringData.password')

# 2. Create the starter repo via the Forgejo API (idempotent on 422).
curl -sS -X POST https://forgejo.civitaic.com/api/v1/orgs/civitai-apps/repos \
  -u "civitai-admin:$FORGEJO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "starter",
    "description": "Civitai App Blocks v0 starter template — used by blocks.submitApp",
    "private": true,
    "auto_init": false,
    "default_branch": "main",
    "template": true
  }'

# 3. Push the contents of this directory to it.
cd $(mktemp -d)
git init -b main
cp -r /home/zach/workspace/civit/datapacket-talos/claudedocs/app-blocks-starter-template/* .
git add .
git commit -m "initial starter"
git remote add origin "https://civitai-admin:$FORGEJO_TOKEN@forgejo.civitaic.com/civitai-apps/starter.git"
git push -u origin main

# 4. Mark as template via the API (auto_template doesn't always stick at create-time).
curl -sS -X PATCH https://forgejo.civitaic.com/api/v1/repos/civitai-apps/starter \
  -u "civitai-admin:$FORGEJO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "template": true }'
```

## What's in the template

- `block.manifest.json` — minimal valid manifest. The webhook handler
  validates it against `BlockManifestValidator`; any field outside the
  v0 contract is rejected at the build gate.
- `package.json` — pinned SDK + dev tooling versions.
- `pnpm-lock.yaml` — committed so `pnpm install --frozen-lockfile` is
  reproducible.
- `vite.config.ts` — base `/`, build to `dist/`, no external dependencies.
- `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx` — minimum
  React 19 + TS stub.
- `nginx.conf` — serves `dist/` + a `/healthz` endpoint for the K8s
  probes. CSP `frame-ancestors` locked to civitai.com / www.civitai.com /
  civitaic.com.
- `Dockerfile` — multi-stage: pnpm build → nginx:1.27-alpine + assets.

## Substitution markers

The starter intentionally leaves `<slug>` as a literal in `block.manifest.json`
(blockId, iframe.src). The webhook validates that `blockId === <repo-slug>`
and `iframe.src === https://<slug>.apps.civitaic.com/`, so the developer
**must** rename both before pushing. The Forgejo repo description shown in
`blocks.submitApp` mentions this step.

## Updating the starter

Push a new commit to `civitai-apps/starter` on Forgejo (or `main` here +
manually push). Newly submitted apps get the latest content; existing apps
are unaffected (their content is independent).

## Open dependency: SDK packages not on npm

`package.json` declares `@civitai/app-sdk@0.5.0` and
`@civitai/blocks-react@0.3.0` but those are currently **vendored as tgz**
inside `civitai-block-generate-from-model/vendor/` (per SKILL.md gotcha #12).
Until they're published to a registry Tekton can reach, `pnpm install` in
the Tekton build task fails with `ENOTFOUND` / `404` for those scopes.

Three v0 options to unblock:

1. **Publish to npm** — fastest if the team is OK with public packages
   under the `@civitai/*` scope. Requires npm publish creds in
   civitai-app-starters CI.
2. **Private registry** — stand up Verdaccio in-cluster on dp-1, point
   pnpm at it via a `.npmrc` mounted in the build task workspace.
   ~1 day of work; W2-v1 nice-to-have.
3. **Vendor in-repo at first push** — for v0 starter clones, copy the
   `.tgz` from the existing hackathon block into the new repo's
   `vendor/` and set `package.json` deps to `file:./vendor/...`.
   Lowest-friction but every app has to update tgz manually on SDK
   bumps. Acceptable for civitai-team-only v0.

Until one of these lands, **`blocks.submitApp` will create the repo but
the first push will fail at the Tekton build step**. The Forgejo commit
status surfaces this clearly. Track in W2-v1 alongside the rest of the
external-developer polish.

The Phase 7 hackathon migration (`generate-from-model`) does NOT hit this
because its repo already vendors the tgz files in `vendor/`. The starter
just needs the same treatment before any non-vendoring app submits.

## Initial `pnpm-lock.yaml`

Run `pnpm install` once locally (with vendored tgz copied in if you've
gone option 3) and commit the resulting `pnpm-lock.yaml` before pushing
the starter to Forgejo — Tekton uses `--frozen-lockfile` so the absence
of a lock file is a build failure, not a slow first install.
