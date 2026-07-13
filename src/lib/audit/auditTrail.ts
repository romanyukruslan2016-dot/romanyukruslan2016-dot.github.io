import { supabase, DEMO_MODE } from '../supabase';
import type {
  ActorRole,
  AuditCommand,
  CommandSource,
  IncidentDraft,
  IncidentRecord,
  SnapshotSource,
  StateSnapshot,
  TechnicalTrace,
  TraceLayer,
  TraceStatus,
} from '../../types/audit';

// In-memory mirror of the audit_command / audit_state_snapshot /
// audit_technical_trace / incident tables. In demo mode (no Supabase
// project configured) this is the only place the audit trail lives; when a
// real project is configured, every record is also pushed through the
// log_audit_* / log_incident RPCs (supabase/migrations/20260713120100_audit_layer_rls.sql)
// so the trail lands in Postgres, respecting the admin-only RLS on reads.

let commands: AuditCommand[] = [];
let stateSnapshots: StateSnapshot[] = [];
let technicalTraces: TechnicalTrace[] = [];
let incidents: IncidentRecord[] = [];

let commandCounter = 0;
let snapshotCounter = 0;
let traceCounter = 0;
let incidentCounter = 0;

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

function reportRpcFailure(rpcName: string, error: { message: string }): void {
  console.error(`${rpcName} failed`, error.message);
}

export function recordCommand(input: {
  correlationId: string;
  actorRole: ActorRole;
  actorId?: string | null;
  actionType: string;
  targetOrderId?: string | null;
  clientStateVersion?: string | null;
  source: CommandSource;
  payload?: Record<string, unknown>;
}): AuditCommand {
  const command: AuditCommand = {
    id: `cmd-${++commandCounter}`,
    correlationId: input.correlationId,
    actorRole: input.actorRole,
    actorId: input.actorId ?? null,
    actionType: input.actionType,
    targetOrderId: input.targetOrderId ?? null,
    clientStateVersion: input.clientStateVersion ?? null,
    requestedAt: new Date().toISOString(),
    source: input.source,
    payload: input.payload ?? {},
  };
  commands = [...commands, command];

  if (!DEMO_MODE) {
    void supabase
      .rpc('log_audit_command', {
        p_correlation_id: command.correlationId,
        p_actor_role: command.actorRole,
        p_actor_id: command.actorId,
        p_action_type: command.actionType,
        p_target_order_id: command.targetOrderId,
        p_client_state_version: command.clientStateVersion,
        p_source: command.source,
        p_payload: command.payload,
      })
      .then(({ error }) => {
        if (error) reportRpcFailure('log_audit_command', error);
      });
  }

  return command;
}

export function recordStateSnapshot(input: {
  correlationId?: string | null;
  orderId: string;
  snapshotSource: SnapshotSource;
  sessionId?: string | null;
  status: string;
  stateVersion: string;
  statePayload?: Record<string, unknown>;
}): StateSnapshot {
  const snapshot: StateSnapshot = {
    id: `snap-${++snapshotCounter}`,
    correlationId: input.correlationId ?? null,
    orderId: input.orderId,
    snapshotSource: input.snapshotSource,
    sessionId: input.sessionId ?? null,
    status: input.status,
    stateVersion: input.stateVersion,
    statePayload: input.statePayload ?? {},
    capturedAt: new Date().toISOString(),
  };
  stateSnapshots = [...stateSnapshots, snapshot];

  if (!DEMO_MODE) {
    void supabase
      .rpc('log_audit_state_snapshot', {
        p_correlation_id: snapshot.correlationId,
        p_order_id: snapshot.orderId,
        p_snapshot_source: snapshot.snapshotSource,
        p_session_id: snapshot.sessionId,
        p_status: snapshot.status,
        p_state_version: snapshot.stateVersion,
        p_state_payload: snapshot.statePayload,
      })
      .then(({ error }) => {
        if (error) reportRpcFailure('log_audit_state_snapshot', error);
      });
  }

  return snapshot;
}

export function recordTechnicalTrace(input: {
  correlationId: string;
  layer: TraceLayer;
  endpoint?: string | null;
  functionName?: string | null;
  queryText?: string | null;
  eventTimestamp: string;
  receivedTimestamp?: string | null;
  durationMs?: number | null;
  status: TraceStatus;
  errorMessage?: string | null;
  errorStack?: string | null;
}): TechnicalTrace {
  const trace: TechnicalTrace = {
    id: `trace-${++traceCounter}`,
    correlationId: input.correlationId,
    layer: input.layer,
    endpoint: input.endpoint ?? null,
    functionName: input.functionName ?? null,
    queryText: input.queryText ?? null,
    eventTimestamp: input.eventTimestamp,
    receivedTimestamp: input.receivedTimestamp ?? null,
    durationMs: input.durationMs ?? null,
    status: input.status,
    errorMessage: input.errorMessage ?? null,
    errorStack: input.errorStack ?? null,
  };
  technicalTraces = [...technicalTraces, trace];

  if (!DEMO_MODE) {
    void supabase
      .rpc('log_audit_technical_trace', {
        p_correlation_id: trace.correlationId,
        p_layer: trace.layer,
        p_endpoint: trace.endpoint,
        p_function_name: trace.functionName,
        p_query_text: trace.queryText,
        p_event_timestamp: trace.eventTimestamp,
        p_received_timestamp: trace.receivedTimestamp,
        p_duration_ms: trace.durationMs,
        p_status: trace.status,
        p_error_message: trace.errorMessage,
        p_error_stack: trace.errorStack,
      })
      .then(({ error }) => {
        if (error) reportRpcFailure('log_audit_technical_trace', error);
      });
  }

  return trace;
}

export function recordIncident(draft: IncidentDraft): IncidentRecord {
  const incident: IncidentRecord = {
    ...draft,
    id: `incident-${++incidentCounter}`,
    status: 'open',
    detectedAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
  };
  incidents = [...incidents, incident];

  if (!DEMO_MODE) {
    void supabase
      .rpc('log_incident', {
        p_correlation_ids: incident.correlationIds,
        p_detector_name: incident.detectorName,
        p_incident_type: incident.incidentType,
        p_error_class: incident.errorClass,
        p_severity: incident.severity,
        p_order_id: incident.orderId,
        p_details: incident.details,
      })
      .then(({ error }) => {
        if (error) reportRpcFailure('log_incident', error);
      });
  }

  return incident;
}

// Resolving an incident from here only updates the local mirror: the
// incident table's RLS only allows admin to UPDATE directly, and no RPC for
// that was requested — this demo panel plays the role of the investigating
// operator applying a fix, not of the admin closing the paper trail.
export function resolveIncidentLocally(incidentId: string, resolutionNotes: string): void {
  incidents = incidents.map((incident) =>
    incident.id === incidentId
      ? { ...incident, status: 'resolved', resolvedAt: new Date().toISOString(), resolutionNotes }
      : incident,
  );
}

export function getIncidents(): IncidentRecord[] {
  return incidents;
}

export function getAuditTrailSnapshot() {
  return { commands, stateSnapshots, technicalTraces, incidents };
}
