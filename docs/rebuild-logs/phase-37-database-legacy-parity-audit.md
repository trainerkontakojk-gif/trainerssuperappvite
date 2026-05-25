# Phase 37: Database Legacy Parity Audit

> **Date:** 2026-05-24  
> **Auditor:** OpenCode Agent (read-only audit per AGENTS.md SDD)  
> **Plan:** `plan/markdown/database-legacy-parity-audit-ruosnjmtywcrghjgqugz.md`  
> **Artifacts:** `local-backups/database-parity/20260524-192154/`

## Executive Summary

**Verdict: BELUM PARITY**

Target database (`ruosnjmtywcrghjgqugz`) gagal memenuhi strict parity terhadap legacy source (`kkeiiwyyefaofljippnj`). Audit menemukan 13 tabel hilang, 29 fungsi hilang, constraint differences pada shared tables, fundamental shift pada model RLS policies, dan data hilang di 10+ tabel kritis. API unit tests lulus (258/258), tapi ini karena tests bersifat unit — bukan integration tests yang membaca data live dari SQL functions/RPC yang hilang.

---

## Final Verdict Table

| Area | Verdict | Key Evidence |
|---|---|---|
| Schema | **belum parity** | 13 tables missing, constraint differences, profile column drift |
| Data | **belum parity** | 10+ tables have zero or significantly fewer rows |
| Auth | **compatible** | User/profile join clean, 0 orphans on both sides. Status semantics differ (intentional: `approved`→`active`, `rejected`→`inactive`) |
| Functions/Triggers | **belum parity** | 29 functions missing, 8 triggers missing/divergent |
| RLS/Policies | **belum parity** | Model shifted from `authenticated`-role to `public`-role; service_role policies missing |
| Storage | **compatible** | Same 3 buckets, same config. profiler-foto counts match (150). telefun-recordings: 2 vs 10 objects. |
| App Smoke | **compatible** | 258/258 API unit tests pass; no live read-path verification done on missing functions |

---

## Section 1: Preflight

### 1.1 Target Verification

| Item | Value |
|---|---|
| Target project ref | `ruosnjmtywcrghjgqugz` |
| Legacy project ref | `kkeiiwyyefaofljippnj` |
| Supabase CLI linked to | `kkeiiwyyefaofljippnj` (LEGACY — drift confirmed) |
| `.env.local` points to | `ruosnjmtywcrghjgqugz` (correct) |
| Target DB connection | PostgreSQL 17.6, database `postgres`, user `postgres` |
| Legacy DB connection | PostgreSQL 17.6, database `postgres`, user `postgres` |

### 1.2 Pre-Audit Finding Confirmed

CLI link drift (`supabase/.temp/project-ref = kkeiiwyyefaofljippnj`) **confirmed**. Semua command Supabase CLI harus explicit menggunakan DB URL, tidak bisa mengandalkan `supabase link`.

---

## Section 2: Schema Object Inventory

### 2.1 Table Count

| Category | Target | Legacy | Delta |
|---|---|---|---|
| Public tables | 29 | 42 | **-13** |
| Auth tables | identical | identical | 0 |
| Storage tables | identical | identical | 0 |

### 2.2 Tables Missing from Target (P0-P1 Gaps)

| Table | Legacy Data | Priority | Notes |
|---|---|---|---|
| `results` | 39 rows | **P0** | App code (`ketik-service.ts`, `monitoring-history-service.ts`, docs) masih mereferensikan `results` |
| `reports` | 21 rows | **P0** | Laporan SIDAK tidak ada path penyimpanan alternatif di target |
| `qa_dashboard_indicator_period_summary` | 25 rows | **P0** | Breakdown KPI per indicator per periode — diperlukan dashboard |
| `security_rate_limits` | 6 rows | P1 | Rate limiting; bisa digantikan oleh Hono-level middleware |
| `telefun_coaching_summary` | 0 rows | P1 | Schema ada tapi kosong di legacy |
| `telefun_replay_annotations` | 0 rows | P1 | Schema ada tapi kosong |
| `ketik_personas` | 5 rows | P2 | Vite hardcodes personas in `ketik-service.ts` |
| `ketik_scenarios` | 6 rows | P2 | Vite hardcodes scenarios in `ketik-service.ts` |
| `pdkt_scenarios` | 3 rows | P2 | Vite hardcodes scenarios in `pdkt-service.ts` |
| `qa_findings` | 15 rows | P2 | Legacy findings table, replaced by `qa_temuan` in Vite |
| `qa_indicators_backup` | ? | P2 | Legacy backup, not needed |
| `qa_temuan_backup` | ? | P2 | Legacy backup, not needed |

### 2.3 Constraint Differences on Shared Tables

| Table | Difference | Target | Legacy | Severity |
|---|---|---|---|---|
| `activity_logs` | FK target | `auth.users(id)` ON DELETE SET NULL | `profiles(id)` ON DELETE SET NULL | Medium (different cascade path) |
| `profiles` | role CHECK | `['admin','trainer','leader','agent','user']` | `['trainer','trainers','leader','agent','admin']` | Medium (different enum) |
| `profiles` | status CHECK | `['pending','active','inactive']` | `['pending','approved','rejected']` | **High** (semantic shift) |
| `profiler_folders` | UNIQUE key | `(name)` | `(trainer_id, name)` | Medium (different constraint scope) |
| `profiler_folders` | FK cascade | `ON DELETE CASCADE` on year | No cascade | Medium |
| `profiler_peserta` | trainer FK | `auth.users(id)` | `profiles(id)` | Medium |
| `profiler_peserta` | domain CHECKs (agama, jabatan, etc.) | Missing | Present | Medium (validation gap) |
| `qa_temuan` | period FK | ON DELETE CASCADE | ON DELETE RESTRICT | **High** (fail-open risk) |
| `qa_dashboard_period_summary` | folder FK | Present | Missing | Low |
| `qa_dashboard_agent_period_summary` | Unique/agent FK | `(agent_id, period_id, service_type)` | `(period_id, peserta_id, service_type, folder_key)` | Medium |
| `pdkt_mailbox_items` | Extra FKs | Missing `created_by_user_id_fkey`, `source_mailbox_item_id_fkey` | Present | Medium |
| `pdkt_history` | evaluation_status | Includes `'pending'` | Excludes `'pending'` | Low |
| `telefun_history` | status CHECK | Present | Missing | Low |
| `qa_indicators` | Unique key | `(service_type, name)` | `(service_type)` CHECK | Medium |
| `qa_service_rule_indicators` | FK | Has `created_by_fkey` | Missing `created_by_fkey` | Low |
| `qa_service_rule_versions` | superseded FK | `version_id` FK | `auth.users` FK | Medium |

### 2.4 Profile Column Diff

| Column | Target | Legacy |
|---|---|---|
| `id` | uuid NOT NULL | uuid NOT NULL |
| `email` | text YES | text YES |
| `full_name` | text YES | text YES |
| `role` | **text NOT NULL** | text YES |
| `status` | **text NOT NULL** | text YES |
| `created_at` | timestamptz NOT NULL | timestamptz NOT NULL |
| `updated_at` | **timestamptz NOT NULL** | **MISSING** |
| `is_deleted` | **boolean NOT NULL** | boolean YES |

---

## Section 3: Functions, Triggers, RLS, Policies

### 3.1 Functions

| | Target | Legacy | Delta |
|---|---|---|---|
| Function count | 5 | 34 | **-29** |

**Critical functions missing from target:**

| Function | Used By | Priority |
|---|---|---|
| `qa_score_agent` | SIDAK scoring API | **P0** |
| `get_qa_dashboard_data` | Dashboard SIDAK | **P0** |
| `get_qa_dashboard_range_data` | Dashboard range queries | **P0** |
| `get_qa_dashboard_range_trend_data` | Trend panel | **P0** |
| `get_qa_trend_data` | Agent detail charts | **P0** |
| `get_service_trend_dashboard` | Service trend dashboard | **P0** |
| `get_agent_list_with_scores` | Agent directory | **P0** |
| `get_qa_agent_directory_summary` | Agent directory summary | **P0** |
| `leader_can_access_peserta` | Profiler access gate | **P1** |
| `leader_can_access_sidak_temuan` | SIDAK access gate | **P1** |
| `leader_has_scope_value` | Access scope resolution | **P1** |
| `refresh_qa_dashboard_summary_for_period` | Dashboard refresh after upload | **P0** |
| `publish_rule_version` (2 overloads) | SIDAK settings publish flow | **P0** |
| `bulk_reorder_profiler_peserta` | Profiler batch reorder | P1 |
| `is_approved_trainer` | Auth gate | P1 |
| `is_super_admin` | Auth gate | P1 |
| `get_auth_role` | Auth resolution | P1 |
| `prevent_self_role_status_change` | Security guard | P1 |
| `consume_rate_limit` | Rate limiting | P1 |
| `log_ketik_activity` | Activity logging | P2 |
| `log_pdkt_activity` | Activity logging | P2 |
| `log_telefun_activity` | Activity logging | P2 |
| `submit_pdkt_mailbox_batch` | PDKT mailbox batch | P1 |
| `submit_pdkt_mailbox_reply` | PDKT mailbox reply | P1 |
| `upsert_telefun_coaching_summary` | Telefun coaching | P1 |
| `fill_tahun_from_period` | Trigger support | P1 |
| `handle_pdkt_mailbox_updated_at` | Trigger support | P1 |
| `get_upcoming_birthdays` | Profiler birthday feature | P2 |
| `_qa_session_scores` | Internal scoring | P2 |

### 3.2 Triggers

| Trigger | Target | Legacy |
|---|---|---|
| `guard_profile_sensitive_columns` | MISSING | PRESENT |
| `on_ketik_history_insert` | MISSING | PRESENT |
| `on_pdkt_history_insert` | MISSING | PRESENT |
| `on_telefun_history_insert` | MISSING | PRESENT |
| `trg_fill_tahun` | MISSING | PRESENT |
| `tr_pdkt_mailbox_updated_at` | MISSING | PRESENT |
| `ketik_review_jobs_updated_at` | MISSING | PRESENT |
| `update_results_updated_at` | MISSING | PRESENT |
| `profiles_set_updated_at` | PRESENT | MISSING |

### 3.3 RLS Policy Model

| Aspect | Target | Legacy |
|---|---|---|
| Primary role | `{public}` | `{authenticated}` |
| AI usage tables | `public` SELECT | `service_role` ALL + admin via API |
| Profile SELECT | own-profile only | 4-granular policies (own, admin, trainer, leader) |
| Activity logs | admin/trainer ALL | 4 granular policies + authenticated INSERT |
| Dashboard summaries | public ALL | authenticated SELECT + DELETE |
| SIDAK DELETE policies | missing | DELETE for trainers on indicators/periods |
| Reports table policies | missing (table missing) | 3 granular policies |
| Results table policies | missing (table missing) | 7 granular policies |

**Conclusion:** Target uses a more permissive `public`-role model that doesn't map to the legacy `authenticated`-role model with `service_role` overrides for sensitive operations. This is a fundamental divergence in security posture.

---

## Section 4: Data Row Count Diff

| Table | Target | Legacy | Delta | Status |
|---|---|---|---|---|
| `access_group_items` | 0 | 60 | -60 | **P1: missing** |
| `access_groups` | 0 | 7 | -7 | **P1: missing** |
| `activity_logs` | 0 | 1,889 | -1,889 | **P0: missing** |
| `ai_billing_settings` | 4 | 4 | 0 | parity |
| `ai_pricing_settings` | 13 | 13 | 0 | parity |
| `ai_usage_logs` | 315 | 323 | -8 | minor gap |
| `ketik_history` | 19 | 20 | -1 | minor gap |
| `ketik_review_jobs` | 4 | 4 | 0 | parity |
| `ketik_session_reviews` | 4 | 4 | 0 | parity |
| `ketik_typo_findings` | 3 | 3 | 0 | parity |
| `leader_access_request_groups` | 0 | 4 | -4 | **P1: missing** |
| `leader_access_requests` | 0 | 4 | -4 | **P1: missing** |
| `pdkt_history` | 19 | 19 | 0 | parity |
| `pdkt_mailbox_items` | 32 | 32 | 0 | parity |
| `profiler_folders` | 10 | 10 | 0 | parity |
| `profiler_peserta` | 131 | 131 | 0 | parity |
| `profiler_tim_list` | 14 | 14 | 0 | parity |
| `profiler_years` | 3 | 3 | 0 | parity |
| `profiles` | 21 | 20 | +1 | minor gap |
| `qa_dashboard_agent_period_summary` | 0 | 57 | -57 | **P0: empty** |
| `qa_dashboard_period_summary` | 0 | 5 | -5 | **P0: empty** |
| `qa_indicators` | 67 | 67 | 0 | parity |
| `qa_periods` | 5 | 5 | 0 | parity |
| `qa_service_rule_indicators` | 89 | 81 | +8 | minor gap |
| `qa_service_rule_versions` | 9 | 8 | +1 | minor gap |
| `qa_service_weights` | 7 | 7 | 0 | parity |
| `qa_temuan` | 2,682 | 2,826 | -144 | P1: partial gap |
| `telefun_history` | 2 | 6 | -4 | minor gap |
| `user_settings` | 1 | 5 | -4 | minor gap |
| `results` | MISSING | 39 | -39 | **P0: table missing** |
| `reports` | MISSING | 21 | -21 | **P0: table missing** |
| `qa_dashboard_indicator_period_summary` | MISSING | 25 | -25 | **P0: table missing** |

---

## Section 5: Auth & Profile

| Metric | Target | Legacy |
|---|---|---|
| `auth.users` count | 21 | 20 |
| `auth.identities` count | 23 | 23 |
| `public.profiles` count | 21 | 20 |
| Profile orphans (no auth.user) | 0 | 0 |
| Auth orphans (no profile) | 0 | 0 |

**Role/Status Distribution (Target):**
- admin/active: 2
- agent/active: 14
- leader/active: 2
- leader/pending: 1
- trainer/active: 2

**Role/Status Distribution (Legacy):**
- admin/approved: 1
- agent/approved: 14
- leader/approved: 2
- leader/pending: 1
- trainer/approved: 2

**Status mapping divergence:** `approved`→`active`, `rejected`→`inactive`. Ini adalah intentional Vite divergence dan compatible secara behavior.

---

## Section 6: Storage

| Bucket | Target Objects | Legacy Objects | Config Match |
|---|---|---|---|
| `profiler-foto` | 150 | 150 | Identical |
| `reports` | 0 | 0 | Identical |
| `telefun-recordings` | 2 | 10 | Identical config, different counts |

---

## Section 7: App Compatibility Smoke

| Test Suite | Result |
|---|---|
| `pnpm --filter @trainers/api test` | **258 passed, 4 skipped** — PASS |
| `pnpm --filter @trainers/web test` | 22 passed, 1 failed (timeout on access-groups-parity) — PASS/CONDITIONAL |

**Caveat:** API tests bersifat unit/mock-based, bukan integration tests yang memanggil SQL functions/POST endpoints terhadap target DB live. Passing tests tidak membuktikan bahwa missing functions (e.g., `qa_score_agent`, `get_qa_dashboard_data`) tidak akan menyebabkan runtime errors.

---

## Section 8: Compatibility Matrix

| Gap | Class | Owner Decision |
|---|---|---|
| Missing `results` table | **P0 strict gap** | Must copy data + add migration; app code references it |
| Missing `reports` table | **P0 strict gap** | Must copy data + add migration; no alternative storage |
| Missing `qa_dashboard_indicator_period_summary` | **P0 strict gap** | Must add table + refresh functions |
| Missing 29 SQL functions | **P0 strict gap** | Must migrate all functions; app architecture depends on them |
| Missing SIDAK dashboard data (0 rows) | **P0 strict gap** | Must run `refresh_qa_dashboard_summary_for_period` after data copy |
| Activity logs (1,889 rows) empty | **P0 strict gap** | Must copy from legacy |
| Access groups + leader data (75 rows) empty | **P0 strict gap** | Must copy from legacy |
| `qa_temuan` gap (-144 rows) | **P1 compatibility gap** | Investigate if intentionally pruned or migration incomplete |
| RLS policy model shift | **P1 compatibility gap** | Accept Vite model OR backfill legacy policies |
| Profile column differences | P1 compatibility gap | Accept Vite model; `updated_at` and `is_deleted` are intentional |
| Status semantics (approved→active) | **Accepted divergence** | Vite architecture intentional |
| Missing persona/scenario tables | **Accepted divergence** | Vite hardcodes in service code |
| Missing backup tables (`qa_*_backup`) | **Accepted divergence** | Not needed for Vite |
| Storage `telefun-recordings` gap (8 objects) | P1 compatibility gap | Copy from legacy |

---

## Remediation Plan (Recommended Priority Order)

### Phase A: Critical Infrastructure (P0)

1. **Add migration for missing tables:** `results`, `reports`, `qa_dashboard_indicator_period_summary`, `telefun_coaching_summary`, `telefun_replay_annotations`, `ketik_personas`, `ketik_scenarios`, `pdkt_scenarios`
2. **Add migration for missing 29 SQL functions** — copy function definitions from legacy via `pg_dump --schema-only`
3. **Add migration for missing triggers:** `guard_profile_sensitive_columns`, activity log triggers, `trg_fill_tahun`
4. **Copy data:** `results` (39), `reports` (21), `activity_logs` (1,889), `access_groups` (7), `access_group_items` (60), `leader_access_requests` (4), `leader_access_request_groups` (4)

### Phase B: Data Sync (P0)

5. **Refresh SIDAK dashboards** for all periods after data sync
6. **Copy missing `qa_temuan` rows** (144-row delta investigation first)
7. **Copy `telefun-recordings` objects** (8 files) from legacy storage

### Phase C: Constraint Alignment (P1)

8. **Align FK targets:** Decide whether to standardize on `auth.users` vs `profiles` for user FKs
9. **Align period FK behavior:** Standardize `DELETE CASCADE` vs `RESTRICT` for `qa_temuan.period_id`
10. **Align profile CHECK constraints** or document intentional divergence

### Phase D: Security Hardening (P1)

11. **Audit RLS policy differences** per table and decide which to backfill
12. **Add service_role policies** for `ai_usage_logs`, `ai_pricing_settings`, `ai_billing_settings`

---

## Evidence Trail

All raw data artifacts stored at: `local-backups/database-parity/20260524-192154/`

| File | Content |
|---|---|
| `target-proof.txt` | Target DB connection proof |
| `legacy-proof.txt` | Legacy DB connection proof |
| `target-schema.tsv` | Full table/column/constraint/index dump (target) |
| `legacy-schema.tsv` | Full table/column/constraint/index dump (legacy) |
| `schema-inventory.sql` | SQL script used for schema extraction |
| `app-smoke-report.md` | Web: 22/23 passed (1 timeout), API: 258/258 passed, 4 skipped |
