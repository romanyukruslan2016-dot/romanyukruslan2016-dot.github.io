import { describe, expect, it } from 'vitest';
import { detectColumnMismatch } from './detectColumnMismatch';

describe('detectColumnMismatch', () => {
  it('returns null when DB status matches UI column', () => {
    expect(detectColumnMismatch('prep', 'prep', { orderId: 'o1' })).toBeNull();
  });

  it('flags a mismatch between DB status and UI column', () => {
    const incident = detectColumnMismatch('ready', 'prep', { orderId: 'o1', correlationId: 'c1' });
    expect(incident).toMatchObject({
      incidentType: 'column_mismatch',
      errorClass: 'semantic',
      orderId: 'o1',
      correlationIds: ['c1'],
      details: { dbStatus: 'ready', uiColumn: 'prep' },
    });
  });

  it('defaults correlationIds to empty array when none is given', () => {
    const incident = detectColumnMismatch('ready', 'prep', { orderId: 'o1' });
    expect(incident?.correlationIds).toEqual([]);
  });
});
