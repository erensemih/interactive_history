import type { ModelTier } from './provider';

const KEY = 'ayni-zamanda.tier';
const TIERS: readonly string[] = ['quick', 'default', 'complex'];

/**
 * The reader's choice of speed is a convenience that stays in their own browser. Storage can be missing or
 * refuse to answer (a private window, a framed page): then the page simply starts from the balanced one.
 */
export function readTier(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): ModelTier {
  try {
    const v = storage?.getItem(KEY);
    return v && TIERS.includes(v) ? (v as ModelTier) : 'default';
  } catch {
    return 'default';
  }
}

export function writeTier(tier: ModelTier, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()) {
  try {
    storage?.setItem(KEY, tier);
  } catch {
    /* the choice just does not outlive the page */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
