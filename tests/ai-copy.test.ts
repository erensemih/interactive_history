import { describe, expect, it } from 'vitest';
import { ERROR_COPY, errorCopy } from '../src/ai/errorCopy';
import { openPermissionsPanel } from '../src/ai/permissions';
import type { ModelErrorCode } from '../src/ai/provider';
import { segmentsOf } from '../src/ui/chat/segments';

describe('error copy', () => {
  const codes: ModelErrorCode[] = [
    'cancelled',
    'not_granted',
    'rate_limited',
    'tools_unavailable',
    'session_expired',
    'sampling_disabled',
    'refused',
    'empty_completion',
    'prompt_too_large',
    'invalid_request',
    'upstream_error',
  ];

  it('has Turkish words for every way a call can fail, and never the raw code', () => {
    for (const code of codes) {
      const c = errorCopy(code);
      expect(c.title.length).toBeGreaterThan(5);
      expect(c.hint.length).toBeGreaterThan(10);
      expect(`${c.title} ${c.hint}`).not.toMatch(/[a-z]+_[a-z_]+/);
    }
  });

  it('offers a new try only where a new try can help, and the permissions panel only for a declined consent', () => {
    expect(ERROR_COPY.rate_limited.retry).toBe(true);
    expect(ERROR_COPY.upstream_error.retry).toBe(true);
    expect(ERROR_COPY.not_granted.retry).toBe(false);
    expect(ERROR_COPY.sampling_disabled.retry).toBe(false);
    expect(ERROR_COPY.not_granted.permissions).toBe(true);
    expect(Object.values(ERROR_COPY).filter((c) => c.permissions)).toHaveLength(1);
  });
});

describe('openPermissionsPanel', () => {
  it('opens the panel through the runtime, and says so', async () => {
    let opened = 0;
    const host = { use: async (n: string) => (n === 'permissions' ? { manage: async () => void opened++ } : null) };
    expect(await openPermissionsPanel(host)).toBe(true);
    expect(opened).toBe(1);
  });

  it('is false where there is no panel, and never throws', async () => {
    expect(await openPermissionsPanel(undefined)).toBe(false);
    expect(await openPermissionsPanel({ use: async () => null })).toBe(false);
    expect(
      await openPermissionsPanel({ use: async () => ({ manage: () => Promise.reject({ code: 'unavailable' }) }) }),
    ).toBe(false);
  });
});

describe('segmentsOf', () => {
  it('reads bold and italic and leaves the rest', () => {
    expect(segmentsOf('Düz **kalın** ve *eğik* metin')).toEqual([
      { text: 'Düz ', bold: false, italic: false },
      { text: 'kalın', bold: true, italic: false },
      { text: ' ve ', bold: false, italic: false },
      { text: 'eğik', bold: false, italic: true },
      { text: ' metin', bold: false, italic: false },
    ]);
  });

  it('drops marks that are not closed yet, so a streaming text never shows stray asterisks', () => {
    expect(
      segmentsOf('Başı **yarım')
        .map((s) => s.text)
        .join(''),
    ).toBe('Başı yarım');
    expect(
      segmentsOf('Sonu *')
        .map((s) => s.text)
        .join(''),
    ).toBe('Sonu ');
    expect(
      segmentsOf('** boş ** değil')
        .map((s) => s.text)
        .join(''),
    ).toBe(' boş  değil');
  });

  it('does not treat a list-style star or arithmetic as emphasis', () => {
    expect(
      segmentsOf('2 * 3 = 6')
        .map((s) => s.text)
        .join(''),
    ).toBe('2  3 = 6');
  });
});
