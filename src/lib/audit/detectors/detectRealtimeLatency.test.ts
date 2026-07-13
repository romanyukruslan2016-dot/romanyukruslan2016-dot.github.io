import { describe, expect, it } from 'vitest';
import { detectRealtimeLatency } from './detectRealtimeLatency';

const ctx = { orderId: 'o1', correlationId: 'c1' };

describe('detectRealtimeLatency', () => {
  it('returns null when delivery is within threshold', () => {
    const event = '2026-07-13T12:00:00.000Z';
    const received = '2026-07-13T12:00:01.000Z';
    expect(detectRealtimeLatency(event, received, ctx, 2000)).toBeNull();
  });

  it('flags delivery beyond the threshold as medium severity', () => {
    const event = '2026-07-13T12:00:00.000Z';
    const received = '2026-07-13T12:00:02.500Z';
    const incident = detectRealtimeLatency(event, received, ctx, 2000);
    expect(incident).toMatchObject({
      incidentType: 'realtime_latency',
      errorClass: 'temporal_latency',
      severity: 'medium',
      details: { diffMs: 2500, thresholdMs: 2000 },
    });
  });

  it('escalates to high severity when latency exceeds 2x the threshold', () => {
    const event = '2026-07-13T12:00:00.000Z';
    const received = '2026-07-13T12:00:05.000Z';
    const incident = detectRealtimeLatency(event, received, ctx, 2000);
    expect(incident?.severity).toBe('high');
  });
});
