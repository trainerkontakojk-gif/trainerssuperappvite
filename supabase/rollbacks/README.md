# Migration Rollback Scripts

## Execution Order

Rollback scripts MUST be executed in **reverse** order of the forward migration sequence.
The most recently applied migration is rolled back first, and `000_profiles_core` is rolled back last.

| #  | Rollback Script                                                              | Dependency                                                             |
| -- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| New | `rollback_20261020170000_ketik_history_consumer_nik_email.sql` | DATA LOSS: restores finish/history pagination RPCs then drops stored NIK/email; revert the API and web first |
| New | `rollback_20261020160000_ketik_durable_agent_messages.sql` | DATA LOSS: drops the response ledger and agent context counter, so a discarded/retried AI reply is no longer visible; finish active KETIK sessions and revert the API first |
| New | `rollback_20261020090000_access_groups_view_security_invoker.sql` | No data loss: reopens every access group to any signed-in user; the API reads the view as service_role and is unaffected |
| New | `rollback_20261018210000_account_active_until.sql` | DATA LOSS: drops every account end date (accounts become unlimited); revert API and web first |
| New | `rollback_20261018200000_user_controls.sql` | Loses the per-session KETIK re-score counts (agents could re-score again); revert the API first |
| New | `rollback_20261018190000_practice_today_summary.sql` | No data loss: drops the today summary for the Batas latihan page; revert the API first |
| New | `rollback_20261018170000_practice_quota_status.sql` | No data loss: drops the quota status and limit helpers, restores the earlier consume function; revert the API first |
| New | `rollback_20261018150000_practice_quota.sql` | DATA LOSS: drops practice limit rules, overrides and usage; SECURITY: restores owner writes on telefun_history; revert API and Telefun first |
| New | `rollback_20261018130000_profiler_peserta_akun_link.sql` | DATA LOSS: drops account-to-participant links and log targets; revert the API first |
| New | `rollback_20261016153729_pdkt_history_integrity_privacy.sql` | SECURITY: restores owner inserts and private JSON reads; projected API remains compatible; no data loss |
| New | `rollback_20261013120000_pdkt_mailbox_hide_snapshot_columns.sql`             | SECURITY: re-exposes PDKT scenario answer key and consumer character to every authenticated user |
| New | `rollback_20261012150000_tna_need_previous_plan.sql` | Restore guard-first Phase 1 need writer; preserve existing links/data; disable API link feature first; apply before Phase 2 foundation rollback |
| New | `rollback_20261011130000_tna_phase2_evaluation.sql` | Fails closed if evaluation, cancellation, participant-session, or predecessor-link data exists; restore Phase 1 RPC/trigger behavior only when reversible |
| New | `rollback_20261010120000_add_telefun_coaching_summary_annotation_columns.sql` | No-op by design: production had these columns before the migration; never drop them |
| Latest | `rollback_20260622150000_repair_telefun_scoring_lifecycle_contract.sql`  | DATA LOSS: revert API and back up scoring data first                    |
| 1  | `rollback_20260619090000_telefun_live_per_minute_billing.sql`                | Restores pre-per-minute billing view, then drops nullable Telefun billing columns. |
| 2  | `rollback_20260612000000_fix_profiles_rls_recursion.sql`                     | Independently reversible                                               |
| 3  | `rollback_20260611201000_telefun_scoring_retry_queue.sql`                    | Independently reversible                                               |
| 4  | `rollback_20260611200000_telefun_scoring_lifecycle.sql`                      | Independently reversible                                               |
| 5  | `rollback_20260611100000_fix_telefun_coaching_summary_rpc_contract.sql`      | Requires prior rollback of [19] (20260523000000)                       |
| 6  | `rollback_20260605100000_atomic_monitoring_history_delete.sql`               | Independently reversible                                               |
| 7  | `rollback_20260604100000_restore_profiler_foto_bucket.sql`                   | Independently reversible                                               |
| 8  | `rollback_20260603100000_pdkt_fix_soft_delete_rpc.sql`                       | Fixes `soft_delete_pdkt_mailbox_item` with `COALESCE`. Reverting #8 also reverts this. |
| 9  | `rollback_20260603090000_pdkt_shared_mailbox_policy.sql`                     | Restores pre-shared PDKT mailbox policy/RPC behavior                   |
| 10 | `rollback_20260602000000_fix_bulk_reorder_profiler_peserta_auth.sql`         | Requires prior rollback of [34] (005)                                  |
| 11 | `rollback_20260527000002_add_unique_index_ketik_review_jobs_session_id.sql`                                                | Independently reversible                                               |
| 12 | `rollback_20260527000001_add_simulation_duration_to_ketik_history.sql`       | Independently reversible                                               |
| 13 | `rollback_20260527000000_add_unique_index_qa_temuan_duplicate_input.sql`                                                | Independently reversible                                               |
| 14 | `rollback_20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql` | Requires prior rollback of [17] (20260525000200)                   |
| 15 | `rollback_20260525000500_telefun_history_add_metadata_columns.sql`           | Requires prior rollback of [19] (20260523000000)                       |
| 16 | `rollback_20260525000400_telefun_history_add_feedback.sql`                   | Independently reversible                                               |
| 17 | `rollback_20260525000300_telefun_history_add_consumer_contact_columns.sql`   | Requires prior rollback of [19] (20260523000000)                       |
| 18 | `rollback_20260525000200_restore_mv_qa_period_summary_contract.sql`          | Independently reversible                                               |
| 19 | `rollback_20260525000100_sidak_dashboard_summary_vite_schema_refresh.sql`    | Independently reversible                                               |
| 20 | `rollback_20260523000000_telefun_parity_extensions.sql`                      | ⚠️ DATA LOSS: drops telefun_coaching_summary + telefun_replay_annotations tables |
| 21 | `rollback_20260522093000_profiler_unique_constraints.sql`                    | Independently reversible                                               |
| 22 | `rollback_20260520054101_add_is_deleted_to_profiles.sql`                     | Independently reversible                                               |
| 23 | `rollback_017_harden_mv_qa_period_summary.sql`                               | Independently reversible                                               |
| 24 | `rollback_016_harden_profiles_rls.sql`                                       | Restores pre-016 policies and `UPDATE (role, is_deleted)` grants from [31] |
| 25 | `rollback_015_tighten_sidak_rls.sql`                                         | Independently reversible                                               |
| 26 | `rollback_014_storage_buckets.sql`                                           | Removes `foto-avatar` and `export-reports`; buckets must be empty first |
| 27 | `rollback_013_refresh_mv_function.sql`                                       | Independently reversible                                               |
| 28 | `rollback_012_ai_usage_status_error.sql`                                     | Independently reversible                                               |
| 29 | `rollback_011_materialized_view_dashboard.sql`                               | Requires prior rollback of [26] (013)                                  |
| 30 | `rollback_010_activity_logs_index.sql`                                       | Independently reversible                                               |
| 31 | `rollback_009_storage_rls_policies.sql`                                      | Independently reversible                                               |
| 32 | `rollback_008_profile_admin_policies.sql`                                    | Independently reversible                                               |
| 33 | `rollback_007_report_archives.sql`                                           | Independently reversible                                               |
| 34 | `rollback_006_create_user_settings.sql`                                      | Independently reversible                                               |
| 35 | `rollback_005_carbon_copy_parity.sql`                                        | Independently reversible                                               |
| 36 | `rollback_004_admin_core.sql`                                                | Independently reversible                                               |
| 37 | `rollback_003_telefun_core.sql`                                              | Requires prior rollback of [34] (005)                                  |
| 38 | `rollback_002_ketik_pdkt_core.sql`                                           | Requires prior rollback of [34, 36] (005, 003)                         |
| 39 | `rollback_001_sidak_core.sql`                                                | Requires prior rollback of [28] (011)                                  |
| 40 | `rollback_000_profiles_core.sql`                                             | Requires prior rollback of [32, 33, 34, 35, 36, 37, 38, 31] (007-001, 008) |

## Usage

```bash
# Execute a single rollback (example: rollback migration 013)
psql "$DATABASE_URL" -f supabase/rollbacks/rollback_013_refresh_mv_function.sql

# Execute the 23 latest rollbacks (from 20260622150000 → 20260520054101)
for f in \
  rollback_20260622150000_repair_telefun_scoring_lifecycle_contract.sql \
  rollback_20260619090000_telefun_live_per_minute_billing.sql \
  rollback_20260612000000_fix_profiles_rls_recursion.sql \
  rollback_20260611201000_telefun_scoring_retry_queue.sql \
  rollback_20260611200000_telefun_scoring_lifecycle.sql \
  rollback_20260611100000_fix_telefun_coaching_summary_rpc_contract.sql \
  rollback_20260605100000_atomic_monitoring_history_delete.sql \
  rollback_20260604100000_restore_profiler_foto_bucket.sql \
  rollback_20260603100000_pdkt_fix_soft_delete_rpc.sql \
  rollback_20260603090000_pdkt_shared_mailbox_policy.sql \
  rollback_20260602000000_fix_bulk_reorder_profiler_peserta_auth.sql \
  rollback_20260527000002_add_unique_index_ketik_review_jobs_session_id.sql \
  rollback_20260527000001_add_simulation_duration_to_ketik_history.sql \
  rollback_20260527000000_add_unique_index_qa_temuan_duplicate_input.sql \
  rollback_20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql \
  rollback_20260525000500_telefun_history_add_metadata_columns.sql \
  rollback_20260525000400_telefun_history_add_feedback.sql \
  rollback_20260525000300_telefun_history_add_consumer_contact_columns.sql \
  rollback_20260525000200_restore_mv_qa_period_summary_contract.sql \
  rollback_20260525000100_sidak_dashboard_summary_vite_schema_refresh.sql \
  rollback_20260523000000_telefun_parity_extensions.sql \
  rollback_20260522093000_profiler_unique_constraints.sql \
  rollback_20260520054101_add_is_deleted_to_profiles.sql; do
  psql "$DATABASE_URL" -f "supabase/rollbacks/$f"
done

# Execute ALL rollbacks in order (CAUTION: destroys all application data)
for f in \
  rollback_20260622150000_repair_telefun_scoring_lifecycle_contract.sql \
  rollback_20260619090000_telefun_live_per_minute_billing.sql \
  rollback_20260612000000_fix_profiles_rls_recursion.sql \
  rollback_20260611201000_telefun_scoring_retry_queue.sql \
  rollback_20260611200000_telefun_scoring_lifecycle.sql \
  rollback_20260611100000_fix_telefun_coaching_summary_rpc_contract.sql \
  rollback_20260605100000_atomic_monitoring_history_delete.sql \
  rollback_20260604100000_restore_profiler_foto_bucket.sql \
  rollback_20260603100000_pdkt_fix_soft_delete_rpc.sql \
  rollback_20260603090000_pdkt_shared_mailbox_policy.sql \
  rollback_20260602000000_fix_bulk_reorder_profiler_peserta_auth.sql \
  rollback_20260527000002_add_unique_index_ketik_review_jobs_session_id.sql \
  rollback_20260527000001_add_simulation_duration_to_ketik_history.sql \
  rollback_20260527000000_add_unique_index_qa_temuan_duplicate_input.sql \
  rollback_20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql \
  rollback_20260525000500_telefun_history_add_metadata_columns.sql \
  rollback_20260525000400_telefun_history_add_feedback.sql \
  rollback_20260525000300_telefun_history_add_consumer_contact_columns.sql \
  rollback_20260525000200_restore_mv_qa_period_summary_contract.sql \
  rollback_20260525000100_sidak_dashboard_summary_vite_schema_refresh.sql \
  rollback_20260523000000_telefun_parity_extensions.sql \
  rollback_20260522093000_profiler_unique_constraints.sql \
  rollback_20260520054101_add_is_deleted_to_profiles.sql \
  rollback_017_harden_mv_qa_period_summary.sql \
  rollback_016_harden_profiles_rls.sql \
  rollback_015_tighten_sidak_rls.sql \
  rollback_014_storage_buckets.sql \
  rollback_013_refresh_mv_function.sql \
  rollback_012_ai_usage_status_error.sql \
  rollback_011_materialized_view_dashboard.sql \
  rollback_010_activity_logs_index.sql \
  rollback_009_storage_rls_policies.sql \
  rollback_008_profile_admin_policies.sql \
  rollback_007_report_archives.sql \
  rollback_006_create_user_settings.sql \
  rollback_005_carbon_copy_parity.sql \
  rollback_004_admin_core.sql \
  rollback_003_telefun_core.sql \
  rollback_002_ketik_pdkt_core.sql \
  rollback_001_sidak_core.sql \
  rollback_000_profiles_core.sql; do
  psql "$DATABASE_URL" -f "supabase/rollbacks/$f"
done
```

## Important Notes

- **Always back up production data** before executing any rollback script.
- Scripts with ⚠️ DATA LOSS warnings will permanently delete table data.
- Each script includes a verification query at the end to confirm successful rollback.
- Test rollbacks in a staging environment before applying to production.
- `rollback_014_storage_buckets.sql` restores the pre-migration state by deleting
  the `foto-avatar` and `export-reports` buckets. It fails without changing
  anything if either bucket still contains objects. Back up and remove those
  objects before retrying the rollback.
- `rollback_016_harden_profiles_rls.sql` does not restore broad table-level
  `UPDATE` access for `authenticated`. It revokes `UPDATE (full_name)`, restores
  `UPDATE (role, is_deleted)` from migration `008_profile_admin_policies.sql`,
  and restores the original own/admin-trainer update policies.
- `rollback_20261017090000_backfill_qa_temuan_tahun.sql` is a no-op. The
  forward migration only fills NULL `qa_temuan.tahun` from the period year;
  nulling them again would re-hide batch findings from score readers, and
  backfilled rows cannot be told apart from rows written later.
- `rollback_20261017120000_qa_temuan_fill_tahun_trigger.sql` drops
  `trg_fill_tahun` and `public.fill_tahun_from_period()`. No data loss: filled
  `tahun` values stay. On prod it also removes the trigger that existed there
  before the migration, so inserts that omit `tahun` store NULL again.
- `rollback_20261017130000_profiles_self_role_guard.sql` drops
  `guard_profile_sensitive_columns` and `prevent_self_role_status_change()`.
  No data loss. Column grants on `profiles` still block direct self-updates.
- `rollback_20261017130100_simulation_activity_log_triggers.sql` drops the
  three `on_*_history_insert` triggers and `log_*_activity()` functions.
  Logged rows stay; new simulation sessions are no longer logged.
- `rollback_20261017130200_updated_at_triggers_mailbox_review_jobs.sql` drops
  the `updated_at` triggers on `pdkt_mailbox_items` and `ketik_review_jobs`
  and `handle_pdkt_mailbox_updated_at()`. No data loss.
- `rollback_20261017130300_results_legacy_table.sql` drops `results`.
  **Data loss: local/E2E only.** On prod the table predates the repo and holds
  legacy Telefun sessions; revert its grant/policy changes by hand instead.
- `rollback_20261017150000_ketik_settle_review_drop_legacy_results.sql`
  restores the `settle_ketik_review` body that also updates `results`. No data
  loss, but with `results` present every KETIK review publish fails again.
- `rollback_20261017160000_qa_temuan_tahun_id_index.sql` drops the SIDAK
  dashboard year index. Independently reversible, no data loss.
- `rollback_20261017220000_ai_pricing_schedule.sql` drops the AI price
  schedule. DATA LOSS: schedules not yet in effect (including Gemini 3.8 Flash
  from 2027-01-01) are lost; logged costs are unchanged. API and Telefun fall
  back to current prices when the table is missing.
- `rollback_20261018090000_monitoring_sessions.sql` drops the Monitoring
  session view, its paging function and the `profiler_peserta.trainer_id`
  index. No data loss; the API falls back to reading every session.
