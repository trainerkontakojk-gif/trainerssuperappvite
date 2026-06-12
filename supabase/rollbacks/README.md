# Migration Rollback Scripts

## Execution Order

Rollback scripts MUST be executed in **reverse** order of the forward migration sequence.
The most recently applied migration is rolled back first, and `000_profiles_core` is rolled back last.

| #  | Rollback Script                                                              | Dependency                                                             |
| -- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1  | `rollback_20260612000000_fix_profiles_rls_recursion.sql`                     | Independently reversible                                               |
| 2  | `rollback_20260611201000_telefun_scoring_retry_queue.sql`                    | Independently reversible                                               |
| 3  | `rollback_20260611200000_telefun_scoring_lifecycle.sql`                      | Independently reversible                                               |
| 4  | `rollback_20260611100000_fix_telefun_coaching_summary_rpc_contract.sql`      | Requires prior rollback of [19] (20260523000000)                       |
| 5  | `rollback_20260605100000_atomic_monitoring_history_delete.sql`               | Independently reversible                                               |
| 6  | `rollback_20260604100000_restore_profiler_foto_bucket.sql`                   | Independently reversible                                               |
| 7  | `rollback_20260603100000_pdkt_fix_soft_delete_rpc.sql`                       | Fixes `soft_delete_pdkt_mailbox_item` with `COALESCE`. Reverting #8 also reverts this. |
| 8  | `rollback_20260603090000_pdkt_shared_mailbox_policy.sql`                     | Restores pre-shared PDKT mailbox policy/RPC behavior                   |
| 9  | `rollback_20260602000000_fix_bulk_reorder_profiler_peserta_auth.sql`         | Requires prior rollback of [34] (005)                                  |
| 10 | `rollback_20260527000002_add_unique_index_ketik_review_jobs_session_id.sql`                                                | Independently reversible                                               |
| 11 | `rollback_20260527000001_add_simulation_duration_to_ketik_history.sql`       | Independently reversible                                               |
| 12 | `rollback_20260527000000_add_unique_index_qa_temuan_duplicate_input.sql`                                                | Independently reversible                                               |
| 13 | `rollback_20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql` | Requires prior rollback of [17] (20260525000200)                   |
| 14 | `rollback_20260525000500_telefun_history_add_metadata_columns.sql`           | Requires prior rollback of [19] (20260523000000)                       |
| 15 | `rollback_20260525000400_telefun_history_add_feedback.sql`                   | Independently reversible                                               |
| 16 | `rollback_20260525000300_telefun_history_add_consumer_contact_columns.sql`   | Requires prior rollback of [19] (20260523000000)                       |
| 17 | `rollback_20260525000200_restore_mv_qa_period_summary_contract.sql`          | Independently reversible                                               |
| 18 | `rollback_20260525000100_sidak_dashboard_summary_vite_schema_refresh.sql`    | Independently reversible                                               |
| 19 | `rollback_20260523000000_telefun_parity_extensions.sql`                      | ⚠️ DATA LOSS: drops telefun_coaching_summary + telefun_replay_annotations tables |
| 20 | `rollback_20260522093000_profiler_unique_constraints.sql`                    | Independently reversible                                               |
| 21 | `rollback_20260520054101_add_is_deleted_to_profiles.sql`                     | Independently reversible                                               |
| 22 | `rollback_017_harden_mv_qa_period_summary.sql`                               | Independently reversible                                               |
| 23 | `rollback_016_harden_profiles_rls.sql`                                       | Restores pre-016 policies and `UPDATE (role, is_deleted)` grants from [31] |
| 24 | `rollback_015_tighten_sidak_rls.sql`                                         | Independently reversible                                               |
| 25 | `rollback_014_storage_buckets.sql`                                           | Removes `foto-avatar` and `export-reports`; buckets must be empty first |
| 26 | `rollback_013_refresh_mv_function.sql`                                       | Independently reversible                                               |
| 27 | `rollback_012_ai_usage_status_error.sql`                                     | Independently reversible                                               |
| 28 | `rollback_011_materialized_view_dashboard.sql`                               | Requires prior rollback of [26] (013)                                  |
| 29 | `rollback_010_activity_logs_index.sql`                                       | Independently reversible                                               |
| 30 | `rollback_009_storage_rls_policies.sql`                                      | Independently reversible                                               |
| 31 | `rollback_008_profile_admin_policies.sql`                                    | Independently reversible                                               |
| 32 | `rollback_007_report_archives.sql`                                           | Independently reversible                                               |
| 33 | `rollback_006_create_user_settings.sql`                                      | Independently reversible                                               |
| 34 | `rollback_005_carbon_copy_parity.sql`                                        | Independently reversible                                               |
| 35 | `rollback_004_admin_core.sql`                                                | Independently reversible                                               |
| 36 | `rollback_003_telefun_core.sql`                                              | Requires prior rollback of [34] (005)                                  |
| 37 | `rollback_002_ketik_pdkt_core.sql`                                           | Requires prior rollback of [34, 36] (005, 003)                         |
| 38 | `rollback_001_sidak_core.sql`                                                | Requires prior rollback of [28] (011)                                  |
| 39 | `rollback_000_profiles_core.sql`                                             | Requires prior rollback of [32, 33, 34, 35, 36, 37, 38, 31] (007-001, 008) |

## Usage

```bash
# Execute a single rollback (example: rollback migration 013)
psql "$DATABASE_URL" -f supabase/rollbacks/rollback_013_refresh_mv_function.sql

# Execute the 18 latest rollbacks (from 20260612000000 → 20260520054101)
for f in \
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
