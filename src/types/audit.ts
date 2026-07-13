// Types mirroring the audit-layer schema (supabase/migrations/20260713120000_audit_layer_schema.sql).
// See ключовий принцип: Order Event / Log / Incident are separate entities — Log here is
// TechnicalTrace, Order Event stays in the existing order_status_history table.

export type ActorRole = 'waiter' | 'kitchen' | 'admin' | 'system';
export type CommandSource = 'ui' | 'api' | 'demo_engine' | 'system_auto';
export type SnapshotSource = 'db' | 'ui' | 'realtime';
export type TraceLayer = 'api' | 'db' | 'realtime' | 'ui';
export type TraceStatus = 'ok' | 'error' | 'timeout';

export type IncidentType =
  | 'order_disappeared'
  | 'status_skipped'
  | 'column_mismatch'
  | 'duplicate_status_change'
  | 'realtime_latency'
  | 'stale_client_state'
  | 'cross_session_mismatch';

export type ErrorClass = 'syntactic' | 'functional' | 'semantic' | 'temporal_latency' | 'version_conflict';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'false_positive';

export interface AuditCommand {
  id: string;
  correlationId: string;
  actorRole: ActorRole;
  actorId: string | null;
  actionType: string;
  targetOrderId: string | null;
  clientStateVersion: string | null;
  requestedAt: string;
  source: CommandSource;
  payload: Record<string, unknown>;
}

export interface StateSnapshot {
  id: string;
  correlationId: string | null;
  orderId: string;
  snapshotSource: SnapshotSource;
  sessionId: string | null;
  status: string;
  stateVersion: string;
  statePayload: Record<string, unknown>;
  capturedAt: string;
}

export interface TechnicalTrace {
  id: string;
  correlationId: string;
  layer: TraceLayer;
  endpoint: string | null;
  functionName: string | null;
  queryText: string | null;
  eventTimestamp: string;
  receivedTimestamp: string | null;
  durationMs: number | null;
  status: TraceStatus;
  errorMessage: string | null;
  errorStack: string | null;
}

// What a detector produces. `status` always starts 'open' and the
// resolution fields are filled in later by an admin, so drafts omit them.
export interface IncidentDraft {
  correlationIds: string[];
  detectorName: string;
  incidentType: IncidentType;
  errorClass: ErrorClass;
  severity: IncidentSeverity;
  orderId: string | null;
  details: Record<string, unknown>;
}

export interface IncidentRecord extends IncidentDraft {
  id: string;
  status: IncidentStatus;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
}

export interface CorrelationChainEntry {
  correlationId: string;
  occurredAt: string;
  entity: 'command' | 'order_event' | 'state_snapshot' | 'technical_trace' | 'incident';
  actorRole: string | null;
  orderId: string | null;
  summary: Record<string, unknown>;
}

export type PlaybookStepStatus = 'pending' | 'done';

// One step of the recovery plan shown by "Показати шлях виправлення".
// The last step of a playbook carries `action` — the actual remediation
// callback that restores correct state when the operator runs it.
export interface PlaybookStep {
  id: string;
  title: string;
  description: string;
  status: PlaybookStepStatus;
  action?: () => void;
}
