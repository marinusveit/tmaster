import { describe, expect, it } from 'vitest';
import { OutputRingBuffer } from '@main/triage/OutputRingBuffer';

describe('OutputRingBuffer', () => {
  it('append() speichert nur vollstaendige Zeilen', () => {
    const buffer = new OutputRingBuffer();
    buffer.append('t1', 'line-1');

    expect(buffer.getRecent('t1')).toBe('');

    buffer.append('t1', '\n');
    expect(buffer.getRecent('t1')).toBe('line-1');
  });

  it('append() splittet mehrzeiligen Output korrekt', () => {
    const buffer = new OutputRingBuffer();
    buffer.append('t1', 'line-1\nline-2\nline-3');
    buffer.append('t1', '\n');

    expect(buffer.getRecent('t1')).toBe('line-1\nline-2\nline-3');
  });

  it('getRecent() liefert die letzten N Zeilen', () => {
    const buffer = new OutputRingBuffer();
    buffer.append('t1', 'a\nb\nc\nd');

    buffer.append('t1', '\n');
    expect(buffer.getRecent('t1', 2)).toBe('c\nd');
  });

  it('getRecent() ohne lines-Argument liefert alle verfuegbaren Zeilen', () => {
    const buffer = new OutputRingBuffer();
    buffer.append('t1', 'a\nb\nc');

    buffer.append('t1', '\n');
    expect(buffer.getRecent('t1')).toBe('a\nb\nc');
  });

  it('ueberschreibt aelteste Zeilen wenn maxLines erreicht ist', () => {
    const buffer = new OutputRingBuffer();
    const lines = Array.from({ length: 200 }, (_, index) => `line-${index + 1}`).join('\n');

    buffer.append('t1', lines);
    buffer.append('t1', '\n');

    const recent = buffer.getRecent('t1');
    expect(recent.split('\n')).toHaveLength(150);
    expect(recent.startsWith('line-51')).toBe(true);
    expect(recent.endsWith('line-200')).toBe(true);
  });

  it('append() fuegt ueber Chunks verteilte Zeilen korrekt zusammen', () => {
    const buffer = new OutputRingBuffer();
    buffer.append('t1', 'Error: canno');

    expect(buffer.getRecent('t1')).toBe('');

    buffer.append('t1', 't find module\n');
    expect(buffer.getRecent('t1')).toBe('Error: cannot find module');
  });

  it('append() commitet komplette Zeilen trotz nachfolgender Partial-Zeile', () => {
    const buffer = new OutputRingBuffer();
    buffer.append('t1', 'line-1\nline');

    expect(buffer.getRecent('t1')).toBe('line-1');

    buffer.append('t1', '-2\n');
    expect(buffer.getRecent('t1')).toBe('line-1\nline-2');
  });

  it('remove() gibt Terminal-Buffer frei', () => {
    const buffer = new OutputRingBuffer();
    buffer.append('t1', 'line-1');
    buffer.remove('t1');
    buffer.append('t1', '\n');

    expect(buffer.getRecent('t1')).toBe('');
  });

  it('clear() leert alle Buffer', () => {
    const buffer = new OutputRingBuffer();
    buffer.append('t1', 'line-1');
    buffer.append('t2', 'line-2');
    buffer.clear();
    buffer.append('t1', '\n');
    buffer.append('t2', '\n');

    expect(buffer.getRecent('t1')).toBe('');
    expect(buffer.getRecent('t2')).toBe('');
  });

  it('getRecent() liefert leeren String fuer unbekannte Terminals', () => {
    const buffer = new OutputRingBuffer();
    expect(buffer.getRecent('unknown-terminal')).toBe('');
  });
});
