import { describe, expect, it } from 'vitest';
import { detectDuplicateStatusChange, type StatusChangeEvent } from './detectDuplicateStatusChange';

const base = '2026-07-13T12:00:00.000Z';

function at(offsetMs: number): string {
  return new Date(new Date(base).getTime() + offsetMs).toISOString();
}

describe('detectDuplicateStatusChange', () => {
  it('returns no incidents for a single status change', () => {
    const events: StatusChangeEvent[] = [
      { orderId: 'o1', toStatus: 'prep', correlationId: 'c1', timestamp: at(0) },
    ];
    expect(detectDuplicateStatusChange(events)).toEqual([]);
  });

  it('flags two different correlation_ids hitting the same transition within the window', () => {
    const events: StatusChangeEvent[] = [
      { orderId: 'o1', toStatus: 'prep', correlationId: 'c1', timestamp: at(0) },
      { orderId: 'o1', toStatus: 'prep', correlationId: 'c2', timestamp: at(500) },
    ];
    const incidents = detectDuplicateStatusChange(events, 2000);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      incidentType: 'duplicate_status_change',
      errorClass: 'functional',
      orderId: 'o1',
      correlationIds: ['c1', 'c2'],
    });
  });

  it('does not flag changes outside the window', () => {
    const events: StatusChangeEvent[] = [
      { orderId: 'o1', toStatus: 'prep', correlationId: 'c1', timestamp: at(0) },
      { orderId: 'o1', toStatus: 'prep', correlationId: 'c2', timestamp: at(3000) },
    ];
    expect(detectDuplicateStatusChange(events, 2000)).toEqual([]);
  });

  it('does not flag repeated events sharing the same correlation_id', () => {
    const events: StatusChangeEvent[] = [
      { orderId: 'o1', toStatus: 'prep', correlationId: 'c1', timestamp: at(0) },
      { orderId: 'o1', toStatus: 'prep', correlationId: 'c1', timestamp: at(200) },
    ];
    expect(detectDuplicateStatusChange(events, 2000)).toEqual([]);
  });
});
