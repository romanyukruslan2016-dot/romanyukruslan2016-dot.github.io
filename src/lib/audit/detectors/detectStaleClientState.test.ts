import { describe, expect, it } from 'vitest';
import { detectStaleClientState } from './detectStaleClientState';

const ctx = { orderId: 'o1', correlationId: 'c1' };

describe('detectStaleClientState', () => {
  it('returns null when local state matches server state', () => {
    const version = '2026-07-13T12:00:00.000Z';
    expect(detectStaleClientState(version, version, ctx)).toBeNull();
  });

  it('returns null when local state is newer than server (clock skew, not stale)', () => {
    expect(
      detectStaleClientState('2026-07-13T12:00:01.000Z', '2026-07-13T12:00:00.000Z', ctx),
    ).toBeNull();
  });

  it('flags a client showing an older version than the server', () => {
    const incident = detectStaleClientState(
      '2026-07-13T12:00:00.000Z',
      '2026-07-13T12:00:05.000Z',
      ctx,
    );
    expect(incident).toMatchObject({
      incidentType: 'stale_client_state',
      errorClass: 'version_conflict',
      orderId: 'o1',
      details: { diffMs: 5000 },
    });
  });

  it('respects a custom epsilon tolerance', () => {
    const local = '2026-07-13T12:00:00.000Z';
    const server = '2026-07-13T12:00:00.500Z';
    expect(detectStaleClientState(local, server, ctx, 1000)).toBeNull();
    expect(detectStaleClientState(local, server, ctx, 100)).not.toBeNull();
  });
});
