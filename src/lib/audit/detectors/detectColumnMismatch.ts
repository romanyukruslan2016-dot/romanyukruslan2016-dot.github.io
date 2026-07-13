import type { IncidentDraft } from '../../../types/audit';

interface ColumnMismatchContext {
  orderId: string;
  correlationId?: string;
}

// Scenario 3: the card didn't land in the column matching its DB status —
// a direct comparison of the persisted status against what the UI renders.
export function detectColumnMismatch(
  dbStatus: string,
  uiColumn: string,
  context: ColumnMismatchContext,
): IncidentDraft | null {
  if (dbStatus === uiColumn) return null;

  return {
    correlationIds: context.correlationId ? [context.correlationId] : [],
    detectorName: 'detectColumnMismatch',
    incidentType: 'column_mismatch',
    errorClass: 'semantic',
    severity: 'medium',
    orderId: context.orderId,
    details: { dbStatus, uiColumn },
  };
}
