-- ============================================================================
-- Postgres grants EXECUTE to PUBLIC by default when a function is created.
-- The previous migration granted EXECUTE to `authenticated` explicitly but
-- never revoked the implicit PUBLIC grant, so the anon role could call
-- these write RPCs too (confirmed via a direct REST probe). There's no real
-- auth flow yet, so this doesn't currently open anything new — but the
-- intent was authenticated-only, so close the gap now before it's forgotten.
--
-- NOT APPLIED YET — intentionally deferred. The live demo runs entirely
-- anonymous (no login flow), so revoking PUBLIC execute now would break the
-- audit trail on the deployed demo (every recordCommand/recordStateSnapshot/
-- recordTechnicalTrace/recordIncident call in auditTrail.ts would start
-- failing with permission denied). Prepared here so it isn't forgotten.
--
-- TODO: застосувати в Модулі 4 разом із реальною автентифікацією (коли
-- з'явиться справжній Supabase Auth login flow і waiter/kitchen/admin
-- перестануть бути суто фронтендовим поняттям).
-- ============================================================================

revoke execute on function log_audit_command from public;
revoke execute on function log_audit_state_snapshot from public;
revoke execute on function log_audit_technical_trace from public;
revoke execute on function log_incident from public;
