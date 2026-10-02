// MY BENCHMARKS ▸ <noun> — ONE list holding BOTH storage layers, for all three
// object kinds, in one implementation.
//
// 🔴 IT REPLACES TWO COMPONENTS, AND THE MERGE IS THE POINT. `UnpublishedList`
// rendered the per-viewer KV half (`lib/drafts.ts`, `lib/unpubGrids.ts`,
// `lib/unpubPrompts.ts`) and `MyPublished` rendered the shared-storage half plus the
// archive partition. Two lists on one screen made "where is my thing" a question
// about which STORE it happens to sit in — an implementation detail the viewer has
// no way to know. One list, one row layout, and the state is a BADGE.
//
// 🔴 THE TWO HALVES ARE STILL TWO STORES, AND NOTHING HERE BLURS THAT. A draft row
// is a record in the per-viewer KV; a published row is a row on the shared board.
// NOTHING IN THIS COMPONENT WRITES TO EITHER — it renders and raises intent, and the
// one callback that crosses into the public board is `onPublishDraft`, wired to a
// single explicit button per draft row. An unpublished record is invisible to every
// other viewer precisely because it never reaches `shared.append`, not because of any
// flag on it.
//
// 🔴 THE ACTIONS VARY BY STATE, AND THE INERT-CONTROL CASE IS THE ONE A MERGED LIST
// GETS WRONG. A draft row never offers Archive (archive is a hide of a SHARED row;
// there is nothing to hide), and a published row never offers Publish (it is already
// public, and a second `append` would mint a second unmergeable row). Both absences
// are pinned in `src/myBenchmarks.test.tsx`.
//
// 🔴 ONE PREDICATE, STATED ONCE: a published row belongs to the archived half iff
// `archivedKeys.has(keyOf(row))`. The caller has already narrowed `rows` to the
// viewer's OWN rows, so ownership is not re-tested here. That split used to be
// open-coded in `MatchupsView`, `PromptsView` AND `GridsView`, and the third copy
// disagreed with its own sibling predicate badly enough to leave an archived row with
// no recovery path at all. Consolidating is what makes such a disagreement impossible
// rather than merely fixed.
//
// 🔴 ARCHIVE IS NOT A SUPPRESSION. The row stays appended, keeps its votes, and stays
// visible to every other viewer — this app HAS no power to do otherwise
// (`update`/`withdraw` are author-scoped, `report()` does not hide). {@link
// ARCHIVE_NOTE} says so in words and lives in `lib/archive.ts` so a test can pin the
// WHOLE string rather than a keyword.
//
// 🔴 WHAT THIS COMPONENT DOES NOT DO: render a published row's card BODY. Each caller
// passes its own `renderCard`, because a matchup card, a prompt card and a grid card
// are genuinely different bodies. What IS shared is the PARTITION and the ACTION SET,
// which are the parts that had the bug.
//
// 🔴 THE ROW ACTIONS ARE BUILT HERE, NOT BY THE CARD BODY, and that is what put
// Remove and Archive behind one `⋮`. `MatchupBody`/`PromptBody` still build their own
// menu on the COMMUNITY board (where Report is the affordance that matters); on this
// surface the callers deliberately omit `onEdit`/`onWithdraw` from the body so it
// renders no menu at all, and the whole action group comes from here. Two menus on one
// row is the thing that made the old surface unreadable.
//
// ⚠️ THE ERROR NOTICE IS OUTSIDE THE LIST AND THE LIST IS UNCONDITIONAL — both
// deliberately, and `MyGridsView`'s header records the incident. A half-published
// record is retired FROM the list at exactly the moment it has something to say, so a
// notice rendered per-row would unmount with the row it was about, and a `length > 0`
// condition on the panel would unmount the notice with the panel. Neither shape may
// come back.

import { useState, type ReactNode } from 'react';

import { Alert, Badge, Button, Card, Group, Stack } from '@civitai/blocks-react/ui';

import type { MyNoun } from '../types.js';
import { ARCHIVE_NOTE } from '../lib/archive.js';
import { metaText, mutedText } from '../theme.js';
import { Menu, MenuControl, MenuItem } from './Menu.js';
import { WithdrawButton } from './WithdrawButton.js';

/** One unpublished record, flattened to what this list renders. */
export interface MyDraftItem {
  /** App-chosen, per-viewer id — NOT a shared key. */
  localId: string;
  name: string;
  /**
   * A short STRUCTURAL summary (e.g. "2 models", "2 × 1"), or `undefined` for NO
   * badge at all.
   *
   * ⚠️ IT USED TO READ "2 configs" AND THE EXAMPLE WAS THE LIVE STRING, not a
   * placeholder: the matchup caller built it from `configs.length` with the repo's
   * internal noun. The viewer-facing word is "models" now — see `modelCountSummary`
   * in `lib/benchmark.ts`, which owns it for both callers.
   *
   * 🔴 OPTIONAL, AND THE OPTIONALITY IS THE FEATURE. A badge earns its place by
   * telling a viewer something they could not assume, so the caller omits it on the
   * state that IS the assumption: the prompt surface rendered "default only" on every
   * prompt with no overrides — the overwhelming majority — which spent a pill saying
   * "nothing unusual here". `PromptsView` now passes a value only for the informative
   * minority (`default + N override(s)`), and the badge is unmounted otherwise. Same
   * reasoning that settled the Private badge: badge the minority state.
   *
   * ⚠️ An EMPTY STRING is not the way to ask for no badge — it renders an empty pill.
   * Pass `undefined` (or omit the key).
   */
  meta?: string;
  description?: string;
  /**
   * An OPTIONAL extra body node, rendered BELOW the name/meta/description row and
   * the action group.
   *
   * 🔴 IT EXISTS FOR ONE CALLER AND IT IS A NODE RATHER THAN DATA, DELIBERATELY.
   * `MyGridsView` passes a `GridPreview` — the same inline thumbnail strip the
   * community grid cards carry — so a viewer can tell two of their own private
   * grids apart without opening either. Passing the *node* keeps this component
   * ignorant of results, of gated reads and of `GatedCell`: the read budget stays
   * the caller's business, which is where the per-card batching is defended
   * (`gridPreview.test.tsx`, `gridPreviewSeam.test.tsx`).
   *
   * 🔴 AND IT CARRIES NO TESTID OF ITS OWN. The ids a reader selects on belong to
   * whatever the caller renders (`grid-preview`, `grid-preview-empty`), which are
   * literals in `GridPreview.tsx` — a testid threaded through a prop is invisible
   * to `renameWireCompat.test.ts`'s raw-source scan and has been rejected there
   * twice.
   *
   * The matchup and prompt callers pass nothing, so their rows are unchanged.
   */
  preview?: ReactNode;
}

export interface MyListProps<Row> {
  /** What the object is, for accessible names and the empty-state copy. */
  noun: MyNoun;
  /** This viewer's UNPUBLISHED records (per-viewer KV). */
  drafts: MyDraftItem[];
  /**
   * The viewer's OWN published rows — already narrowed by the caller.
   *
   * 🔴 THE NARROWING IS THE CALLER'S, DELIBERATELY: "which rows are mine" is decided
   * by the same `isOwnRow` predicate that gates the affordances, so there is one
   * decision rather than two that can disagree about the same row.
   */
  rows: Row[];
  keyOf: (row: Row) => string;
  /** Shared keys this viewer archived (§11.3). */
  archivedKeys: Set<string>;
  loading: boolean;
  /** The host-reported private-storage line, or null while unread/anonymous. */
  quotaLine?: string | null;
  onNew: () => void;
  onEditDraft: (localId: string) => void;
  onDiscardDraft: (localId: string) => Promise<void> | void;
  /** 🔴 The ONE callback that reaches the public board. */
  onPublishDraft: (localId: string) => Promise<void> | void;
  /** Edit an already-PUBLISHED row in place (`shared.update`, author-scoped). */
  onEditPublished: (row: Row) => void;
  onWithdraw: (key: string) => Promise<void> | void;
  onArchive?: (key: string) => Promise<void> | void;
  onUnarchive?: (key: string) => Promise<void> | void;
  /**
   * OPEN this viewer's own PRIVATE record, if the noun has somewhere to open it.
   *
   * 🔴 ONLY THE GRID SURFACE PASSES IT, and the optionality is what keeps the other
   * two honest: a matchup or a prompt has no "open" destination — the thing a viewer
   * opens is a GRID, whose matrix is the app's primary object. With the callback
   * omitted the control is UNMOUNTED, not disabled, for the same reason the Top Grid
   * gets no greyed vote button: a dead control advertises an action that does not
   * exist.
   *
   * 🔴 OPENING A PRIVATE GRID IS WHAT MAKES IT RUNNABLE BEFORE IT IS PUBLISHED, which
   * is the whole point of the control — and the grid's privacy does NOT cover a run's
   * outputs: a result row is keyed on the matchup and the prompt, never on the grid, so
   * once a cell's images reach the shared board every grid containing that cell shows
   * them to every viewer.
   *
   * ⚠️ "THE OUTPUTS ARE PUBLIC" IS WHAT THIS SAID, AND IT SKIPS THE STEP THAT PUTS THEM
   * THERE. On the path that reaches the board it takes a SECOND human confirm —
   * `publish()` opens the host's own dialog and rejects on refusal — and `driveToResult`
   * has two further arms that end with nothing published, both named in that docblock
   * (a terminal non-`succeeded` workflow, and the `imageIds.length > 0` guard before
   * `shared.append`). The twin docblock on
   * `MyGridsView.onOpenPrivate` was corrected for exactly this and this one was left;
   * see `ResultsGrid`'s `PRIVATE_GRID_RUN_NOTICE` for the whole account. That notice is
   * where the viewer is told, on the confirm path. Nothing on THIS row claims
   * otherwise, and nothing here writes anything: the callback raises intent, exactly
   * like every other one in this file.
   *
   * ⚠️ THERE IS NO `onOpenRow` BESIDE IT, AND THERE WAS FOR ONE ROUND. The PUBLISHED
   * half of this list carried an Open too, under a `my-open` testid; it was cut because
   * a published grid is listed on the community board and already carries `grid-open`
   * there, so the control was a second door to one destination — for the one kind of
   * grid that was never short of doors. The private record is the one with no other
   * route to its matrix, which is why this callback is the one that survives. Cutting it
   * also removed the Open from the ARCHIVED rows, which reach `publishedActions` through
   * the same path.
   */
  onOpenDraft?: (localId: string) => void;
  /** Render one published row's card, with the action group this list supplies. */
  renderCard: (row: Row, actions: ReactNode) => ReactNode;
}

/** "matchup" → "Matchup", for the menu's accessible name. */
function titleCase(noun: MyNoun): string {
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

export function MyList<Row>({
  noun,
  drafts,
  rows,
  keyOf,
  archivedKeys,
  loading,
  quotaLine = null,
  onNew,
  onEditDraft,
  onDiscardDraft,
  onPublishDraft,
  onEditPublished,
  onWithdraw,
  onArchive,
  onUnarchive,
  onOpenDraft,
  renderCard,
}: MyListProps<Row>): React.JSX.Element {
  // Which record is mid-publish — the button that could mint a public row is disabled
  // while its own call is in flight, so a double-tap can't append twice.
  const [publishing, setPublishing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  /**
   * 🔴 THE `catch` IS NOT DECORATION — it is what stops a failed publish being
   * SILENT, which is the whole reason a half-published record went unreported.
   * `onPublishDraft` reaches `shared.append` and then `appStorage.set`, and BOTH can
   * reject (the append for an anonymous or rate-limited viewer, the `set` on the
   * per-APP quota, on >64KB, or for anon). A bare `try/finally` — which this had —
   * spun the button, put the record back, and told the viewer nothing.
   *
   * The message is rendered VERBATIM because the App composes it: when the row DID
   * reach the board and only the private half failed, the honest sentence says so
   * (`publishPointerFailedNotice`), and shortening it to "Publish failed" would invite
   * the second click that mints a duplicate public row.
   */
  const publish = async (localId: string) => {
    if (publishing) return;
    setPublishing(localId);
    setError(null);
    try {
      await onPublishDraft(localId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish.');
    } finally {
      setPublishing(null);
    }
  };

  const isArchived = (row: Row): boolean => archivedKeys.has(keyOf(row));
  const live = rows.filter((r) => !isArchived(r));
  const archived = rows.filter(isArchived);
  const empty = !loading && drafts.length === 0 && live.length === 0;

  /**
   * The action group for ONE published row: Edit on the row, everything else behind
   * the `⋮`.
   *
   * `archiveAction` is what differs between the live half (Archive) and the archived
   * half (nothing — the archived rows carry Unarchive inline instead, because on a
   * recovery list that is the action the viewer came for).
   */
  const publishedActions = (row: Row, archiveAction: ReactNode): React.JSX.Element => (
    <>
      {/* ⚠️ NO Open HERE. A published row's Open lived at the head of this group for one
          round, as `my-open`; it was cut because every published row is on the community
          board with a `grid-open` of its own, and the ask was about the record that has
          no such row. See `onOpenDraft`. */}
      <Button
        size="sm"
        variant="subtle"
        onClick={() => onEditPublished(row)}
        data-testid={`${noun}-edit`}
        aria-label={`Edit your ${noun}`}
      >
        Edit
      </Button>
      <Menu
        label={`${titleCase(noun)} actions`}
        data-testid={`${noun}-menu`}
        panelTestId={`${noun}-menu-items`}
      >
        {/* 🔴 Remove is a two-step CONFIRM control, so it is hosted as itself inside
            `role="none"` rather than forced into a `role="menuitem"` — see
            `Menu.tsx`'s `MENU_CONTROL_ATTR`. */}
        <MenuControl>
          <WithdrawButton
            noun={noun}
            onWithdraw={() => onWithdraw(keyOf(row))}
            data-testid={`${noun}-withdraw`}
          />
        </MenuControl>
        {archiveAction}
      </Menu>
    </>
  );

  return (
    <Stack gap={12} data-testid="my-list-panel">
      <Group justify="space-between" align="center" gap={12}>
        <Stack gap={2} style={{ flex: '1 1 260px', minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>Your {noun}s</strong>
          {/* 🔴 NO EXPLANATORY SUB-LINE. The old surface carried two sentences here
              ("Saved to your own storage and invisible to everyone else until you
              publish. Publishing is a separate step; a published X can be edited or
              removed, but not made private again."). The quota line below already
              states the privacy claim, with host-reported numbers, and the badge
              states the state — so the paragraph was a third telling of both. It is
              also what made "Draft" appear in two places rather than one, which
              `myCommunity.test.tsx`'s vocabulary guard now pins. */}
          {quotaLine && (
            <span style={metaText} data-testid="storage-quota">
              {quotaLine}
            </span>
          )}
        </Stack>
        {/* 🔴 THE PRIMARY CTA, and the `variant`/`size` are the change rather than a
            default that happens to apply. It shipped as `variant="light" size="sm"`,
            which reads as tertiary next to the row's own subtle buttons — on a surface
            whose whole purpose is "make one of these". jsdom performs no layout, so the
            structural properties are what `myBenchmarks.test.tsx` pins; that it LOOKS
            prominent is unverified here. */}
        <Button onClick={onNew} data-testid="new-unpublished">
          New {noun}
        </Button>
      </Group>

      {/* 🔴 OUTSIDE the list, not on a row: the failure that matters most is the one
          where the record has just been retired FROM the list, so a notice rendered
          per-row would unmount with the row it was about. */}
      {error && (
        <Alert color="error" data-testid="unpublished-error">
          {error}
        </Alert>
      )}

      {empty ? (
        <span style={mutedText} data-testid="my-list-empty">
          No {noun}s yet.
        </span>
      ) : (
        <Stack gap={10} data-testid={`my-list-${noun}`}>
          {/* 🔴 DRAFTS FIRST. They are the rows with an outstanding decision; a
              published row needs nothing from its author. */}
          {drafts.map((item) => (
            <Card
              key={item.localId}
              withBorder
              padding="md"
              data-testid="unpublished-card"
              data-local-id={item.localId}
            >
              {/* 🔴 A `Stack` AROUND THE ROW, so an optional `preview` sits BELOW it
                  rather than squeezed into the name column. Matches the published
                  grid cards' shape (`GridsView`'s `entryCard`), which is the point:
                  a private grid and a published one should read the same way.
                  ⚠️ The sentence that used to end this comment — "with no `preview`
                  the Stack holds exactly one child and the row is structurally what
                  it was" — is now FALSE and is removed rather than reworded: the
                  action cluster is a second child of this Stack unconditionally. */}
              <Stack gap={10} style={{ minWidth: 0 }}>
              {/* 🔴 NO LONGER A `space-between` ROW WITH THE ACTIONS ON THE RIGHT. See
                  `MatchupBody`'s header for the measured reflow this removes; the
                  private row shares the shape and therefore the defect. The content
                  column is now the Stack's own child and the actions are its LAST
                  child, below the optional `preview`. */}
              <Stack gap={4} style={{ minWidth: 0 }}>
                  <Group gap={8} align="center">
                    <strong data-testid="unpublished-name">{item.name || `Untitled ${noun}`}</strong>
                    {/* 🔴 THE STATE MARKER, and the ONE place this app names the
                        unpublished state to a viewer. §11.1 took the old word out of the
                        rendered vocabulary while two lists made the state obvious by
                        ADDRESS; one list has no address to read it off, so the state has
                        to be on the row.

                        🔴 IT READS "Private", NOT "Draft", AND THE TWO ARE NOT SYNONYMS
                        HERE. "Draft" names a stage of the AUTHOR'S work and says nothing
                        about who can see it; the one thing this row's state actually
                        means is that the record lives in the viewer's own per-viewer KV
                        and has never reached `shared.append`, so NO OTHER VIEWER CAN SEE
                        IT. "Private" is that fact. The operator asked for the word, and
                        it is also the honest one.

                        🔴 THE TESTID STAYS `draft-badge` ON PURPOSE. It is a selector,
                        not copy; renaming it would churn every consumer (including the
                        external capture recipes `renameWireCompat.test.ts` guards) for a
                        change a viewer cannot observe. The STORAGE names keep the old
                        word for a much harder reason — see `DRAFT_PREFIX` in
                        `lib/drafts.ts`, whose rename would orphan live records.

                        `myCommunity.test.tsx` now holds "draft" out of EVERY rendered
                        surface, badge included — the exclusion that guard used to carry
                        for this node is gone, because this node no longer says it. */}
                    <Badge variant="filled" data-testid="draft-badge">
                      Private
                    </Badge>
                    {/* 🔴 UNMOUNTED WHEN THE CALLER HAS NOTHING WORTH SAYING — not
                        rendered empty. A present-but-empty `unpublished-meta` would
                        keep every `getByTestId('unpublished-meta')` resolving and make
                        "the badge is gone" unassertable; see the prop's docblock. */}
                    {item.meta !== undefined && (
                      <Badge variant="light" data-testid="unpublished-meta">
                        {item.meta}
                      </Badge>
                    )}
                  </Group>
                  {item.description && <span style={mutedText}>{item.description}</span>}
                </Stack>
              {/* 🔴 THE PREVIEW IS CONTENT, SO IT STAYS ABOVE THE ACTIONS. Only
                  `MyGridsView` passes one (a `GridPreview` thumbnail strip); the
                  matchup and prompt callers pass nothing and this renders nothing. */}
              {item.preview}
              {/* 🔴 THE ACTION CLUSTER, AT THE BOTTOM OF THE CARD. `row-actions` is the
                  one spelling shared by all five card shapes — see `MatchupBody` for
                  the measured reflow this placement removes and for why the id is
                  noun-neutral.
                  ⚠️ `wrap={false}` is KEPT. It is about the three controls not
                  breaking apart from each other, which is still true on a full-width
                  row; it was never what positioned the cluster. */}
              <Group gap={6} align="center" wrap={false} data-testid="row-actions">
                  {/* 🔴 OPEN A RECORD THAT IS NOT ON THE BOARD, which is what lets a
                      viewer generate into their grid BEFORE publishing it. Unmounted
                      unless the caller has a destination — see `onOpenDraft`. Its own
                      `unpublished-*` id, like every other control on this row. */}
                  {onOpenDraft && (
                    <Button
                      size="sm"
                      variant="light"
                      onClick={() => onOpenDraft(item.localId)}
                      data-testid="unpublished-open"
                      aria-label={`Open your private ${noun}`}
                    >
                      Open
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => onEditDraft(item.localId)}
                    data-testid="unpublished-edit"
                    aria-label={`Edit your unpublished ${noun}`}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    loading={publishing === item.localId}
                    disabled={publishing !== null}
                    onClick={() => publish(item.localId)}
                    data-testid="unpublished-publish"
                    aria-label={`Publish your ${noun} to the shared board`}
                  >
                    Publish
                  </Button>
                  {/* 🔴 DISCARD IS BEHIND THE `⋮`, NOT ON THE ROW, and that is the same
                      decision Remove/Archive got on the PUBLISHED half one block down:
                      a destructive action is row-level OVERFLOW, and three buttons on
                      one row out-shouted the row itself. It is now UNMOUNTED until the
                      menu opens — a behaviour change, not a style one, so every case
                      that reached `unpublished-discard` has to open the menu first
                      (`openRowMenu('unpublished', card)` in `test-helpers.tsx`).

                      🔴 ITS OWN MENU IDS, NOT `${noun}-menu`. The published row's menu
                      already owns that name on this very surface, and
                      `myBenchmarks.test.tsx` asserts — as the load-bearing half of "a
                      private row is never offered Archive or Remove" — that a private
                      row carries NO `${noun}-menu`. Reusing the id would make that
                      assertion pass for the wrong reason and then quietly stop meaning
                      anything. `unpublished-*` is also the prefix every other control on
                      this row already uses.

                      🔴 AND IT IS A `MenuItem`, i.e. a real `role="menuitem"`, because
                      Discard is a SINGLE press. Remove and Report are two-step confirms
                      and that is why THEY need `MenuControl`'s `role="none"` escape
                      hatch — see `Menu.tsx`'s `MENU_CONTROL_ATTR`. The menuitem role is
                      also what puts this control under `compact.ts`'s 44px floor.

                      ⚠️ THE SINGLE PRESS IS UNCHANGED, DELIBERATELY. Moving the control
                      is the asked-for change; adding a confirm step to it is not, and a
                      discard that both hides AND confirms would be two decisions shipped
                      as one. The record is per-viewer and unpublished, so the loss is
                      bounded to work that never left this viewer's own storage. */}
                  <Menu
                    label={`Private ${noun} actions`}
                    data-testid="unpublished-menu"
                    panelTestId="unpublished-menu-items"
                  >
                    <MenuItem
                      label="Discard"
                      ariaLabel={`Discard your private ${noun}`}
                      danger
                      onSelect={() => onDiscardDraft(item.localId)}
                      data-testid="unpublished-discard"
                    />
                  </Menu>
              </Group>
              </Stack>
            </Card>
          ))}

          {live.map((row) =>
            renderCard(
              row,
              publishedActions(
                row,
                onArchive ? (
                  <MenuItem
                    label="Archive"
                    ariaLabel="Archive: hide from your own list only"
                    onSelect={() => onArchive(keyOf(row))}
                    data-testid="archive-action"
                  />
                ) : undefined,
              ),
            ),
          )}
        </Stack>
      )}

      {/* 🔴 THE HONEST WORDING, rendered NEXT TO the control rather than behind a
          tooltip. A viewer who reads "Archive" as "removed" has been told something the
          code cannot back (§2.2 + §9 Q2). */}
      {/* 🔴 AND THE GATE IS `live OR archived`, NOT `live`. Gating on `live` alone
          silently dropped this sentence in the ONE state that needs it most: a viewer
          whose only own row is archived, with no drafts, saw "No <noun>s yet.", a bare
          "Show archived (1)" and nothing anywhere saying the row is still public — the
          list reads as empty, which is precisely when "Archive" gets read as "removed".
          The pre-merge components rendered it whenever the toggle rendered; the merge
          narrowed it by accident and it was not among the four declared copy cuts. A
          round-0 audit found it. `src/myBenchmarks.test.tsx` already exercised that
          state GREEN without checking the wording. */}
      {(live.length > 0 || archived.length > 0) && (
        <span style={metaText} data-testid="archive-note">
          {ARCHIVE_NOTE}
        </span>
      )}

      {archived.length > 0 && (
        <Stack gap={10}>
          <Button
            size="sm"
            variant="subtle"
            onClick={() => setShowArchived((v) => !v)}
            data-testid="archived-toggle"
            style={{ alignSelf: 'flex-start' }}
          >
            {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
          </Button>
          {/* 🔴 THE RECOVERY PATH, and it is what makes the hide an author-side hide
              rather than a suppression. An archive with no way back is a delete with a
              gentler label. */}
          {showArchived && (
            <Stack gap={10} data-testid="archived-list">
              {archived.map((row) =>
                renderCard(
                  row,
                  <>
                    {onUnarchive && (
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => onUnarchive(keyOf(row))}
                        data-testid="unarchive-action"
                      >
                        Unarchive
                      </Button>
                    )}
                    {publishedActions(row, undefined)}
                  </>,
                ),
              )}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
}
