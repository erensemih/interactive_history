import { describe, expect, it } from 'vitest';
import { readTier, writeTier } from '../src/ai/settings';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('the speed setting', () => {
  it('starts balanced and remembers the reader choice', () => {
    const store = memory();
    expect(readTier(store)).toBe('default');
    writeTier('quick', store);
    expect(readTier(store)).toBe('quick');
    writeTier('complex', store);
    expect(readTier(store)).toBe('complex');
  });

  it('ignores a value it does not know', () => {
    const store = memory();
    store.setItem('ayni-zamanda.tier', 'gpt-9');
    expect(readTier(store)).toBe('default');
  });

  it('works without storage, and when storage throws', () => {
    expect(readTier(undefined)).toBe('default');
    expect(() => writeTier('quick', undefined)).not.toThrow();
    const hostile = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readTier(hostile)).toBe('default');
    expect(() => writeTier('quick', hostile)).not.toThrow();
  });
});
