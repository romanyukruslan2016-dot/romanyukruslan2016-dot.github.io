import { describe, expect, it } from 'vitest';
import { detectMissingOrders } from './detectMissingOrders';

describe('detectMissingOrders', () => {
  it('returns no incidents when both sides match', () => {
    expect(detectMissingOrders(['a', 'b'], ['b', 'a'])).toEqual([]);
  });

  it('flags an order present in DB but missing from UI', () => {
    const incidents = detectMissingOrders(['a', 'b'], ['a']);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      incidentType: 'order_disappeared',
      errorClass: 'semantic',
      orderId: 'b',
      details: { direction: 'missing_from_ui' },
    });
  });

  it('flags an order present in UI but missing from DB', () => {
    const incidents = detectMissingOrders(['a'], ['a', 'ghost']);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      orderId: 'ghost',
      details: { direction: 'missing_from_db' },
    });
  });
});
