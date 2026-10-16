// The app's SHARED board surface, over ONE shared collection of the App Blocks
// document store.
//
// Before the port this was the legacy shared store (`app.sharedStorage.*` plus the
// app-layer `blocks/shared-storage/{vote,unvote,report}` routes, scopes
// `apps:storage:shared:read` + `:write`). The document store replaces all of it with
// one declared collection, and this module maps the seven operations the app performs
// onto it. Every caller keeps the `SharedStore` shape it already had.
//
// 🔴 THE MAPPING IS FIXED, AND THE PRODUCTION DATA COPY DEPENDS ON IT EXACTLY:
//
//   1. ONE collection, `records`, declared in `block.manifest.json` as
//      `{ visibility: "shared", write: "own", marks: ["vote"] }` — no counters, no
//      indexes (an index would oblige the copy to write index rows too), and no
//      `showAuthor` (see below).
//   2. Document key = the legacy shared key (a host-minted ULID), byte-for-byte. Rows
//      reference each other by key — a result's `comboKey`/`promptKey`, a grid's
//      `matchupKeys`/`promptKeys`, a viewer's private publish POINTER — so a key that
//      moved would orphan every reference to it.
//   3. Document data = the legacy value VERBATIM: `{ title, body, data }`. NOT wrapped
//      (contrast the private `kv` collection, `lib/kv-store.ts`): a shared value is
//      already an object, so there is nothing to wrap, and the moderation split
//      (author prose in `title`/`body`, structure in `data`) is kept as-is.
//   4. Votes are the `vote` MARK. The tally is the document's `marks.vote`, and "did I
//      vote" is `viewer.marks` — the store's answer, on every read, for every device.
//      The legacy `counters` were exactly the vote tally, so there is no counter.
//   5. A report is the BUILT-IN `report` mark: undeclared, cannot be withdrawn (the
//      server refuses `unmark` of it for everyone), and its count is never exposed.
//   6. A withdraw is a DELETE (`own`: only the author may), an edit is a PUT on the
//      existing key (`own`: only the author may), and a new row is a `create` — the
//      SERVER mints its key, as the legacy `append` did.
//
// 🔴 OWNERSHIP IS `author.isViewer`, NEVER A USER ID. The store does not disclose who
// wrote a document — `author` is `{ kind: 'user', isViewer, username? }` — so the
// legacy `authorUserId` has no source any more. `showAuthor` stays OFF: this app never
// rendered an author's identity, and turning it on would publish every author's
// username to every reader for no feature that reads it.
//
// `src/lib/records-store.test.ts` pins the mapping with literal values against the
// SDK's contract fake (`createFakeStorage`) over this repo's manifest.

import type { SharedStorageValue } from '@civitai/app-sdk/blocks';
import type { DocumentCallOptions, DocumentStorage, StorageCollection, StorageDocument } from '@civitai/sdk';

/** The one shared collection. Must match `block.manifest.json` → `storage.collections`. */
export const RECORDS_COLLECTION = 'records';
/** The declared vote mark. */
export const VOTE_MARK = 'vote';
/** The platform's built-in report mark — not declared, never withdrawable. */
export const REPORT_MARK = 'report';
/**
 * The order the board is read in: NEWEST FIRST by key, which is what the legacy list
 * returned (`ORDER BY key DESC`). Keys are server-minted ULIDs, so key order is
 * creation order — and it is the same order for rows the copy carried over, whose
 * keys are the legacy ULIDs, which `-createdAt` would not guarantee.
 */
export const BOARD_SORT = '-key';
/** The store's hard ceiling on one page (`DOC_STORE_BOUNDS.listLimitMax`). */
export const RECORDS_LIST_LIMIT_MAX = 100;

/** The stored document's data: the legacy shared value, verbatim. See rule 3. */
export type RecordDocument = SharedStorageValue & Record<string, unknown>;

/**
 * One board row as the app consumes it.
 *
 * `authoredByViewer` is the store's `author.isViewer`; there is no author id.
 */
export interface SharedRecord {
  key: string;
  value: SharedStorageValue;
  /** The `vote` mark's count. */
  count: number;
  /** Whether the CURRENT viewer holds a `vote` mark on it. Always false when anonymous. */
  viewerVoted: boolean;
  authoredByViewer: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** The seven shared operations this app performs. */
export interface SharedStore {
  list(query?: { limit?: number; cursor?: string }): Promise<{
    items: SharedRecord[];
    nextCursor?: string;
  }>;
  /** Create a row under a SERVER-minted key. */
  append(value: SharedStorageValue): Promise<{ key: string }>;
  /** Replace an existing row the viewer authored. Rejects `not_found` if it is gone. */
  update(key: string, value: SharedStorageValue): Promise<void>;
  /** Delete a row the viewer authored. Every failure REJECTS; `deleted: false` = nothing was there. */
  withdraw(key: string): Promise<{ ok: true; deleted: boolean }>;
  /** Set the viewer's `vote` mark; resolves the new tally. Idempotent. */
  vote(key: string): Promise<number>;
  /** Remove the viewer's `vote` mark; resolves the new tally. Idempotent. */
  unvote(key: string): Promise<number>;
  /** File a `report` mark. Idempotent, permanent, and it does NOT hide the row. */
  report(key: string): Promise<void>;
}

/** A store document → the row the app reads. The one place a document becomes a row. */
export function toSharedRecord(doc: StorageDocument<RecordDocument>): SharedRecord {
  return {
    key: doc.key,
    value: doc.data as SharedStorageValue,
    count: doc.marks[VOTE_MARK] ?? 0,
    viewerVoted: doc.viewer?.marks.includes(VOTE_MARK) ?? false,
    authoredByViewer: doc.author.kind === 'user' && doc.author.isViewer,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Assert a mark reply's `count`.
 *
 * 🔴 ASSERTED, NOT COERCED. `?? 0` would report a vote that did not land as a tally
 * of zero — and this app writes that number straight into the row's displayed count,
 * which is what the Top Grid's membership is ranked on. A malformed reply is a
 * failure, not a count.
 */
function requireCount(reply: { count?: unknown }, op: string): number {
  if (typeof reply.count !== 'number' || !Number.isFinite(reply.count)) {
    throw new Error(`records ${op}: reply carried no numeric \`count\``);
  }
  return reply.count;
}

/**
 * Viewer copy for a create/edit the store refused `consent_required`.
 *
 * 🔴 IT SAYS "TRY AGAIN" BECAUSE NOTHING RETRIES FOR THEM. Consent is asked for
 * fire-and-forget (the host's dialog has no reply a declined grant can be read from),
 * so the write that triggered it has already failed; once the viewer approves, the
 * next press carries the re-minted token and succeeds.
 *
 * ⚠️ NONE OF THESE SAYS "NOTHING WAS PUBLISHED" (PR #85 audit, F1). A single
 * create that is refused did publish nothing — but these strings are also quoted
 * inside a grid cascade's partial-failure copy (`lib/gridCascade.ts`, as the host
 * error) after OTHER records in the same press DID publish, and in that sentence the
 * clause would be false. The refusal says what to do; the surrounding copy says what
 * landed.
 */
export const PUBLISH_CONSENT_MESSAGE =
  'Publishing needs your permission first. Approve it in the dialog, then try again.';
/** Viewer copy for a create/edit the store refused `sign_in_required` (anonymous). */
export const PUBLISH_SIGN_IN_MESSAGE = 'Sign in to publish.';

/**
 * Viewer copy for a create/edit the store refused `content_rejected`.
 *
 * 🔴 A BEHAVIOUR CHANGE OF THE PORT, NOT A NEW EDGE CASE (PR #85, F3). The document
 * store runs its text moderation in ENFORCE mode on every shared create and edit
 * (`doc-store-api.ts`'s `moderate`), where the legacy shared store's moderation was
 * ramped behind a flag. So an author can now be refused for the words in a title or
 * description. The server's own message is not viewer copy, and does not say what to
 * do; this does.
 */
export const PUBLISH_CONTENT_REJECTED_MESSAGE =
  "This couldn't be published: the platform's content check rejected some of its text. Edit the name or description and try again.";

/** A shared write the store refused for a reason the viewer can fix; `message` is viewer copy. */
export class SharedWriteRefusal extends Error {
  override readonly name = 'SharedWriteRefusal';
  constructor(
    message: string,
    readonly code: 'consent_required' | 'sign_in_required' | 'content_rejected',
    cause: unknown,
  ) {
    super(message, { cause });
  }
}

/**
 * Hooks the adapter calls when the store refuses a SHARED write for a reason the
 * VIEWER can fix — so the one place that knows the codes is the one place that asks.
 */
export interface RecordsStoreHooks {
  /** `consent_required`: the token lacks `apps:storage:publish`. Ask the host. */
  onConsentRequired?: () => void;
  /** `sign_in_required`: an anonymous viewer tried to write. */
  onSignInRequired?: () => void;
}

/**
 * Build the shared surface over a document store. See {@link createKvStorage} in
 * `lib/kv-store.ts` for why `docs` and `callOpts` are thunks.
 */
export function createRecordsStore(
  docs: () => DocumentStorage | Promise<DocumentStorage>,
  callOpts: () => DocumentCallOptions = () => ({}),
  hooks: RecordsStoreHooks = {},
): SharedStore {
  const records = async (): Promise<StorageCollection<RecordDocument>> =>
    (await docs()).collection<RecordDocument>(RECORDS_COLLECTION);

  /**
   * Route a viewer-fixable refusal to its hook and rethrow it as viewer copy; rethrow
   * anything else unchanged.
   */
  const viewerFixable = (err: unknown): never => {
    const code = (err as { code?: unknown } | null)?.code;
    if (code === 'consent_required') {
      hooks.onConsentRequired?.();
      throw new SharedWriteRefusal(PUBLISH_CONSENT_MESSAGE, code, err);
    }
    if (code === 'sign_in_required') {
      hooks.onSignInRequired?.();
      throw new SharedWriteRefusal(PUBLISH_SIGN_IN_MESSAGE, code, err);
    }
    if (code === 'content_rejected') {
      throw new SharedWriteRefusal(PUBLISH_CONTENT_REJECTED_MESSAGE, code, err);
    }
    throw err;
  };

  return {
    async list(query = {}) {
      const page = await (await records()).list(
        {
          sort: BOARD_SORT,
          ...(query.limit !== undefined
            ? { limit: Math.min(Math.max(1, query.limit), RECORDS_LIST_LIMIT_MAX) }
            : {}),
          ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
        },
        callOpts(),
      );
      return {
        items: page.items.map(toSharedRecord),
        ...(page.nextCursor !== null ? { nextCursor: page.nextCursor } : {}),
      };
    },
    async append(value) {
      try {
        const doc = await (await records()).create(value as RecordDocument, callOpts());
        return { key: doc.key };
      } catch (err) {
        return viewerFixable(err);
      }
    },
    async update(key, value) {
      try {
        const coll = await records();
        // 🔴 `put` CREATES A MISSING KEY, and the legacy `update` answered 404 for one.
        // Reading first and writing at that exact version keeps "edit" from silently
        // resurrecting a row its author withdrew in another tab — the conditional write
        // refuses `version_conflict` if anything moved in between. A missing row is
        // reported as the store reports one, `not_found`.
        const current = await coll.get(key, callOpts());
        if (current === null) {
          throw Object.assign(new Error(`records update: ${key} not found`), { code: 'not_found' });
        }
        await coll.put(key, value as RecordDocument, { ...callOpts(), ifVersion: current.version });
      } catch (err) {
        viewerFixable(err);
      }
    },
    async withdraw(key) {
      const { deleted } = await (await records()).delete(key, callOpts());
      return { ok: true as const, deleted };
    },
    async vote(key) {
      return requireCount(await (await records()).mark(key, VOTE_MARK, callOpts()), 'vote');
    },
    async unvote(key) {
      return requireCount(await (await records()).unmark(key, VOTE_MARK, callOpts()), 'unvote');
    },
    async report(key) {
      await (await records()).mark(key, REPORT_MARK, callOpts());
    },
  };
}
