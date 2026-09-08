# Matchups — design spec

**Status:** design only. Nothing here is built. This document exists so that the
irreversible parts of the rework — a rename that reaches two other repos, and a
submit boundary that writes user data into a world-readable store with no
delete-for-owner — are decided before code, not during it.

**Scope:** the six-bullet ask recorded on clawgate **423**, plus the two
sub-features of bullet 2 that are blocked on platform work (**421** comments,
**422** owner moderation).

> 🔴 **AMENDED 2026-09-07 by clawgate 527 — read §11 before acting on §3, §4, §6 or §9.**
> Operator feedback reshaped the rework around **three publishable objects** —
> Matchups, Prompts and **Grids** — where a Grid is a named, hand-picked set of
> matchups × prompts that you build privately and publish. The amendments, all in
> **§11**:
>
> - **§9 question 3 is REVERSED** — the public half of bullet 1 (now called a
>   **Grid**) is back in scope, with a fourth row kind on the shared board.
> - **§6.2's census is STALE** — it says "22 testids, complete"; the count is now
>   **24**. §11.4 lists the two additions and the exact old→new map.
> - **§4's draft/submit boundary is RETAINED but RENAMED** — "draft" disappears as a
>   user-facing word; the same store boundary becomes **unpublished → Publish**, and
>   it now covers prompts and grids too.
> - **Archive** is added: an author-side hide that is **not** suppression.
> - Cards **450, 452 and 455 are superseded by 527**. §11.6 records what of each
>   survived and what was already shipped.
>
> Where §11 and an earlier section disagree, **§11 wins** — the earlier text is kept
> so the decision can be read against what it replaced.

> **On "seven bullets".** Card 423's criterion 1 says "each of the seven bullets";
> the Context lists **six**. The reconciliation used here: bullet 2 bundles three
> separable features (details page, comments, prompt-in-matchup voting), and the two
> blocked ones are tracked separately throughout the card. This spec therefore
> answers **eight** rows in §3 — the six ask-bullets, with bullet 2 split into its
> three parts — which covers the seven reading and the six reading both. No bullet
> is dropped.

---

## 1. How to re-verify this document

Every measurement below is dated and reproducible. **A design that cites a
platform surface is only as good as its last re-measure**, and this card has
already been wrong about the SDK version once (Context enumerated 0.37; `main`
pinned 0.43).

```bash
# The SDK surface this spec is written against.
npm view @civitai/blocks-react version          # 0.44.2 on 2026-08-30
npm pack @civitai/blocks-react@0.44.2 && tar xzf civitai-blocks-react-0.44.2.tgz
$PAGER package/dist/hooks/useSharedStorage.d.ts  # the whole shared contract
$PAGER package/dist/hooks/useAppStorage.d.ts     # the whole per-viewer contract
```

**Measured 2026-08-30 — the version drift did NOT move this design.**
`package.json` pins `^0.43.0` (lockfile resolves 0.43.0); published latest is
**0.44.2**. `useSharedStorage.d.ts` and `useAppStorage.d.ts` are **byte-identical**
between 0.43.0 and 0.44.2 (`diff -q` → identical). The only public-surface change
across those four releases is `WorkflowSubmitError` / `WorkflowSubmitErrorCode`
added to the `useBuzzWorkflow` export — nothing storage-related.

So: **the blocked bullets are still blocked at the newest published SDK.** There is
no `comment*` primitive, no owner-set visibility, and `update`/`withdraw` remain
author-scoped. That was checked by reading the two `.d.ts` files end to end, not by
grepping for the word — a `grep` for `comment`/`visibility`/`moderat` over `dist`
returns non-zero hits that are all prose in doc-comments and a `visibility:` CSS
property inside the bundled theme blob.

---

## 2. The substrate, as measured

Two stores, and the design is almost entirely determined by four properties of them.

### 2.1 `useAppStorage` — the per-viewer KV

Per **(block instance, viewer)**. `get` / `set` / `delete` / `list({prefix,limit,cursor})`
/ `getQuota()`. **64 KB per value; 50 MB and ~1M rows per app**, host-enforced.
Anonymous viewers get a null read path and a hard write reject.

The app **chooses these keys**, so `list({prefix})` genuinely works here — the app
already relies on that for `inflight:v1:` (`src/App.tsx:147`, `:313`).

### 2.2 `useSharedStorage` — the app-scoped public board

`list({prefix,limit,cursor})` newest-first · `get(key)` · `getCount`/`getCounts` ·
`append(value) → {key}` · `update(key,value)` · `vote`/`unvote` · `withdraw(key)` ·
`report(key,reason?)`.

Records are `{title, body?, data?}` plus `authorUserId`, `count`, `viewerVoted`,
`createdAt`, `updatedAt`. **`title`/`body` go through the host content belt;
`data` is explicitly unmoderated.**

### 2.3 The four constraints that shape everything

**C1 — Shared keys are host-minted, so the shared `prefix` filter is unusable.**
`append()` *resolves* the key; the app never supplies one (`src/App.tsx:460`, `:474`,
`:581`). Every shared key is an opaque host id. Consequently `shared.list({prefix})`
can never separate matchups from prompts from results, and the app does not pass
`prefix` at all (`src/App.tsx:932`).

> 🔴 **Card 423's criterion 5 assumes this filter is available** ("given `list` is
> cursor-paginated newest-first with a `prefix` filter"). It is available on the
> *per-viewer* store and unusable on the *shared* one. §7 is written against the
> corrected premise.

**C2 — One flat shared list, discriminated in the unmoderated blob.**
`data.kind ∈ {'combination','prompt','result'}` (`src/types.ts:10-11`). There is no
platform notion of any of these; the whole benchmark is app-owned.

**C3 — Reading "everything" is capped at 2000 rows.** `listAll()` pages the whole
list at `LIST_PAGE = 50` × `MAX_PAGES = 40` (`src/App.tsx:136-137`, `:927-939`).
Beyond that the tail is silently dropped, **oldest-first**, because the list is
newest-first.

**C4 — `result` rows dominate row growth.** One `result` row is appended per
(config × prompt) cell published (`src/App.tsx:581`). Today the board holds roughly
**2 matchups + 4 prompts + 16 results = 22 rows** (measured 2026-08-29). Filling one
4×4 grid costs 16 rows; the two vote-able kinds grow by ones.

**C3 + C4 together are the single most important fact in this document**, and §7
is mostly about them.

---

## 3. Criterion 1 — every bullet, its store, its paths, its blocker

| # | Bullet | Store | Read path | Write path | Blocked? |
|---|---|---|---|---|---|
| 1 | Matchup **collections** — create, manage, publish/private, discover, view each one's grid | `appStorage` while private → `shared` on publish | private: `appStorage.list({prefix:'coll:v1:'})` + `get`; public: `listAll()` filtered on `data.kind==='collection'` | private: `appStorage.set('coll:v1:<localId>', …)`; public: `shared.append({title, body, data:{kind:'collection', memberKeys[]}})` | **No** |
| 2a | Matchup **details page** (the grid, each prompt against its grid item) | `shared` | `shared.get(<matchupKey>)` for the matchup itself + `listAll()` for its `result` rows | none (read-only view) | **No** |
| 2b | **Comments** on a matchup | — | — | — | 🔴 **YES → 421** |
| 2c | **Prompt-in-matchup voting**, disable-able, owner-moderated | `shared` (new row kind) for the vote; owner moderation itself is blocked | `listAll()` filtered on `data.kind==='pairvote'`; `count`/`viewerVoted` per row | `shared.append({data:{kind:'pairvote', matchupKey, promptKey}})` then `shared.vote(thatKey)` | **Partly** — the *voting* is buildable; **owner moderation of it is 🔴 422** |
| 3 | **Grid becomes the default view**, showing most-popular matchups/prompts, with discovery linking into 2a | `shared` | `listAll()`, ranked client-side by `count` (§7) | none | **No** (but see §7 — the ranking is capped) |
| 4 | **Create without submitting**; submit is an optional second step | `appStorage` → `shared` | `appStorage.list({prefix:'draft:v1:'})` | `appStorage.set('draft:v1:<localId>', …)`; submit = `shared.append(...)` (§4) | **No** |
| 5 | **Rename** combinations → **Matchups** | n/a — presentation + testids | n/a | n/a | **No** (but reaches two other repos — §6) |
| 6 | **Watch** a matchup → a "watched" tab, individual and composite | `appStorage` only | `appStorage.get('watch:v1')` → `string[]` of matchup keys | `appStorage.set('watch:v1', keys)` | **No** |

**Decisions that narrow this table (§9, 2026-08-30):** row **1**'s *public* half —
appending a `kind:'collection'` row to the shared board — is **deferred**; v1 ships
the private half only. Row **4** is built as create → explicit submit → *edit only*:
there is no unsubmit, so the only arrow out of `shared` is `update`, never
`withdraw`.

**Why 1 and 4 both start in `appStorage`:** it is the only store in the platform
with a real per-viewer boundary. A `visibility:"private"` field inside `data` is
**cosmetic** — the row is world-readable the instant it is appended, and `data` is
not even moderated. Privacy here is *which store the row is in*, nothing else.

**Why 6 needs no shared write at all:** a watch-list is per-viewer state by
definition. It is the cheapest bullet on the card and has no blocker.

---

## 4. Criterion 2 — the submit boundary

**Submit is the copy from `appStorage` into `shared`.** It is the moment the record
becomes public, and it is the only such moment. Stated precisely:

**What is copied.** `shared.append({ title, body, data })` where `title` is the
matchup name, `body` is its description, and `data` is
`{ v: 2, kind: 'combination', configs: ModelConfig[] }` exactly as
`buildCombinationPayload` produces today. **All user-visible text must go in
`title`/`body`** — those are the moderated fields. Nothing user-authored may be
smuggled into `data` to dodge the content belt; `data` carries structure only.

**What happens to the private copy.** The draft is **kept**, rewritten to
`{ localId, sharedKey, submittedAt }`. Deleting it would throw away the only
per-viewer handle on the row — shared keys are host-minted (**C1**) and the shared
list carries no "mine" index, so a viewer who loses the pointer has no way to ask
for their own rows. Cost is one small `appStorage` row against the host-reported
budget (read it from `getQuota()`; the "50 MB / ~1M rows" figures in this document
are the documented v0 ceilings, not something an app may hard-code).

> ⚠️ This paragraph previously also justified retention by an unsubmit being able
> to restore a working draft. **Unsubmit was declined (§9 Q2, 2026-08-30)**, so that
> half no longer applies; the per-viewer handle is the whole reason.

**What a user can undo.**

- **Edit after submit: yes.** `shared.update(key, value)` is author-scoped and
  preserves the key and the vote total. Editing a live matchup is safe and cheap.
- 🔴 **Unsubmit: NOT OFFERED. Decided 2026-08-30 (§9 Q2) — edit-only.** It is
  mechanically possible (`shared.withdraw(key)` is author-scoped and available) and
  it is deliberately not built, because it is not a clean inverse. The three
  measured consequences below are the *evidence for that decision*, and they are
  retained here rather than deleted: they are what makes the answer stick.
  1. **The vote total is destroyed.** `count` lives on the row; the row is gone.
     Re-submitting mints a *new* host key and starts at zero.
  2. 🔴 **Every `result` row that other viewers paid Buzz for is orphaned, and the
     matchup owner cannot clean them up.** `result` rows key on `comboKey`
     (`src/types.ts` `ResultData`), the app's withdraw path calls
     `shared.withdraw(key)` and nothing else (`src/App.tsx:447-451`), and those rows
     belong to *whoever ran the cell* — so `withdraw` on them returns `FORBIDDEN`
     for the matchup owner. The orphans are **structurally unremovable by anyone but
     each original runner**. This is the same author-scoping gap as **422**, reached
     from a different direction, and it is a reason to make unsubmit a deliberate,
     warned action rather than a toggle.
  3. **Anyone else's contributions are unaffected**, which is the point of 422.

**UI consequence, as decided:** there is **no unsubmit control and no
destructive-confirm for one** — that was the recommendation and it was declined.
There is no make-private for a submitted row either. Submit is therefore the
irreversible step in this app, and the only thing an author can do to a live row is
**edit it** via `shared.update`, which keeps its key and its votes.

---

## 5. Criterion 4 — voting scope

The ask leaves four questions open. Proposed answers, each with its reason:

**Who may vote on a public matchup?** **Any authenticated viewer, including the
owner.** Rationale: the platform already enforces the only boundary that matters —
`vote` rejects anonymous viewers, and it is idempotent at one vote per viewer.
Excluding owners would need an `authorUserId === viewer.id` check the app can do,
but it buys little (self-voting is +1 in a public tally) and costs a special case in
every vote surface. **Decide explicitly rather than inherit**: if the operator wants
non-owners-only, it is a two-line filter, but say so now.

**What does one vote MEAN?** Today, and unchanged: **"this belongs in the grid."** A
vote on a matchup promotes its configs to grid *rows*; a vote on a prompt promotes it
to a *column*. It is emphatically **not** "this output is good" — there is no vote on
a result row today and this spec does not add one. The distinction matters because
2c introduces a *second* vote axis, and the two must not read as the same gesture:
2c's `pairvote` means **"this prompt is a good test of this matchup"**, which is a
statement about the *pairing*, not about either side alone or about the image.

**Do ad-hoc prompts differ from registered ones?** **Yes, and the difference is
eligibility, not mechanics.** A *registered* prompt is a `kind:'prompt'` row on the
shared board and is votable globally. An *ad-hoc* prompt exists only inside one
matchup's details page. Proposal: **an ad-hoc prompt is a `pairvote` row whose
`promptKey` is null and which carries its own text in `title`** — so it is moderated
like any other user text, it is votable *within that matchup only*, and it never
pollutes the global prompt ranking. Promotion from ad-hoc to registered is a
separate, explicit action (append a `kind:'prompt'` row), never automatic.

**What does "disable voting" do to votes already cast?** **It hides the control and
freezes the tally; it does not delete anything.** The app cannot delete other
viewers' votes — `unvote` acts only on the calling viewer. So "disabled" is a flag
in the matchup's `data` that suppresses the vote buttons and stops counting, and
re-enabling restores the previous tally intact. 🔴 **State the limit honestly in the
UI: this is a display setting, not an enforcement one.** The underlying rows remain
votable by any client that talks to the host directly, because the flag lives in the
app's unmoderated `data` blob and the host knows nothing about it. That is the same
class of non-boundary as a `visibility` field, and it is why 422 exists.

---

## 6. Criterion 3 — the rename inventory

**Enumerated, not sampled.** Every figure below was produced mechanically; the
commands are given so the inventory can be re-derived rather than trusted.

### 6.1 The one thing that must NOT be renamed

🔴 **`data.kind: 'combination'` is a persisted wire value, not a label.** It
discriminates every row already on the shared board (`src/types.ts:10-11`).
Changing it is a **data migration** that would make every existing matchup
unparseable, and there is no backfill path — the app cannot rewrite other authors'
rows (`update` is author-scoped). **The wire value stays `'combination'` forever.**
The same applies to the `v: 2` / `v: 3` payload versions and to `ResultData.comboKey`.

This is the single highest-risk item in the rename and it is invisible in a
find-and-replace: the string `'combination'` appears in both renameable and
un-renameable positions in the same files.

### 6.2 In this repo

```bash
# per-file census
find . -type f ! -path '*/node_modules/*' ! -path '*/.git/*' -print0 \
  | xargs -0 grep -ciE 'combinations?|combos?' | grep -v ':0$'
```

**30 files** carry at least one occurrence. Breakdown of what must change:

**Rename-affected `data-testid`s in production source — 22, complete:**

`combination-form` · `combo-cancel` · `combo-card` · `combo-config-count` ·
`combo-config-summary` · `combo-description` · `combo-edit` · `combo-errors` ·
`combo-included` · `combo-name` · `combo-submit` · `combo-vote` · `combo-withdraw` ·
`combos-empty` · `combos-error` · `combos-included-summary` · `combos-list` ·
`combos-loading` · `combos-view` · `grid-empty-add-combination` · `grid-group-combo` ·
`submit-combination`

```bash
find src -name '*.tsx' -o -name '*.ts' | grep -v test \
  | xargs grep -ho 'data-testid="[^"]*"' | grep -iE 'combo|combination' | sort -u
```

**User-visible strings** (the moderated / rendered surface):
`src/components/CombosView.tsx:52,68,75,76` · `CombinationForm.tsx:36,118,269` ·
`ResultsGrid.tsx:80,82` · `App.tsx:132,767,835,886` · `lib/benchmark.ts:121`.

**Files whose NAME encodes the old word:** `src/components/CombosView.tsx`,
`src/components/CombinationForm.tsx`, and their `.test.tsx` siblings.

🔴 **`block.manifest.json` is moderator-reviewed, so touching it costs a review
cycle.** Two fields carry the word: the store `description` (line 7) and the
`apps:storage:shared:write` **scope justification** (line 22) — the latter is shown
to viewers in the consent prompt. Renaming there is correct but must be batched
into a version bump that is going to review anyway, never shipped alone.

**False positive to exclude:** `LICENSE:80` — "by combination of their
Contribution(s)" is Apache-2.0 boilerplate.

### 6.3 External consumers — the card names one; there are **four**

All four live in **`datapacket-talos`** (private), verified at `origin/trunk`.

**(a) The capture recipe** —
`datapacket-talos:.claude/skills/app-capture/scripts/recipes/model-benchmarking.json`.
The card names its `view-switch` testid and positional tabs. It also pins, and the
card does not name:

- three **`waitForText` anchors**, each verified against a real source line:
  - `"Submit and vote on checkpoint"` → `src/components/CombosView.tsx:52`
  - `"Submit and vote on prompts"` → `src/components/PromptsView.tsx:51`
  - 🔴 **`"Included combinations"` → `src/App.tsx:835` — this anchor *contains the
    renamed word* and breaks with certainty.**
- `waitForGone: "How this works"` → rendered at `src/App.tsx:757` (survives a
  rename; unrelated copy)
- three **state names** `combinations` / `prompts` / `grid`, which become capture
  filenames
- two of three **captions** contain "combinations"

**(b) The talos-infra gate suite hardcodes two of this app's testids.**
`tests/run-tests-app-capture.sh:3843-3844` cuts its DOM fixture on
`data-testid="combo-card"` and `data-testid="submit-combination"`. **A rename reds
that suite** — in the repo whose pre-push hook is the primary merge gate.

**(c) The DOM fixture** `tests/fixtures/app-capture/evidence/mb-combos.dom.json`
carries **9 rename-affected testids** of the 12 it holds: `combo-card`,
`combo-config-count`, `combo-config-summary`, `combo-edit`, `combo-included`,
`combos-list`, `combos-view`, `combo-vote`, `submit-combination`.

> Method note, because it nearly produced a wrong "no coupling" line here: the
> fixture is JSON, so its attributes are escaped as `data-testid=\"…\"`. A grep for
> `"combo…"` returns **zero** against a file that is in fact fully coupled. The
> enumeration above used `grep -oE 'data-testid=\\"[^\\]*'` and was confirmed with a
> positive control (`grep -c testid` → 12) before being believed.

**(d) The mutation suite** `tests/mutants-app-capture.sh:1264-1265` pins the recipe
**state name** `"name": "combinations"` in a `sed` address. A state rename silently
makes that mutant a no-op — it would report SURVIVED for a reason unrelated to the
thing under test.

**(e) The live store listing captions** (checked 2026-08-30 via
`civitai app listing status --slug model-benchmarking`). One of the three currently
live contains the word: *"Vote on checkpoint + LoRA combinations — the top ones
become the grid's rows."* Changing a caption is a **listing revision**, i.e. another
moderator review.

### 6.4 🔴 The finding that is bigger than the rename

**Bullets 3 and 6 break the capture recipe even if nothing is renamed at all.**

The recipe's own `_selectors` note says it: the three tabs *have no individual
testid*, they are `role=tab` children selected by
`[data-testid='view-switch'] > button:nth-of-type(1|2|3)`, and they **"will move if
a tab is added or reordered."** Bullet 3 *reorders* them (grid becomes default) and
bullet 6 *adds* one (watched). Either one silently re-points all three selectors at
the wrong panels.

**Recommendation, and it is cheap: give every tab its own `data-testid` as the first
build card, before any of the rework lands.** It converts a positional coupling into
a named one, and it is the only change here that makes the other six bullets *safer*
to build rather than riskier.

---

## 7. Criterion 5 — discovery ranking and paging

### 7.1 The ordering input

`count` from the shared list is **the only aggregate the platform exposes**. There
is no server-side sort, no "top N", and (per **C1**) no way to ask for only the rows
of one kind. So "most popular" means: page the list, filter on `data.kind`
client-side, sort by `count` descending. That is what the app does today, and it is
the only thing it *can* do.

Deterministic tie-break: `count` desc, then `createdAt` asc (older wins a tie), then
`key` — so the order is stable across reloads and across viewers.

### 7.2 🔴 The ranking is capped, and the cap truncates exactly the wrong end

This is the finding the build plan is organised around.

`listAll()` reads at most `LIST_PAGE × MAX_PAGES = 50 × 40 = **2000 rows**`, and the
list is **newest-first**. So once the board exceeds 2000 rows, the rows that fall off
are the **oldest** — and the oldest matchups are the ones that have had the longest
to accumulate votes. **The truncation removes the top of the very ranking it feeds.**
Nothing errors; the leaderboard just quietly loses its leaders.

Per **C4**, growth is dominated by `result` rows: one per published cell, 16 for a
single 4×4 grid, against matchups and prompts that grow by ones. At today's ~22 rows
this is comfortable. **The design must state where it stops being comfortable, and
it is not far**: ~124 filled 4×4 grids reaches 2000 rows, and every one of those
rows must be transferred and parsed on **every load** to rank anything.

### 7.3 What this spec proposes

**Near term (build it this way):** rank client-side over `listAll()`, and add a
**visible, honest ceiling** rather than a silent one. Concretely:

1. Detect truncation instead of hiding it — if the `MAX_PAGES` loop exits with a
   `nextCursor` still in hand, the read was incomplete. Today that condition is
   discarded (`src/App.tsx:931-938`).
2. When truncated, **say so in the discovery UI** ("showing the most recent 2000
   contributions") rather than presenting a leaderboard that is quietly wrong.
3. Use `shared.get(key)` — not paging — for the details page and for any
   `?m=<key>` deep link. It resolves one row directly and is the correct primitive
   for a shareable matchup URL. This is also what keeps the details page working for
   a matchup that has already fallen past the paging window.

**Do not** raise `MAX_PAGES`. It trades a silent wrong answer for a slow one; the
transfer is linear in board size and happens on every load.

**Medium term — this needs platform work, and it is a genuinely new gap.** None of
the three things that would fix it exist today: app-chosen key prefixes (so `list`
could return only matchups), a `kind`/filter argument on `list`, or a server-side
"top N by count". This is a sibling of 421/422 rather than something in-block code
can close. See card **D** in §8 for its closing condition.

### 7.4 Cohort honesty

Per the card's own assumption, and it is worth writing into the design: the block is
**mod-gated**, and the board holds **2 matchups / 4 prompts / 16 results** (measured
2026-08-29). Discovery is being designed for a cohort of a few users. The correct
consequence is *not* to build ranking infrastructure for scale that does not exist —
it is to build the simple client-side ranking, and to **know the number at which it
breaks** (§7.2) so nobody is surprised by it.

---

## 8. Criterion 6 — the build plan

Each card is independently shippable and independently reviewable. Ordering is a
recommendation, not a dependency chain, except where stated.

| Card | What it does | Depends on | Blocked? |
|---|---|---|---|
| **A** | **Give every view-switch tab its own `data-testid`**, and update the capture recipe in `datapacket-talos` in the same pass | — | No |
| **B** | **Watch list** — `appStorage` `watch:v1`, a "Watched" tab, individual + composite view | A (adds a tab) | No |
| **C** | **Draft matchups** — `appStorage` `draft:v1:`, create-without-submit, submit as an explicit second step, edit-a-live-row via `shared.update` (§4). **No unsubmit** — §9 Q2, decided 2026-08-30 | — | No |
| **D** | **Discovery + grid-as-default** — client-side ranking, visible truncation notice, `get()`-based deep links | A (reorders tabs) | No — but carries the §7.2 ceiling |
| **E** | **Details page** — `shared.get(key)`, the grid with each prompt against its item, `report()` as the abuse path | A, D | No |
| **F** | **Prompt-in-matchup voting** — the `pairvote` row kind, ad-hoc vs registered prompts (§5) | E | No |
| **G** | **The rename** — all of §6, in one pass across three repos, batched with a manifest version bump and a listing revision | A–F landed (rename last, so it moves a settled surface once) | No |
| **H** | **Comments** | — | 🔴 **421** |
| **I** | **Owner moderation of public matchups** (incl. the orphaned-result case in §4) | — | 🔴 **422** |
| **J** | **Platform: a way to read a subset of the shared board without paging all of it** | — | 🔴 **new — see below** |

**Why the rename is last (G):** it touches two other repos and two moderator-reviewed
surfaces. Doing it first means every subsequent card re-touches the same external
consumers; doing it last means one coordinated pass over a surface that has stopped
moving.

**Card J's closing condition,** since a card without one should not be filed: *the
SDK exposes either app-chosen shared keys, a `kind`/filter parameter on
`shared.list`, or a server-ranked "top N by count" — verified by reading the
published `@civitai/blocks-react` type surface, and by this app dropping its
`listAll()` full-board page for the discovery view.* Until one of those exists, §7.3
is the ceiling and it is a known one.

**Cards A–G have no blocker and are buildable against the SDK as published today
(0.44.2, verified §1).**

---

## 9. Questions for the operator — three DECIDED, one still open

Each question is kept with its original recommendation so the decision can be read
against what was proposed. **Questions 1–3 were answered by the operator on
2026-08-30**; do not re-open them without a new decision recorded here.

1. **Owner self-voting** (§5) — *recommended:* allow.
   ✅ **DECIDED 2026-08-30 — ALLOW, including the owner.** As recommended: the
   platform already enforces the only boundary that matters (`vote` rejects
   anonymous viewers and is idempotent at one vote per viewer), and excluding
   owners would cost an `authorUserId === viewer.id` special case in every vote
   surface to prevent a +1 in a public tally. Gates card **F**, not card **C**.

2. **Is "unsubmit" offered at all?** — *recommended:* offer it with a
   destructive-confirm.
   ✅ **DECIDED 2026-08-30 — NO UNSUBMIT. EDIT-ONLY.** The recommendation was
   **declined**, with §4.2's consequences in front of the decision: withdrawing a
   matchup destroys its vote total *and* orphans every `result` row other viewers
   spent Buzz on, and those rows are structurally unremovable by anyone but each
   original runner (`withdraw` returns `FORBIDDEN` for the matchup owner). Declining
   unsubmit means the app never mints such an orphan in the first place.
   **Consequences, now binding:**
   - `shared.update` — author-scoped, and it preserves both the host-minted key and
     the vote total — is the **only** post-submit mutation path the app offers.
   - There is **no make-private for a submitted row**, and there is no un-submit
     either. Submitting is the irreversible step, and the UI must read that way.
   - The draft is still **retained** after submit as `{localId, sharedKey,
     submittedAt}`. §4 justified retention partly by an unsubmit restoring a working
     draft; that half no longer applies. The surviving reason is the load-bearing
     one: the draft is the **only per-viewer handle on the row**, since shared keys
     are host-minted and the shared list has no "mine" index.
   - Card **C**'s acceptance criterion 5 (a warned unsubmit) is **struck**. That card
     is six criteria — 1, 2, 3, 4, 6, 7 — not seven.

3. **Does "collection" (bullet 1) ship public at all in v1?** — *recommended:*
   private-only.
   ✅ **DECIDED 2026-08-30 — PRIVATE-ONLY in v1.** As recommended. The private half
   of bullet 1 (`appStorage`, `coll:v1:`) is in scope; the public half — a fourth
   row kind on a board already carrying the §7.2 ceiling — is **deferred**, not
   cancelled, and would need this question re-answered.

4. **Card J** — worth filing as a platform ask now, or leave the ceiling documented
   and revisit when the board approaches it? **Still open.**

---

## 10. Corrections to card 423

Recorded here because the card is the input to this spec and two of its premises did
not survive measurement.

1. 🔴 **Criterion 5's premise is wrong.** The shared `list` *has* a `prefix`
   parameter, but shared keys are **host-minted**, so the app can never place rows
   under a prefix it controls. Prefix filtering works on `appStorage` only. §7 is
   written against the corrected premise (**C1**).
2. 🔴 **Criterion 3's external-consumer list is incomplete.** It names the capture
   recipe. There are **four** consumers in `datapacket-talos` — the recipe, the gate
   suite (which hardcodes two testids), the DOM fixture (9 of 12), and the mutation
   suite (which pins a state name) — plus the live listing captions. §6.3.
3. **The SDK moved again, and this time it did not matter.** Context enumerated
   0.37, its comment corrected to 0.43, published latest is now **0.44.2**. Both
   storage hooks are byte-identical 0.43.0 → 0.44.2, so the storage model and both
   blocked bullets are unchanged. §1.
4. **A finding neither the card nor the ask names:** bullets 3 and 6 break the
   capture recipe's positional tab selectors **without any rename at all**. §6.4.

---

## 11. Amendment — three publishable objects (clawgate 527, 2026-09-07)

Operator feedback on 2026-09-07 reshaped the rework. This section is the decision
record; where it disagrees with §3–§9, **§11 wins**.

### 11.1 The three objects, and the one boundary they share

**Matchups**, **Prompts** and **Grids**. Each is created privately, then **published**
in one irreversible step, and each gets **My** and **Community** sub-tabs.

There is exactly **one** privacy mechanism and §2.3's constraints still bind it:
**which store the row is in.** Private = `useAppStorage` (per-viewer, app-chosen
keys, anonymous writes rejected). Public = `useSharedStorage.append` (world-readable
the instant it lands, `data` not even moderated). There is no `visibility` field, and
adding one to `data` would be **cosmetic** — §3's warning is unchanged and is now
load-bearing for two more object types.

**"Draft" disappears as a user-facing word.** §4's boundary is retained exactly;
only the vocabulary and the placement change. An unpublished item now sits in its
object's **My** tab carrying a **Publish** action, instead of in a separate Drafts
panel.

🔴 **The `draft:v1:` appStorage prefix does NOT change.** Real viewers hold records
under it today; renaming the prefix orphans them, and the app cannot migrate another
viewer's per-viewer KV. It keeps its historical name forever. New prefixes are
chosen disjoint from it so `list({prefix})` still narrows cleanly:

| object | unpublished prefix | note |
|---|---|---|
| Matchup | `draft:v1:` | **historical name, do not "tidy"** — live viewer records |
| Prompt  | `unpub:prompt:v1:` | new |
| Grid    | `unpub:grid:v1:` | new |

Publishing is `shared.append`, and §9 question 2 still binds: **there is no
unpublish.** `shared.update` (author-scoped, preserves key and vote total) remains
the only post-publish mutation. Archive (§11.3) is the tidy-up, and it is not an
unpublish.

**My vs Community.** Both are client-side partitions of one paged scan; §2.3 C1
still holds, so no server-side filter is possible.

- **My** = rows where `isOwnRow(row, viewerId)` (`src/lib/benchmark.ts:621`,
  already shipped), plus that object's unpublished appStorage records.
- **Community** = every published row **including the viewer's own**, so an author
  sees their row ranked the way everyone else sees it.

⚠ The partition reads `useBlockContext().viewer.id`, which the installed SDK marks
`@deprecated` (migration target: `signedIn` + `useViewer()`, which would need
`user:read:self` added to the manifest). It is still on the wire and civitai/civitai's
contract test pins the BLOCK_INIT viewer key set as exactly `['id','username']`. **Use
the existing `isOwnRow`; do not migrate in 527.** Closing condition for the migration:
`id` actually leaves the BLOCK_INIT payload, checked by re-reading the installed
`ViewerInfo` type.

### 11.2 🔴 The `grid` record kind — the irreversible decision

A Grid is the **fourth** row kind on the one shared board. §9 question 3 deferred
exactly this; the deferral is now **reversed**.

**This wire shape is effectively permanent from the first published grid onward.**
Once other viewers append grid rows, the app owner cannot delete or rewrite them —
`update`/`withdraw` are author-scoped (§2.3) and `report()` does not hide. There is
no migration path for other authors' rows. Get it right here.

```ts
/** The opaque structured payload for a `grid` shared record. */
export interface GridData {
  v: 1;
  kind: 'grid';
  /** Ordered, de-duplicated shared keys of the matchups forming the grid's ROWS. */
  matchupKeys: string[];
  /** Ordered, de-duplicated shared keys of the prompts forming the grid's COLUMNS. */
  promptKeys: string[];
}
```

Decisions embedded above, each with its reason:

- **The grid's NAME and DESCRIPTION are not in `data`.** They go in the shared row's
  `title`/`body`, which are the moderated, user-visible text (§2.2). Putting
  author-supplied prose in the unmoderated `data` blob would route user text around
  the content belt.
- **Order is significant and preserved.** The author picked a row/column order;
  arrays carry it. A `Set` or a sort would silently discard an authored decision.
- **Keys are de-duplicated within each array.** A repeated key would render a
  duplicate row whose cells share one `(comboKey, configId, promptKey)` identity.
- **Cap: 20 matchups × 20 prompts.** Not arbitrary — 20 is the `max` of the
  `Slider` this rework deletes (`src/App.tsx:1494-1504`), so a hand-built grid may
  not exceed what the app already rendered. It also keeps the payload far inside
  appStorage's 64 KB per-value limit while unpublished.
- **`v: 1` from the start**, so a later shape change is a migration-on-read like
  `parseCombination`/`parsePrompt` rather than a break.

🔴 **Dangling references are NORMAL, not exceptional.** A grid names keys whose rows
another author may `withdraw` at any time, and the grid's author cannot repair
another author's row. So a grid with missing members **renders the members it still
has plus an honest count of what is gone**. It must never throw, and it must never
silently render shorter — a quietly-shrinking grid is the same class of lie as the
§7.2 truncation this repo already discloses.

**Results are unaffected and this is the payoff.** `result` rows key on
`(comboKey, configId, promptKey)` (`src/lib/benchmark.ts:698`) — **not** on a grid.
A cell someone spent Buzz on appears in *every* grid containing that matchup and
that prompt. Explicit grids make the existing result corpus more valuable, not less.

### 11.3 Archive — an author-side hide, and NOT suppression

**Storage:** one appStorage key, `archive:v1`, holding `string[]` of shared keys.

**Semantics, exactly:** archiving one of your own published rows removes it from
**your My list only**. The row stays on the shared board, stays in Community for
everyone including you, keeps its votes, and keeps serving any grid that references
it. Nothing about it changes for another viewer.

🔴 **The UI must say this in words.** `taste.json`'s `suppressionNamedAsSuppression`
rubric item applies: an "Archive" that a viewer could reasonably read as "removed"
is a claim the code does not back, and §2.3's constraint is that the app *has* no
power to remove another viewer's view of a row. The existing author-only **Remove**
(`withdraw`) is unchanged and remains the only true delete.

### 11.4 The rename map — 24 testids, not 22

🔴 **§6.2's "22, complete" is STALE.** Re-measured on `main` @ `ad546fb`,
2026-09-07: the census returns **24**. Two were added after 2026-08-30 —
`combo-report` (the report seam, `10a0b46`) and `view-switch-combos` (card 449,
`2437f90`). §6.2's *method* is sound; its *count* was a snapshot and the surface
kept moving.

**Re-run the census; never quote the number.** Note the shell trap: `grep` on this
host is a function wrapping ugrep, and it is not usable from `xargs` — resolve the
real binary first, and confirm a positive control before believing any zero.

```bash
GREP=$(whence -p grep)                      # the FUNCTION is not an executable
find src \( -name '*.tsx' -o -name '*.ts' \) ! -name '*.test.*' -print0 \
  | xargs -0 "$GREP" -ho 'data-testid="[^"]*"' | "$GREP" -iE 'combo|combination' | sort -u
# positive control — total testids, must be >> 0 (123 at ad546fb):
find src \( -name '*.tsx' -o -name '*.ts' \) ! -name '*.test.*' -print0 \
  | xargs -0 "$GREP" -ho 'data-testid="[^"]*"' | sort -u | wc -l
```

**The map is fixed here so the two rename streams can run in parallel** against one
agreed vocabulary — `combo`/`combos`/`combination` → `matchup`/`matchups`/`matchup`:

| old | new |  | old | new |
|---|---|---|---|---|
| `combination-form` | `matchup-form` | | `combos-empty` | `matchups-empty` |
| `combo-cancel` | `matchup-cancel` | | `combos-error` | `matchups-error` |
| `combo-card` | `matchup-card` | | `combos-included-summary` | `matchups-included-summary` |
| `combo-config-count` | `matchup-config-count` | | `combos-list` | `matchups-list` |
| `combo-config-summary` | `matchup-config-summary` | | `combos-loading` | `matchups-loading` |
| `combo-description` | `matchup-description` | | `combos-view` | `matchups-view` |
| `combo-edit` | `matchup-edit` | | `grid-empty-add-combination` | `grid-empty-add-matchup` |
| `combo-errors` | `matchup-errors` | | `grid-group-combo` | `grid-group-matchup` |
| `combo-included` | `matchup-included` | | `submit-combination` | `submit-matchup` |
| `combo-name` | `matchup-name` | | `view-switch-combos` | `view-switch-matchups` |
| `combo-report` | `matchup-report` | | | |
| `combo-submit` | `matchup-submit` | | | |
| `combo-vote` | `matchup-vote` | | | |
| `combo-withdraw` | `matchup-withdraw` | | | |

🔴 **§6.1 is unchanged and absolute: `data.kind: 'combination'` stays
`'combination'` on the wire forever**, as do `v:`, `ResultData.comboKey` and the
`draft:v1:` prefix. The string sits in renameable and un-renameable positions **in
the same files**; this is invisible to find-and-replace.

⚠ **§6's line offsets have DRIFTED past `ad546fb` and must be re-resolved by
content.** Measured example: the `"Included combinations"` `waitForText` anchor
§6.3 cites at `src/App.tsx:835` is now at **`src/App.tsx:1491`**. The §6.3
*inventory of consumers* is sound; its *offsets* are not. Same for §6.2's
user-visible-string line list.

### 11.5 Votes, the Top Grid, and the default view

The per-viewer **"Show top N (your view)" `Slider` is deleted**
(`data-testid="top-n"`). With it goes the only consumer of matchup and prompt votes,
so their meaning is restated:

- **Matchup and prompt votes are discovery ranking.** They sort the Community
  Matchups / Community Prompts lists and they feed the Top Grid. They no longer
  determine any user-built grid's contents.
- **Grid votes** use `shared.vote`/`unvote` on the grid row, hydrating button state
  from `viewerVoted` (§2.2). **Community Grids sorts by `count` descending** with
  §7.1's existing deterministic tie-break, which `topByVotes()` already implements
  (`src/lib/benchmark.ts:661`).
- **The Top Grid** is a system-owned entry: `DEFAULT_TOP_N` (5) top-voted matchups ×
  `DEFAULT_TOP_N` top-voted prompts, computed client-side by `topByVotes()`.
  🔴 **It has no shared key, so it cannot be voted on and cannot be sorted by
  count.** It is therefore **pinned first** in Community Grids, outside the vote
  ordering, and labelled as system-owned — rather than given a fake position in a
  ranking it does not participate in.

**Grids becomes the default view on load.**

⚠ §7.2's ceiling is unchanged and now feeds three lists instead of two. The
`board-truncated-notice` **already exists and is already tested** (see §11.6); it
must be extended to the Grids view, which reads the same truncated ranking. **Do not
raise `MAX_PAGES`** — §7.2's reasoning is unchanged.

### 11.6 Superseded cards, and what was already shipped

Cards **450**, **452** and **455** are superseded by **527** (tagged
`superseded-by:527` + `gate:blocked`; left `open` because clawgate has no status
meaning "superseded" and `complete` would be false).

- **450** (watch a matchup → a Watched tab) — superseded, not dropped. With
  publishable Grids, "watch a matchup" collapses into "view someone else's published
  Grid".
- **452** (grid-as-default + ranking + truncation) — 🔴 **its criteria 3 and 4 were
  already shipped** in `10a0b46` (#31). The `board-truncated-notice` Alert lives at
  `src/App.tsx:1440` and its test — **with a negative control** — at
  `src/boardTruncation.test.tsx:117-137`. 452's body still cites
  `src/App.tsx:931-938` as discarding the condition; that line no longer exists,
  and `listAll` now returns `{items, truncated}` at `src/App.tsx:1609-1623`.
  527 inherits only the live remainder.
- **455** (the rename) — its inventory is carried into 527 Phase 1 intact, with the
  count and offsets corrected by §11.4. Its "depends on cards A–F" chain is void.

Cards **453** (details page) and **454** (prompt-in-matchup voting) remain open and
untouched. If a grid detail view makes 453 redundant, that is a decision to record,
not to assume.

### 11.7 Corrections to §6.3, measured while executing it (2026-09-07)

§6.3's inventory of `datapacket-talos` consumers was executed in full. Four of its
claims did not survive contact, and one documented control is wrong. Corrected
here so the next reader measures instead of trusting:

1. **"Two of three captions" is wrong — it is ONE of three.** The other two never
   contained the word.
2. **§6.3(b)'s line numbers drifted.** `tests/run-tests-app-capture.sh` cites
   `3843-3844`; the actual lines are **`4511-4512`**. (Same class as §11.4's
   warning — re-resolve by content.)
   ⚠ **And so did §6.3(d)'s, which an earlier draft of this section missed:** it
   cites `tests/mutants-app-capture.sh:1264-1265`; the actual lines are
   **`1338-1339`**. Found by the PR #38 audit, not by this sweep — which is the
   lesson: this section swept ONE claim's offsets and hand-checked the other, and
   only the hand-checked one was wrong. **Sweep every claim in a commit the way you
   swept the hardest one.**
3. 🔴 **§6.3 misses a FIFTH coupled file.**
   `tests/fixtures/app-capture/evidence/manifest.json` carries the same selectors
   as data-driven probes and must move with the other four. The spec says "four";
   it is five.
4. **§6.3(d)'s failure mode is wrong, in the safe direction.** It says a missed
   state rename makes the mutant "silently a no-op". It does not: `apply_mutant`'s
   `grep -cF` uniqueness guard scores it **BROKEN**, loudly. The hazard is real but
   it is not silent.

🔴 **And the control §6.3(c) documents does not hold.** It says to confirm the DOM
fixture with `grep -c testid` → **12**. `-c` counts **lines**, and that file is 9
lines with all 12 testids on one — so it returns **1**, which reads as "the file is
barely coupled" and would have justified skipping it. The occurrence count needs
`grep -o … | wc -l`. The underlying warning in §6.3(c) — that the JSON escaping
makes a naive `"combo…"` grep return zero against a fully coupled file — **is
correct and was confirmed**.

**Still open downstream (§6.3(e)):** the live store listing caption still says
"combinations" and needs a listing revision, i.e. another moderator review.

⚠ **Two literals in `datapacket-talos` are deliberately NOT renamed yet**, because
their new values are app copy that has not reached `main`: the `_selectors`
quotation of the tab label `'Combinations (1)'`, and `_contentCaveat`'s
`"2 combinations"` (which `run-tests-app-capture.sh` pins as a needle, so changing
it early reds the suite). **Both become a follow-up the moment the app rename
merges.**

### 11.8 🔴 The paid-cell surface, and why the scan budget is now the binding constraint

Surfaced by the PR #38 adversarial audit. **Not fixed here — documented, because the
honest mitigation is a product decision, not a patch.**

**What changed.** Before this rework the runnable matrix was a single window:
`DEFAULT_TOP_N` (5) matchups × ≤`MAX_CONFIGS` (8) configs × 5 prompts ≈ **200 cells**.
The deleted slider could widen *one viewer's* window to 20 × 8 × 20, but there was
still only ever one window.

After it, **every published grid is its own window** of ≤20 × ≤8 × ≤20
(`MAX_GRID_MATCHUPS` / `MAX_GRID_PROMPTS`, `src/lib/grids.ts`), any viewer can open
anyone else's, and nothing bounds how many grids name disjoint members.

**Why that collides with §7.2.** Every run appends a `result` row to the **same**
flat list the board scan pages, and that scan is capped at `LIST_PAGE 50 ×
MAX_PAGES 40 = 2000` rows. One fully-run 20×20 grid of 8-config matchups is
**3200 cells → 3200 result rows**, which exceeds the entire scan budget on its own.

Past the cap the failure is not an error, it is a **quiet wrongness** that compounds:
the scan truncates oldest-first, so the Top Grid loses its longest-standing members,
every grid's membership silently shrinks, vote ranking degrades, and a grid's
missing-member notice can no longer distinguish "withdrawn" from "not read" (which is
why §11.4's notice now branches on `boardTruncated` — audit finding F4).

🔴 **And §11.5 forbids the obvious lever.** Raising `MAX_PAGES` trades a silent wrong
answer for a slow one, linear in board size on every load. That is still the right
call, which is what makes this a design constraint rather than a tuning knob.

**Today the board is ~22 rows, so nothing is broken.** What this rework changed is the
*slope*: it is now possible for a small number of enthusiastic viewers to reach the
cap, where before it took the whole community. Options, none taken here, in rough
order of honesty:

1. **Bound the product** — a lower per-grid cap, or a cap on published grids per
   viewer. Cheapest, and the only one that acts before the cliff.
2. **Stop paging results in the same scan** — results are the growth driver and are
   read per-cell; a separate read path would take them off the ranking scan entirely.
   This is the real fix and it is a platform-shaped change.
3. **Disclose harder** — the truncation notice already exists; it could name what was
   lost rather than that something was.

**Closing condition:** this stops being a horizon risk and becomes an incident the
first time `listAll` reports `truncated: true` against the live board. That is already
observable — the app computes it — so the check is: does anyone see
`board-truncated-notice` in production? Until then it is a documented slope, and this
section is what makes it a decision someone took rather than a surprise.
