# Migration Rollback Scripts

## Execution Order

Rollback scripts MUST be executed in **reverse** order of the forward migration sequence.
The most recently applied migration is rolled back first, and `000_profiles_core` is rolled back last.

| # | Rollback Script | Dependency |
|---|----------------|------------|
| 1 | `rollback_20260520054101_add_is_deleted_to_profiles.sql` | Independently reversible |
| 2 | `rollback_013_refresh_mv_function.sql` | Independently reversible |
| 3 | `rollback_012_ai_usage_status_error.sql` | Independently reversible |
| 4 | `rollback_011_materialized_view_dashboard.sql` | Requires prior rollback of [013] |
| 5 | `rollback_010_activity_logs_index.sql` | Independently reversible |
| 6 | `rollback_009_storage_rls_policies.sql` | Independently reversible |
| 7 | `rollback_008_profile_admin_policies.sql` | Independently reversible |
| 8 | `rollback_007_report_archives.sql` | Independently reversible |
| 9 | `rollback_006_create_user_settings.sql` | Independently reversible |
| 10 | `rollback_005_carbon_copy_parity.sql` | Independently reversible |
| 11 | `rollback_004_admin_core.sql` | Independently reversible |
| 12 | `rollback_003_telefun_core.sql` | Requires prior rollback of [005] |
| 13 | `rollback_002_ketik_pdkt_core.sql` | Requires prior rollback of [003, 005] |
| 14 | `rollback_001_sidak_core.sql` | Requires prior rollback of [011] |
| 15 | `rollback_000_profiles_core.sql` | Requires prior rollback of [001, 002, 003, 004, 005, 006, 007, 008] |

## Usage

```bash
# Execute a single rollback (example: rollback migration 013)
psql "$DATABASE_URL" -f supabase/rollbacks/rollback_013_refresh_mv_function.sql

# Execute all rollbacks in order (CAUTION: destroys all application data)
for f in \
  rollback_20260520054101_add_is_deleted_to_profiles.sql \
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
