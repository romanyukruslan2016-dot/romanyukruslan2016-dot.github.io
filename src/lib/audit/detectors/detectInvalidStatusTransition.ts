import { nextColumn, type ColumnId } from '../../../types';
import type { IncidentDraft } from '../../../types/audit';

interface TransitionContext {
  orderId: string;
  correlationId: string;
}

// Scenario 2: a status jumped a stage (e.g. New -> Ready, skipping Prep).
// Valid transitions are exactly the finite-state machine already used by
// the board (types.ts: new -> prep -> ready). Anything else — skipping
// ahead or moving backward — is flagged.
export function detectInvalidStatusTransition(
  fromStatus: ColumnId,
  toStatus: ColumnId,
  context: TransitionContext,
): IncidentDraft | null {
  const expected = nextColumn(fromStatus);
  if (toStatus === expected) return null;

  return {
    correlationIds: [context.correlationId],
    detectorName: 'detectInvalidStatusTransition',
    incidentType: 'status_skipped',
    errorClass: 'functional',
    severity: 'high',
    orderId: context.orderId,
    details: { fromStatus, toStatus, expected },
  };
}
