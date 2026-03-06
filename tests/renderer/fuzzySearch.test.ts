import { describe, expect, it } from 'vitest';
import { fuzzySearch } from '@renderer/utils/fuzzySearch';

describe('fuzzySearch', () => {
  it('gibt bei leerer Query alle Items mit Score 1.0 zurück', () => {
    const items = ['terminal', 'workspace', 'assistant'];
    const results = fuzzySearch(items, '', (item) => item);

    expect(results).toHaveLength(3);
    expect(results.every((result) => result.score === 1)).toBe(true);
  });

  it('rankt exakten Match am höchsten', () => {
    const items = ['term', 'terminal'];
    const results = fuzzySearch(items, 'term', (item) => item);

    expect(results[0]?.item).toBe('term');
    expect(results[0]?.score).toBe(1);
  });

  it('liefert positiven Score bei Teilmatch in Reihenfolge', () => {
    const results = fuzzySearch(['terminal'], 'tml', (item) => item);

    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it('liefert kein Match wenn Zeichen nicht in Reihenfolge vorkommen', () => {
    const results = fuzzySearch(['terminal'], 'lmt', (item) => item);

    expect(results).toHaveLength(0);
  });

  it('arbeitet case-insensitive', () => {
    const results = fuzzySearch(['CodexAgent'], 'codex', (item) => item);

    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it('bewertet aufeinanderfolgende Matches höher als verteilte', () => {
    const results = fuzzySearch(['abcde', 'a-b-c-d-e'], 'abc', (item) => item);
    const consecutive = results.find((result) => result.item === 'abcde');
    const distributed = results.find((result) => result.item === 'a-b-c-d-e');

    expect(consecutive).toBeDefined();
    expect(distributed).toBeDefined();
    expect((consecutive?.score ?? 0)).toBeGreaterThan(distributed?.score ?? 0);
  });

  it('bewertet Wortanfang-Matches höher', () => {
    const results = fuzzySearch(['quick switcher', 'thequickswitcher'], 'qs', (item) => item);
    const wordStart = results.find((result) => result.item === 'quick switcher');
    const nonWordStart = results.find((result) => result.item === 'thequickswitcher');

    expect(wordStart).toBeDefined();
    expect(nonWordStart).toBeDefined();
    expect((wordStart?.score ?? 0)).toBeGreaterThan(nonWordStart?.score ?? 0);
  });
});
