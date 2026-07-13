import type { IncidentDraft } from '../../../types/audit';

// Scenario 1: an order exists in the DB but is missing from the UI state
// (or vice versa). Compares the two id sets and raises one incident per
// order that only appears on one side.
export function detectMissingOrders(dbOrderIds: string[], uiOrderIds: string[]): IncidentDraft[] {
  const dbSet = new Set(dbOrderIds);
  const uiSet = new Set(uiOrderIds);
  const incidents: IncidentDraft[] = [];

  for (const orderId of dbSet) {
    if (!uiSet.has(orderId)) {
      incidents.push({
        correlationIds: [],
        detectorName: 'detectMissingOrders',
        incidentType: 'order_disappeared',
        errorClass: 'semantic',
        severity: 'high',
        orderId,
        details: { direction: 'missing_from_ui', dbOrderIds, uiOrderIds },
      });
    }
  }

  for (const orderId of uiSet) {
    if (!dbSet.has(orderId)) {
      incidents.push({
        correlationIds: [],
        detectorName: 'detectMissingOrders',
        incidentType: 'order_disappeared',
        errorClass: 'semantic',
        severity: 'high',
        orderId,
        details: { direction: 'missing_from_db', dbOrderIds, uiOrderIds },
      });
    }
  }

  return incidents;
}
