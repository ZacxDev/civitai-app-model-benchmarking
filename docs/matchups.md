# Matchups — design spec

**Status:** design only. Nothing here is built. This document exists so that the
irreversible parts of the rework — a rename that reaches two other repos, and a
submit boundary that writes user data into a world-readable store with no
delete-for-owner — are decided before code, not during it.

**Scope:** the six-bullet ask recorded on clawgate **423**, plus the two
sub-features of bullet 2 that are blocked on platform work (**421** comments,
**422** owner moderation).

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
