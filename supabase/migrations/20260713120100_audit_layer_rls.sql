-- ============================================================================
-- RLS for the audit layer.
--
-- Reading audit_command / audit_state_snapshot / audit_technical_trace /
-- incident is restricted to role = admin. Waiter and kitchen must not see
-- technical logs or incident records, even ones about their own actions.
--
-- Writing happens through SECURITY DEFINER RPCs (log_audit_command,
-- log_audit_state_snapshot, log_audit_technical_trace, log_incident) rather
-- than direct table INSERT policies: waiter/kitchen clients need to be able
-- to append audit trail entries as they act, but must never be granted
-- table-level access that would let them read or tamper with the trail.
-- ============================================================================

-- Roles (waiter/kitchen/admin) aren't wired to real Supabase Auth yet — the
-- frontend only tracks them locally. This table is the future home for that
-- mapping. Until a real signup/login flow populates it, it stays empty, so
-- audit_is_admin() safely fails closed (no matching row -> not admin) rather
-- than erroring out.
create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'waiter' check (role in ('waiter', 'kitchen', 'admin'))
);

comment on table profiles is
  'Maps an authenticated user to their KDS role (waiter/kitchen/admin). Empty until a real auth flow exists; audit_is_admin() fails closed while it is empty.';

alter table profiles enable row level security;

create policy profiles_self_select on profiles
  for select using (auth.uid() = user_id);

create or replace function audit_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where profiles.user_id = auth.uid()
      and profiles.role = 'admin'
  );
$$;

comment on function audit_is_admin() is
  'True if the current auth.uid() has role = admin in profiles. Gates all audit/incident table read policies.';

-- ---------------------------------------------------------------------------
-- Enable RLS, admin-only read (and direct-table write, for admin tooling).
-- ---------------------------------------------------------------------------

alter table audit_command enable row level security;
alter table audit_state_snapshot enable row level security;
alter table audit_technical_trace enable row level security;
alter table incident enable row level security;

create policy audit_command_admin_select on audit_command
  for select using (audit_is_admin());
create policy audit_command_admin_write on audit_command
  for insert with check (audit_is_admin());
create policy audit_command_admin_update on audit_command
  for update using (audit_is_admin());

create policy audit_state_snapshot_admin_select on audit_state_snapshot
  for select using (audit_is_admin());
create policy audit_state_snapshot_admin_write on audit_state_snapshot
  for insert with check (audit_is_admin());
create policy audit_state_snapshot_admin_update on audit_state_snapshot
  for update using (audit_is_admin());

create policy audit_technical_trace_admin_select on audit_technical_trace
  for select using (audit_is_admin());
create policy audit_technical_trace_admin_write on audit_technical_trace
  for insert with check (audit_is_admin());
create policy audit_technical_trace_admin_update on audit_technical_trace
  for update using (audit_is_admin());

create policy incident_admin_select on incident
  for select using (audit_is_admin());
create policy incident_admin_write on incident
  for insert with check (audit_is_admin());
create policy incident_admin_update on incident
  for update using (audit_is_admin());

-- ---------------------------------------------------------------------------
-- Write RPCs: callable by any authenticated role (waiter/kitchen/admin),
-- run as the function owner so they bypass the admin-only RLS above.
-- They return only the new row id, never the row contents, so a
-- non-admin caller cannot use the RPC response to read audit data back.
-- ---------------------------------------------------------------------------

create or replace function log_audit_command(
  p_correlation_id uuid,
  p_actor_role audit_actor_role,
  p_actor_id uuid,
  p_action_type text,
  p_target_order_id uuid,
  p_client_state_version timestamptz,
  p_source audit_command_source,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into audit_command (
    correlation_id, actor_role, actor_id, action_type, target_order_id,
    client_state_version, source, payload
  ) values (
    p_correlation_id, p_actor_role, p_actor_id, p_action_type, p_target_order_id,
    p_client_state_version, p_source, p_payload
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function log_audit_command is
  'Write-only entry point for recording a command. Runs as definer to bypass the admin-only RLS on audit_command.';

grant execute on function log_audit_command to authenticated;

create or replace function log_audit_state_snapshot(
  p_correlation_id uuid,
  p_order_id uuid,
  p_snapshot_source audit_snapshot_source,
  p_session_id uuid,
  p_status text,
  p_state_version timestamptz,
  p_state_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into audit_state_snapshot (
    correlation_id, order_id, snapshot_source, session_id, status,
    state_version, state_payload
  ) values (
    p_correlation_id, p_order_id, p_snapshot_source, p_session_id, p_status,
    p_state_version, p_state_payload
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function log_audit_state_snapshot is
  'Write-only entry point for recording a state snapshot. Runs as definer to bypass the admin-only RLS on audit_state_snapshot.';

grant execute on function log_audit_state_snapshot to authenticated;

create or replace function log_audit_technical_trace(
  p_correlation_id uuid,
  p_layer audit_trace_layer,
  p_endpoint text,
  p_function_name text,
  p_query_text text,
  p_event_timestamp timestamptz,
  p_received_timestamp timestamptz,
  p_duration_ms integer,
  p_status audit_trace_status,
  p_error_message text default null,
  p_error_stack text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into audit_technical_trace (
    correlation_id, layer, endpoint, function_name, query_text,
    event_timestamp, received_timestamp, duration_ms, status,
    error_message, error_stack
  ) values (
    p_correlation_id, p_layer, p_endpoint, p_function_name, p_query_text,
    p_event_timestamp, p_received_timestamp, p_duration_ms, p_status,
    p_error_message, p_error_stack
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function log_audit_technical_trace is
  'Write-only entry point for recording a technical trace entry. Runs as definer to bypass the admin-only RLS on audit_technical_trace.';

grant execute on function log_audit_technical_trace to authenticated;

create or replace function log_incident(
  p_correlation_ids uuid[],
  p_detector_name text,
  p_incident_type incident_type,
  p_error_class incident_error_class,
  p_severity incident_severity,
  p_order_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into incident (
    correlation_ids, detector_name, incident_type, error_class, severity, order_id, details
  ) values (
    p_correlation_ids, p_detector_name, p_incident_type, p_error_class, p_severity, p_order_id, p_details
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function log_incident is
  'Write-only entry point for recording a detector finding. Runs as definer to bypass the admin-only RLS on incident. NOTE: today this is callable by any authenticated client because detectors run client-side; once a server-side detector runner exists, tighten this grant to that service role only.';

grant execute on function log_incident to authenticated;
