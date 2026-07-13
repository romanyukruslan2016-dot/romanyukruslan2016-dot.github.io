import type { IncidentDraft } from '../../../types/audit';

interface StaleStateContext {
  orderId: string;
  correlationId?: string;
}

const DEFAULT_EPSILON_MS = 0;

// Scenario 6: the user is looking at an outdated state — the local
// state_version is older than the server's by more than a small epsilon
// (clock/round-trip tolerance).
export function detectStaleClientState(
  localStateVersion: string,
  serverStateVersion: string,
  context: StaleStateContext,
  epsilonMs: number = DEFAULT_EPSILON_MS,
): IncidentDraft | null {
  const diff = new Date(serverStateVersion).getTime() - new Date(localStateVersion).getTime();
  if (diff <= epsilonMs) return null;

  return {
    correlationIds: context.correlationId ? [context.correlationId] : [],
    detectorName: 'detectStaleClientState',
    incidentType: 'stale_client_state',
    errorClass: 'version_conflict',
    severity: 'medium',
    orderId: context.orderId,
    details: { localStateVersion, serverStateVersion, epsilonMs, diffMs: diff },
  };
}
