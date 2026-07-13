-- ============================================================================
-- Audit layer: Command / State Snapshot / Technical Trace / Incident.
--
-- Adds a correlation_id to the existing business event table
-- (order_status_history) and creates the audit tables that let a reliability
-- engineer answer in seconds: what happened, when, who/what triggered it,
-- was it a user action or a technical failure, and how to recover.
--
-- Assumes orders, order_items, order_modifiers, kitchen_stations and
-- order_status_history already exist in this project — they are not
-- redefined here.
-- ============================================================================

-- order_status_history columns: id, order_id, from_status, to_status, changed_at.
alter table order_status_history
  add column if not exists correlation_id uuid;

create index if not exists idx_order_status_history_correlation_id
  on order_status_history (correlation_id);

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type audit_actor_role as enum ('waiter', 'kitchen', 'admin', 'system');
create type audit_command_source as enum ('ui', 'api', 'demo_engine', 'system_auto');
create type audit_snapshot_source as enum ('db', 'ui', 'realtime');
create type audit_trace_layer as enum ('api', 'db', 'realtime', 'ui');
create type audit_trace_status as enum ('ok', 'error', 'timeout');

create type incident_type as enum (
  'order_disappeared',
  'status_skipped',
  'column_mismatch',
  'duplicate_status_change',
  'realtime_latency',
  'stale_client_state',
  'cross_session_mismatch'
);

-- Error classification (task section 3): assigned by detectors when they
-- open an incident.
create type incident_error_class as enum (
  'syntactic',
  'functional',
  'semantic',
  'temporal_latency',
  'version_conflict'
);

create type incident_severity as enum ('low', 'medium', 'high', 'critical');
create type incident_status as enum ('open', 'investigating', 'resolved', 'false_positive');

-- ---------------------------------------------------------------------------
-- audit_command: who initiated what action, against which state version.
-- ---------------------------------------------------------------------------
create table audit_command (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  actor_role audit_actor_role not null,
  actor_id uuid references auth.users (id),
  action_type text not null,
  target_order_id uuid references orders (id),
  client_state_version timestamptz,
  requested_at timestamptz not null default now(),
  source audit_command_source not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table audit_command is
  'Every order-affecting command: who/what triggered it, which action, and the client-side state version it believed was current. Used to reconstruct intent and to detect stale-state conflicts.';

create index idx_audit_command_correlation_id on audit_command (correlation_id);
create index idx_audit_command_target_order_id on audit_command (target_order_id);

-- ---------------------------------------------------------------------------
-- audit_state_snapshot: order state as observed by a given source/session.
-- ---------------------------------------------------------------------------
create table audit_state_snapshot (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid,
  order_id uuid not null references orders (id),
  snapshot_source audit_snapshot_source not null,
  session_id uuid,
  status text not null,
  state_version timestamptz not null,
  state_payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

comment on table audit_state_snapshot is
  'Point-in-time order state as seen by the DB, a UI session, or the realtime channel, tagged with the observing session_id. Used to detect missing orders, column/status mismatches, stale client state, and cross-session divergence.';

create index idx_audit_state_snapshot_correlation_id on audit_state_snapshot (correlation_id);
create index idx_audit_state_snapshot_order_session on audit_state_snapshot (order_id, session_id, captured_at);

-- ---------------------------------------------------------------------------
-- audit_technical_trace: execution trace. This is the "Log" entity from the
-- Order Event / Log / Incident separation principle.
-- ---------------------------------------------------------------------------
create table audit_technical_trace (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  layer audit_trace_layer not null,
  endpoint text,
  function_name text,
  query_text text,
  event_timestamp timestamptz not null,
  received_timestamp timestamptz,
  duration_ms integer,
  status audit_trace_status not null default 'ok',
  error_message text,
  error_stack text,
  created_at timestamptz not null default now()
);

comment on table audit_technical_trace is
  'Technical execution trace per layer (api/db/realtime/ui): endpoint, function, query, timing and error detail. Read by developers/system only. Used to pinpoint where a failure occurred and to measure realtime delivery latency (event_timestamp vs received_timestamp).';

create index idx_audit_technical_trace_correlation_id on audit_technical_trace (correlation_id);
create index idx_audit_technical_trace_layer on audit_technical_trace (layer, status);

-- ---------------------------------------------------------------------------
-- incident: detected anomaly requiring reliability/admin attention.
-- ---------------------------------------------------------------------------
create table incident (
  id uuid primary key default gen_random_uuid(),
  correlation_ids uuid[] not null default '{}'::uuid[],
  detector_name text not null,
  incident_type incident_type not null,
  error_class incident_error_class not null,
  severity incident_severity not null default 'medium',
  status incident_status not null default 'open',
  order_id uuid references orders (id),
  detected_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id),
  resolution_notes text
);

comment on table incident is
  'A detected anomaly (raised by one of the 7 reliability detectors): type, severity, error classification and investigation status. Never exposed to waiter or kitchen roles, even for incidents about their own actions.';

create index idx_incident_correlation_ids on incident using gin (correlation_ids);
create index idx_incident_order_id on incident (order_id);
create index idx_incident_status_severity on incident (status, severity);
create index idx_incident_detected_at on incident (detected_at desc);

-- ---------------------------------------------------------------------------
-- correlation_chain_view: full path of one change across all layers.
-- Not a stored table — a read model joined by correlation_id, ordered by
-- time, so a single query reconstructs command -> business event ->
-- snapshot -> technical trace -> resulting incident.
-- ---------------------------------------------------------------------------
create or replace view correlation_chain_view as
select
  c.correlation_id,
  c.requested_at as occurred_at,
  'command'::text as entity,
  c.actor_role::text as actor_role,
  c.target_order_id as order_id,
  jsonb_build_object('action_type', c.action_type, 'source', c.source, 'actor_id', c.actor_id) as summary
from audit_command c

union all

select
  h.correlation_id,
  h.changed_at as occurred_at,
  'order_event'::text as entity,
  null as actor_role,
  h.order_id,
  jsonb_build_object('from_status', h.from_status, 'to_status', h.to_status) as summary
from order_status_history h
where h.correlation_id is not null

union all

select
  s.correlation_id,
  s.captured_at as occurred_at,
  'state_snapshot'::text as entity,
  null as actor_role,
  s.order_id,
  jsonb_build_object('snapshot_source', s.snapshot_source, 'session_id', s.session_id, 'status', s.status) as summary
from audit_state_snapshot s
where s.correlation_id is not null

union all

select
  t.correlation_id,
  t.event_timestamp as occurred_at,
  'technical_trace'::text as entity,
  null as actor_role,
  null as order_id,
  jsonb_build_object(
    'layer', t.layer,
    'endpoint', t.endpoint,
    'function_name', t.function_name,
    'status', t.status,
    'error_message', t.error_message
  ) as summary
from audit_technical_trace t

union all

select
  unnest(i.correlation_ids) as correlation_id,
  i.detected_at as occurred_at,
  'incident'::text as entity,
  null as actor_role,
  i.order_id,
  jsonb_build_object(
    'incident_type', i.incident_type,
    'error_class', i.error_class,
    'severity', i.severity,
    'status', i.status
  ) as summary
from incident i

order by occurred_at;

comment on view correlation_chain_view is
  'Reconstructs the full path of a single change (one correlation_id) across command, business event, state snapshot, technical trace and any resulting incident, ordered by time.';
