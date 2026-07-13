import { describe, expect, it } from 'vitest';
import { detectInvalidStatusTransition } from './detectInvalidStatusTransition';

const ctx = { orderId: 'order-1', correlationId: 'corr-1' };

describe('detectInvalidStatusTransition', () => {
  it('allows new -> prep', () => {
    expect(detectInvalidStatusTransition('new', 'prep', ctx)).toBeNull();
  });

  it('allows prep -> ready', () => {
    expect(detectInvalidStatusTransition('prep', 'ready', ctx)).toBeNull();
  });

  it('flags new -> ready as a skipped stage', () => {
    const incident = detectInvalidStatusTransition('new', 'ready', ctx);
    expect(incident).toMatchObject({
      incidentType: 'status_skipped',
      errorClass: 'functional',
      orderId: 'order-1',
      correlationIds: ['corr-1'],
      details: { fromStatus: 'new', toStatus: 'ready', expected: 'prep' },
    });
  });

  it('flags a backward transition', () => {
    const incident = detectInvalidStatusTransition('ready', 'new', ctx);
    expect(incident).not.toBeNull();
    expect(incident?.incidentType).toBe('status_skipped');
  });
});
