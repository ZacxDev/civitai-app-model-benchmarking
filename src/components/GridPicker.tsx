// The search + multi-select picker used for BOTH axes of a grid (spec §11.2):
// the matchups that become its ROWS and the prompts that become its COLUMNS.
// ONE component, parameterised by `axis` — the two axes differ only in their
// cap constant and their nouns, and a second copy would let those drift.
//
// 🔴 WHY THIS IS HAND-BUILT. `@civitai/blocks-react@0.46.0/ui` ships `Select`,
// which is SINGLE-VALUE only — there is no MultiSelect, Combobox, Autocomplete
// or Tabs in the pack (verified by reading `dist/ui/index.d.ts` end to end). So
// the option list, its roles and its keyboard model are assembled here out of
// the pack's primitives (`Modal`, `TextInput`, `Button`, `Stack`, `Group`,
// `Badge`). There is no `role="listbox"` precedent anywhere in `src/` to copy,
// so every accessibility decision below is deliberate and is pinned by a test in
// `GridPicker.test.tsx` — see the comment on each.
//
// 🔴 THE THREE INVARIANTS THIS COMPONENT OWES §11.2:
//
//  1. ORDER IS THE AUTHOR'S. Selections are appended in the order the user
//     clicks them and `onConfirm` hands that array back UNSORTED. §11.2 makes
//     row/column order significant; a `Set` round-trip or a `.sort()` here would
//     silently discard an authored decision before it ever reached
//     `buildGridPayload`.
//  2. THE CAP IS IMPORTED, NEVER RE-DERIVED. `MAX_GRID_MATCHUPS` /
//     `MAX_GRID_PROMPTS` come from `lib/grids.ts`, which is the one place §11.2's
//     20×20 lives. A literal `20` here would be a second copy of the rule and
//     would stop tracking `grids.ts` the day the cap moves.
//  3. NOTHING IS EVER SILENTLY DROPPED. At the cap, unpicked rows go
//     NON-SELECTABLE with a visible reason — they are never quietly ignored on
//     click. If the caller hands in MORE than the cap (an older build, a forged
//     row), every one of them stays selected and visible and the picker says so
//     and blocks Save, rather than truncating to the first 20 the way
//     `normalizeKeys` would. `normalizeKeys` truncating at write time is correct
//     for a payload; truncating in front of a human who could still fix it is
//     not.
//     The same rule covers a selected key that is NOT in `items` (its row was
//     withdrawn — §11.2 calls dangling references NORMAL): it is counted,
//     disclosed and carried through Save, never dropped for being unlistable.

import { Badge, Button, Group, Modal, Stack, TextInput } from '@civitai/blocks-react/ui';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { MAX_GRID_MATCHUPS, MAX_GRID_PROMPTS } from '../lib/grids.js';
import { elevate, metaText, mutedText, radius, token } from '../theme.js';
import { EmptyState } from './EmptyState.js';

/** Which axis of the grid is being picked. Decides the cap and every noun. */
export type GridPickerAxis = 'matchups' | 'prompts';

/** One selectable row. `key` is the SHARED key that ends up in `GridData`. */
export interface GridPickerItem {
  /** Shared key — the identity stored in the grid. Must be unique in `items`. */
  key: string;
  /** User-visible name. Searched, and part of the option's accessible name. */
  name: string;
  /** Optional secondary line. Also searched. */
  description?: string;
  /** Optional short meta ("3 configs"). Shown, but NOT searched. */
  meta?: string;
}

export interface GridPickerProps {
  /** Whether the modal is shown. The parent owns this. */
  opened: boolean;
  /** Which axis this picker is filling. */
  axis: GridPickerAxis;
  /** Everything pickable, in whatever order the caller wants it listed. */
  items: readonly GridPickerItem[];
  /**
   * Already-picked keys, in AUTHORED order. Re-read each time `opened` goes
   * false → true, so re-opening the picker resumes from what was saved.
   */
  selected: readonly string[];
  /** Confirm. Receives the picked keys in the order the user picked them. */
  onConfirm: (keys: string[]) => void;
  /** Cancel / Escape / overlay click / ×. The parent must flip `opened`. */
  onCancel: () => void;
  /** Test id prefix. Defaults to `grid-picker`. */
  'data-testid'?: string;
}

interface AxisCopy {
  cap: number;
  one: string;
  many: string;
  title: string;
  /** What this axis becomes in the rendered grid — used in the cap notice. */
  produces: string;
}

/**
 * The per-axis constants and nouns. The `cap` values are the IMPORTED §11.2
 * constants (invariant 2 above), never literals.
 *
 * ⚠ HONEST LIMITATION: `MAX_GRID_MATCHUPS` and `MAX_GRID_PROMPTS` are both 20
 * today, so NO test in this repo can distinguish this table from one that swaps
 * them — the two branches are numerically identical. What the tests DO pin is
 * that each branch tracks its own imported constant, so the moment `grids.ts`
 * makes them differ, the cap tests start discriminating.
 */
const AXIS: Record<GridPickerAxis, AxisCopy> = {
  matchups: {
    cap: MAX_GRID_MATCHUPS,
    one: 'matchup',
    many: 'matchups',
    title: 'Choose matchups',
    produces: 'rows',
  },
  prompts: {
    cap: MAX_GRID_PROMPTS,
    one: 'prompt',
    many: 'prompts',
    title: 'Choose prompts',
    produces: 'columns',
  },
};

/** The §11.2 cap for one axis. Exported so a caller can pre-trim without
 * re-deriving 20, and so a test can assert the mapping directly. */
export function gridPickerCap(axis: GridPickerAxis): number {
  return AXIS[axis].cap;
}

/** First-occurrence-wins de-duplication. Mirrors `normalizeKeys`' rule 2 but
 * deliberately applies NO cap — see invariant 3. */
function dedupe(keys: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    if (typeof k !== 'string') continue;
    const key = k.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Case-insensitive substring match over the item's user-visible text.
 * Name and description are matched SEPARATELY — concatenating them would let a
 * query straddle the join and match text that is nowhere on screen. */
function matches(item: GridPickerItem, needle: string): boolean {
  if (!needle) return true;
  if (item.name.toLowerCase().includes(needle)) return true;
  return (item.description ?? '').toLowerCase().includes(needle);
}

export function GridPicker({
  opened,
  axis,
  items,
  selected,
  onConfirm,
  onCancel,
  'data-testid': testId = 'grid-picker',
}: GridPickerProps): React.JSX.Element {
  const copy = AXIS[axis];
  const reactId = useId();
  const noticeId = `gp-notice-${reactId}`;
  const optionId = (i: number): string => `gp-opt-${reactId}-${i}`;

  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<string[]>(() => dedupe(selected));
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(opened);

  // Re-seed from `selected` only on the closed → open transition, so the parent
  // re-rendering with a fresh array literal can't stomp a selection in progress.
  // 🔴 This body does NOT run on first mount when `opened` starts true —
  // `wasOpen` is seeded from `opened`, and `useState`'s initializer above is what
  // covers that case. The two paths are tested separately ("seeds from
  // `selected`…" and "re-seeds … when the picker is re-opened"); testing only the
  // always-open render left every mutation of this body alive.
  useEffect(() => {
    if (opened && !wasOpen.current) {
      setOrder(dedupe(selected));
      setQuery('');
      setActiveIndex(0);
    }
    wasOpen.current = opened;
  }, [opened, selected]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => items.filter((it) => matches(it, needle)), [items, needle]);

  // Clamp the active option so `aria-activedescendant` can never name an id that
  // is not on screen. Typing resets `activeIndex` to 0, so this is NOT about
  // filtering: the case it actually catches is the `items` PROP shrinking under
  // a stationary cursor — a member row withdrawn from the shared board while the
  // picker is open, which §11.2 calls normal. Pinned by the "never points
  // aria-activedescendant at a row that vanished from under it" test.
  const active = filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);

  const orderSet = useMemo(() => new Set(order), [order]);
  const count = order.length;
  const atCap = count >= copy.cap;
  const overBy = Math.max(0, count - copy.cap);

  // Selected keys with no row in `items` — withdrawn members (§11.2's dangling
  // references, which are NORMAL). Counted, disclosed, and carried through Save.
  const listedKeys = useMemo(() => new Set(items.map((it) => it.key)), [items]);
  const unlisted = order.filter((k) => !listedKeys.has(k)).length;

  /**
   * 🔴 THE ONE PLACE THE CAP IS ENFORCED. Neither the click handler nor the
   * keydown handler pre-checks it — they used to, and a mutation sweep showed
   * exactly why that was wrong: three copies of one predicate MASK each other,
   * so a `>=` → `>` mutation in any single copy survived a fully green suite
   * because another copy always caught it. Enforcement lives here; `atCap`
   * ABOVE is the separate DISPLAY predicate (what the row looks like and says),
   * and each is now reachable on its own.
   *
   * Deselect is never blocked — that is the only way out of the cap.
   */
  function toggle(key: string): void {
    setOrder((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= copy.cap) return prev;
      return [...prev, key]; // append — this line IS the order guarantee
    });
  }

  function moveActive(next: number): void {
    if (filtered.length === 0) return;
    const clamped = Math.max(0, Math.min(next, filtered.length - 1));
    setActiveIndex(clamped);
    // Real browsers only; jsdom implements no layout and no scrollIntoView, so
    // this is optional-called and NOTHING in the test suite observes it.
    // `getElementById` rather than a `#id` selector: React's `useId` emits ids
    // containing `«»`, which are legal in HTML but need CSS.escape in a selector.
    document.getElementById(optionId(clamped))?.scrollIntoView?.({ block: 'nearest' });
  }

  function onListKeyDown(e: ReactKeyboardEvent<HTMLDivElement>): void {
    // Escape is deliberately NOT handled here: Modal owns it on `document`, and
    // swallowing it would break the one close affordance keyboard users expect.
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(active + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(active - 1);
        break;
      case 'Home':
        e.preventDefault();
        moveActive(0);
        break;
      case 'End':
        e.preventDefault();
        moveActive(filtered.length - 1);
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault(); // Space would otherwise scroll the panel
        const item = active >= 0 ? filtered[active] : undefined;
        if (!item) break;
        // No cap check here — `toggle` owns it (see the comment there). A row
        // that is at the cap is refused by `toggle` and the reason is on screen
        // in the cap notice, which this row's aria-describedby points at.
        toggle(item.key);
        break;
      }
      default:
        break;
    }
  }

  // ArrowDown out of the search field lands on the list — the search box and the
  // list are two tab stops, and this is the bridge between them.
  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (e.key !== 'ArrowDown' || filtered.length === 0) return;
    e.preventDefault();
    setActiveIndex(0);
    listRef.current?.focus();
  }

  const notice: string | null = overBy
    ? `${count} ${copy.many} selected — ${overBy} over the limit of ${copy.cap}. Remove ${overBy} before saving.`
    : atCap
      ? `Limit reached: a grid takes at most ${copy.cap} ${copy.many} (${copy.cap} ${copy.produces}). Deselect one to choose a different ${copy.one}.`
      : null;

  const optionStyle = (isSelected: boolean, isActive: boolean, blocked: boolean): CSSProperties => ({
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: radius.sm,
    // No opacity-muting anywhere: a blocked row is dimmed by COLOUR TOKEN and
    // marked in words, never by stacking transparency over live text.
    background: isSelected ? elevate(8) : isActive ? elevate(4) : token.surface,
    color: blocked ? token.dimmed : token.text,
    border: `1px solid ${isSelected ? token.primary : token.border}`,
    outline: isActive ? `2px solid ${token.primary}` : 'none',
    outlineOffset: 2,
    cursor: blocked ? 'not-allowed' : 'pointer',
  });

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={copy.title}
      size="lg"
      closeButtonLabel={`Close ${copy.one} picker`}
    >
      <Stack gap={12} data-testid={testId}>
        <span style={mutedText} data-testid={`${testId}-intro`}>
          Pick the {copy.many} that become this grid&apos;s {copy.produces}. They stay in the order you
          pick them.
        </span>

        <TextInput
          label={`Search ${copy.many}`}
          type="search"
          value={query}
          placeholder={`Filter by name or description`}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setActiveIndex(0);
          }}
          onKeyDown={onSearchKeyDown}
          data-testid={`${testId}-search`}
        />

        {/* The cap reason lives HERE — visible, above the rows it disables, and
            referenced by every blocked option's aria-describedby so a screen
            reader gets the same sentence a sighted user reads. */}
        {notice && (
          <span
            id={noticeId}
            role="status"
            style={{ ...metaText, color: overBy ? token.error : token.dimmed }}
            data-testid={`${testId}-cap-notice`}
          >
            {notice}
          </span>
        )}

        {filtered.length === 0 ? (
          items.length === 0 ? (
            <EmptyState
              data-testid={`${testId}-empty`}
              title={`No ${copy.many} to choose from`}
              body={`Publish or vote up a ${copy.one} first — a grid can only reference ${copy.many} that are on the board.`}
            />
          ) : (
            <EmptyState
              data-testid={`${testId}-empty`}
              title={`No ${copy.many} match “${query.trim()}”`}
              body={`${items.length} ${copy.many} are available. Try a shorter or different search.`}
              action={
                <Button size="sm" variant="light" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            />
          )
        ) : (
          <div
            ref={listRef}
            role="listbox"
            aria-multiselectable="true"
            aria-label={`${copy.many} to include`}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            tabIndex={0}
            onKeyDown={onListKeyDown}
            data-testid={`${testId}-list`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 320,
              overflowY: 'auto',
              padding: 4,
              borderRadius: radius.md,
              border: `1px solid ${token.border}`,
              background: token.surface,
            }}
          >
            {filtered.map((item, i) => {
              const isSelected = orderSet.has(item.key);
              const blocked = !isSelected && atCap;
              const isActive = i === active;
              return (
                <div
                  key={item.key}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={blocked || undefined}
                  aria-describedby={blocked && notice ? noticeId : undefined}
                  data-testid={`${testId}-option`}
                  data-key={item.key}
                  onClick={() => {
                    // Also no cap check — `toggle` owns it. Moving the active
                    // option to the clicked row is right either way: it keeps
                    // aria-activedescendant pointing where the pointer went.
                    setActiveIndex(i);
                    toggle(item.key);
                  }}
                  style={optionStyle(isSelected, isActive, blocked)}
                >
                  <Group justify="space-between" align="flex-start" gap={8}>
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: 14 }}>{item.name}</strong>
                      {item.description && <span style={metaText}>{item.description}</span>}
                    </Stack>
                    <Group gap={6} align="center">
                      {item.meta && <span style={metaText}>{item.meta}</span>}
                      {/* aria-hidden on BOTH cues: the state they mirror is
                          already on the option as aria-selected / aria-disabled,
                          and leaving them in the accessibility tree would make
                          the option's accessible NAME change as it is toggled. */}
                      {isSelected && (
                        <Badge color="success" variant="light" size="sm" aria-hidden="true">
                          Selected
                        </Badge>
                      )}
                      {blocked && (
                        <Badge variant="outline" size="sm" aria-hidden="true">
                          Limit reached
                        </Badge>
                      )}
                    </Group>
                  </Group>
                </div>
              );
            })}
          </div>
        )}

        {unlisted > 0 && (
          <span style={metaText} data-testid={`${testId}-unlisted`}>
            {unlisted} selected {unlisted === 1 ? copy.one : copy.many}{' '}
            {unlisted === 1 ? 'is' : 'are'} no longer on the board and cannot be shown here. Saving
            keeps {unlisted === 1 ? 'it' : 'them'}.
          </span>
        )}

        <Group justify="space-between" align="center" gap={10}>
          {/* Live so a toggle is announced; the string is one node so it is
              never read out in fragments. */}
          <span role="status" aria-live="polite" data-testid={`${testId}-count`} style={{ fontSize: 13 }}>
            {count} selected
          </span>
          <Group gap={8} align="center">
            <Button size="sm" variant="subtle" onClick={onCancel} data-testid={`${testId}-cancel`}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onConfirm([...order])}
              disabled={overBy > 0}
              aria-describedby={overBy > 0 ? noticeId : undefined}
              data-testid={`${testId}-confirm`}
            >
              Save {copy.many}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
