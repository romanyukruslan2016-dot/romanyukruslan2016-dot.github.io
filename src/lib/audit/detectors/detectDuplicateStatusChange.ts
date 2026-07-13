import type { IncidentDraft } from '../../../types/audit';

export interface StatusChangeEvent {
  orderId: string;
  toStatus: string;
  correlationId: string;
  timestamp: string;
}

const DEFAULT_WINDOW_MS = 2000;

// Scenario 4: the same status change was recorded twice (e.g. a double-click
// fired two API calls). Groups events by order+target status and flags any
// pair with different correlation_id inside a short time window.
export function detectDuplicateStatusChange(
  events: StatusChangeEvent[],
  windowMs: number = DEFAULT_WINDOW_MS,
): IncidentDraft[] {
  const groups = new Map<string, StatusChangeEvent[]>();

  for (const event of events) {
    const key = `${event.orderId}::${event.toStatus}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  const incidents: IncidentDraft[] = [];
  const seenPairs = new Set<string>();

  for (const group of groups.values()) {
    const sorted = [...group].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        if (diff > windowMs) break;
        if (a.correlationId === b.correlationId) continue;

        const pairKey = [a.correlationId, b.correlationId].sort().join('::');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        incidents.push({
          correlationIds: [a.correlationId, b.correlationId],
          detectorName: 'detectDuplicateStatusChange',
          incidentType: 'duplicate_status_change',
          errorClass: 'functional',
          severity: 'medium',
          orderId: a.orderId,
          details: { toStatus: a.toStatus, windowMs, diffMs: diff, timestamps: [a.timestamp, b.timestamp] },
        });
      }
    }
  }

  return incidents;
}
