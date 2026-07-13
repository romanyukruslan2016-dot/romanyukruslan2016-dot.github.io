-- ============================================================================
-- The demo engine simulates orders entirely client-side and never inserts a
-- matching row into `orders` — so audit writes for demo order ids failed
-- with a foreign key violation (confirmed live: audit_state_snapshot_order_id_fkey,
-- incident_order_id_fkey, audit_command_target_order_id_fkey).
--
-- Dropping these FKs trades referential guarantees for the ability to audit
-- synthetic/demo order ids too. Once real orders always exist before audit
-- writes happen (e.g. once the demo also inserts into `orders`, or once a
-- real order-taking flow exists), consider re-adding them.
-- ============================================================================

alter table audit_command drop constraint if exists audit_command_target_order_id_fkey;
alter table audit_state_snapshot drop constraint if exists audit_state_snapshot_order_id_fkey;
alter table incident drop constraint if exists incident_order_id_fkey;
