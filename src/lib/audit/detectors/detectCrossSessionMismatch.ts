import type { IncidentDraft } from '../../../types/audit';

export interface SessionSnapshot {
  sessionId: string;
  orderId: string;
  status: string;
  capturedAt: string;
}

const DEFAULT_WINDOW_MS = 5000;

// Scenario 7: two or more active screens show different data for the same
// order at roughly the same time. Compares snapshots taken by different
// session_ids for the same order within a short time window.
export function detectCrossSessionMismatch(
  snapshots: SessionSnapshot[],
  windowMs: number = DEFAULT_WINDOW_MS,
): IncidentDraft[] {
  const byOrder = new Map<string, SessionSnapshot[]>();
  for (const snapshot of snapshots) {
    const group = byOrder.get(snapshot.orderId) ?? [];
    group.push(snapshot);
    byOrder.set(snapshot.orderId, group);
  }

  const incidents: IncidentDraft[] = [];
  const seenPairs = new Set<string>();

  for (const [orderId, group] of byOrder) {
    const sorted = [...group].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
    );

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const diff = new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();
        if (diff > windowMs) break;
        if (a.sessionId === b.sessionId || a.status === b.status) continue;

        const pairKey = [a.sessionId, b.sessionId].sort().join('::');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        incidents.push({
          correlationIds: [],
          detectorName: 'detectCrossSessionMismatch',
          incidentType: 'cross_session_mismatch',
          errorClass: 'semantic',
          severity: 'high',
          orderId,
          details: {
            windowMs,
            diffMs: diff,
            sessions: [
              { sessionId: a.sessionId, status: a.status, capturedAt: a.capturedAt },
              { sessionId: b.sessionId, status: b.status, capturedAt: b.capturedAt },
            ],
          },
        });
      }
    }
  }

  return incidents;
}
