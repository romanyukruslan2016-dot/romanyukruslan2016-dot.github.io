import type { IncidentDraft } from '../../../types/audit';

interface LatencyContext {
  orderId: string | null;
  correlationId: string;
}

const DEFAULT_THRESHOLD_MS = 2000;

// Scenario 5: a realtime event arrived later than an explicit threshold
// after it actually happened (event_timestamp vs received_timestamp).
export function detectRealtimeLatency(
  eventTimestamp: string,
  receivedTimestamp: string,
  context: LatencyContext,
  thresholdMs: number = DEFAULT_THRESHOLD_MS,
): IncidentDraft | null {
  const diff = new Date(receivedTimestamp).getTime() - new Date(eventTimestamp).getTime();
  if (diff <= thresholdMs) return null;

  return {
    correlationIds: [context.correlationId],
    detectorName: 'detectRealtimeLatency',
    incidentType: 'realtime_latency',
    errorClass: 'temporal_latency',
    severity: diff > thresholdMs * 2 ? 'high' : 'medium',
    orderId: context.orderId,
    details: { eventTimestamp, receivedTimestamp, thresholdMs, diffMs: diff },
  };
}
