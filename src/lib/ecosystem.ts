// PURE ecosystem mapping. A "combination" is pinned to a checkpoint whose
// `baseModel` is a specific version string (e.g. 'SDXL 1.0', 'Pony', 'Flux.1 D',
// 'Illustrious'); a "prompt" carries a DEFAULT entry plus optional per-ecosystem
// overrides keyed by the ecosystem GROUP key. To run a (combo × prompt) cell we
// collapse the combo's precise baseModel down to that ecosystem group key (this
// module), then look it up in the prompt's `overrides` (falling back to the
// default — see lib/benchmark.ts `resolveCell`).
//
// This mirrors the base-model → family grouping Civitai uses elsewhere (the
// resource picker's `baseModelGroup` hint, the generator base-model families).
// The mapping is deterministic + tested; unknown base models fall back to an
// 'Other' bucket so a novel family is still benchmarkable (rather than silently
// unmatchable), while staying an explicit, inspectable value.

/** An ecosystem group — the key a prompt's `overrides` map is keyed by. */
export interface Ecosystem {
  /** Stable group key used in `PromptData.overrides` (NEVER user-facing text). */
  key: string;
  /** Human label for pickers / column headers. */
  label: string;
  /** The `baseModelGroup` hint to pass to `useResourcePicker` so a LoRA pick is
   * family-scoped to a checkpoint in this ecosystem. */
  baseModelGroup: string;
}

/** The known ecosystems, in display order. Extend as the platform adds families. */
export const ECOSYSTEMS: Ecosystem[] = [
  { key: 'SD1', label: 'SD 1.5', baseModelGroup: 'SD1' },
  { key: 'SD2', label: 'SD 2.x', baseModelGroup: 'SD2' },
  { key: 'SD3', label: 'SD 3.x', baseModelGroup: 'SD3' },
  { key: 'SDXL', label: 'SDXL', baseModelGroup: 'SDXL' },
  { key: 'Pony', label: 'Pony', baseModelGroup: 'Pony' },
  { key: 'Illustrious', label: 'Illustrious', baseModelGroup: 'Illustrious' },
  { key: 'NoobAI', label: 'NoobAI', baseModelGroup: 'NoobAI' },
  { key: 'Flux', label: 'Flux', baseModelGroup: 'Flux' },
  { key: 'Flux1Krea', label: 'Flux Krea', baseModelGroup: 'Flux1Krea' },
  { key: 'SDXLLightning', label: 'SDXL Lightning', baseModelGroup: 'SDXLLightning' },
  { key: 'Other', label: 'Other', baseModelGroup: 'Other' },
];

const BY_KEY = new Map(ECOSYSTEMS.map((e) => [e.key, e]));

/** The fallback bucket for an unrecognised base model. */
export const OTHER_ECOSYSTEM = 'Other';

// Ordered longest/most-specific-first so 'SDXL 1.0 LCM' matches 'SDXL' only
// after the more specific families, and 'Pony'/'Illustrious' (which are SDXL
// derivatives whose baseModel string does NOT contain "SDXL") win on their own
// name. Each rule is a lowercased substring test against the baseModel string.
const RULES: Array<{ match: (b: string) => boolean; key: string }> = [
  { match: (b) => b.includes('pony'), key: 'Pony' },
  { match: (b) => b.includes('illustrious') || b.includes('illust'), key: 'Illustrious' },
  { match: (b) => b.includes('noob'), key: 'NoobAI' },
  { match: (b) => b.includes('krea'), key: 'Flux1Krea' },
  { match: (b) => b.includes('flux'), key: 'Flux' },
  { match: (b) => b.includes('lightning'), key: 'SDXLLightning' },
  { match: (b) => b.includes('sdxl') || b.includes('sd xl') || b.includes('pdxl'), key: 'SDXL' },
  { match: (b) => b.includes('sd 3') || b.includes('sd3') || b.includes('stable diffusion 3'), key: 'SD3' },
  { match: (b) => b.includes('sd 2') || b.includes('sd2'), key: 'SD2' },
  { match: (b) => b.includes('sd 1') || b.includes('sd1') || b.includes('stable diffusion 1'), key: 'SD1' },
];

/**
 * Map a checkpoint's precise `baseModel` string to its ecosystem GROUP key.
 * Deterministic; unknown families → {@link OTHER_ECOSYSTEM}. Case/whitespace
 * insensitive.
 */
export function ecosystemForBaseModel(baseModel: string | undefined | null): string {
  if (!baseModel) return OTHER_ECOSYSTEM;
  const b = baseModel.trim().toLowerCase();
  if (!b) return OTHER_ECOSYSTEM;
  for (const rule of RULES) {
    if (rule.match(b)) return rule.key;
  }
  return OTHER_ECOSYSTEM;
}

/** Look up an ecosystem's display metadata by key (falls back to a synthesised
 * label for an unknown key so a forged/legacy prompt key still renders). */
export function ecosystemMeta(key: string): Ecosystem {
  return BY_KEY.get(key) ?? { key, label: key, baseModelGroup: key };
}
