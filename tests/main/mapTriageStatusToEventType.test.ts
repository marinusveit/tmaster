import { describe, expect, it } from 'vitest';
import { mapTriageStatusToEventType } from '@main/triage/mapTriageStatusToEventType';

describe('mapTriageStatusToEventType', () => {
  it('mappt action_required auf waiting', () => {
    expect(mapTriageStatusToEventType('action_required')).toBe('waiting');
  });

  it('mappt error auf error', () => {
    expect(mapTriageStatusToEventType('error')).toBe('error');
  });

  it('mappt completed auf test_result', () => {
    expect(mapTriageStatusToEventType('completed')).toBe('test_result');
  });

  it('mappt working nicht auf warning', () => {
    expect(mapTriageStatusToEventType('working')).toBeNull();
  });

  it('mappt idle nicht auf warning', () => {
    expect(mapTriageStatusToEventType('idle')).toBeNull();
  });
});
