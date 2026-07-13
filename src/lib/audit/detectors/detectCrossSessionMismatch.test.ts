import { describe, expect, it } from 'vitest';
import { detectCrossSessionMismatch, type SessionSnapshot } from './detectCrossSessionMismatch';

const base = '2026-07-13T12:00:00.000Z';

function at(offsetMs: number): string {
  return new Date(new Date(base).getTime() + offsetMs).toISOString();
}

describe('detectCrossSessionMismatch', () => {
  it('returns no incidents when all sessions agree', () => {
    const snapshots: SessionSnapshot[] = [
      { sessionId: 's1', orderId: 'o1', status: 'prep', capturedAt: at(0) },
      { sessionId: 's2', orderId: 'o1', status: 'prep', capturedAt: at(100) },
    ];
    expect(detectCrossSessionMismatch(snapshots)).toEqual([]);
  });

  it('flags two sessions showing different statuses for the same order within the window', () => {
    const snapshots: SessionSnapshot[] = [
      { sessionId: 's1', orderId: 'o1', status: 'prep', capturedAt: at(0) },
      { sessionId: 's2', orderId: 'o1', status: 'ready', capturedAt: at(1000) },
    ];
    const incidents = detectCrossSessionMismatch(snapshots, 5000);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      incidentType: 'cross_session_mismatch',
      errorClass: 'semantic',
      orderId: 'o1',
    });
  });

  it('ignores mismatches outside the comparison window', () => {
    const snapshots: SessionSnapshot[] = [
      { sessionId: 's1', orderId: 'o1', status: 'prep', capturedAt: at(0) },
      { sessionId: 's2', orderId: 'o1', status: 'ready', capturedAt: at(10_000) },
    ];
    expect(detectCrossSessionMismatch(snapshots, 5000)).toEqual([]);
  });

  it('does not compare snapshots from different orders', () => {
    const snapshots: SessionSnapshot[] = [
      { sessionId: 's1', orderId: 'o1', status: 'prep', capturedAt: at(0) },
      { sessionId: 's2', orderId: 'o2', status: 'ready', capturedAt: at(100) },
    ];
    expect(detectCrossSessionMismatch(snapshots)).toEqual([]);
  });
});
