// The one civitai.com path builder.
//
// 🔴 A BRAND-NEW FILE, SO NONE OF IT IS RED AT BASE — `lib/resourceLink.ts` does not
// exist on `zach/ia-feedback-sidebar`. Stated rather than implied: "0 of N red at
// base" is not coverage, and this file's job is to pin a CONTRACT (the exact string
// the host is asked to navigate to) as literals, not to guard a fixed bug.
//
// 🔴 THE EXPECTATIONS ARE TYPED-OUT STRINGS, never built from `modelPath`'s own
// pieces. A test that composed `/models/${id}` the same way the implementation does
// would pass whatever the implementation said — including a path the site does not
// serve.

import { describe, expect, it } from 'vitest';

import { modelPath } from './resourceLink.js';

describe('modelPath', () => {
  it('addresses the MODEL, and pins the version when one is known', () => {
    expect(modelPath(500, 1001)).toBe('/models/500?modelVersionId=1001');
  });

  it('falls back to the bare model page when no version is given', () => {
    // The LoRA case that matters is the OPPOSITE of this one (a version with no
    // model id is not addressable at all, which is why `modelId` is the required
    // parameter), but a caller with only a model id is legitimate.
    expect(modelPath(500)).toBe('/models/500');
  });

  it('is absolute from the site root, with exactly one leading slash', () => {
    // 🔴 THE LEADING SLASH IS PART OF THE CONTRACT, and the host's own handling is
    // why: it strips leading slashes and then rejects a path that still starts with
    // one, or contains `//` or a `..` segment. A relative path would be accepted and
    // resolved somewhere else entirely.
    const p = modelPath(7, 8);
    expect(p.startsWith('/')).toBe(true);
    expect(p.startsWith('//')).toBe(false);
    expect(p.split('/')).not.toContain('..');
  });

  it('distinguishes two different resources', () => {
    // A guard against a constant sneaking in: two calls with pairwise-distinct
    // arguments must produce two distinct strings, and neither may equal the other's.
    expect(modelPath(500, 1001)).not.toBe(modelPath(900, 2002));
    expect(modelPath(900, 2002)).toBe('/models/900?modelVersionId=2002');
  });
});
