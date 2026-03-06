import type { EventType } from '../../shared/types/event';
import type { TriageStatus } from '../../shared/types/triage';

export const mapTriageStatusToEventType = (status: TriageStatus): EventType | null => {
  if (status === 'error') {
    return 'error';
  }

  if (status === 'action_required') {
    return 'waiting';
  }

  if (status === 'completed') {
    return 'test_result';
  }

  return null;
};
