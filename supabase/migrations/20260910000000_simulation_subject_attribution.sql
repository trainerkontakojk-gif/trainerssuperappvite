-- Migration: simulation_subject_attribution
-- Lane D. Additive expand phase: nullable columns, no DEFAULT, no backfill.
-- Design checkpoint (grants audit 2026-09-09):
-- - ketik_history/pdkt_history/telefun_history: RLS owner-only; backend writes via
--   service-role admin; direct authenticated owner inserts possible -> trigger protects.
-- - pdkt_mailbox_items: SELECT shared (select_all); writes via SECURITY DEFINER RPCs.
-- - Table grants default allow authenticated direct writes; mass REVOKE deferred to
--   avoid breaking existing user-JWT flows. Protection via CHECK + FK + BEFORE
--   INSERT/UPDATE trigger (immutable attribution, allow FK SET NULL cleanup only,
--   allow scoring/status updates that do not touch attribution).
-- - Frozen participant snapshots are registered in a service-role-only intent
--   table and consumed by the authenticated mailbox RPC; direct callers may
--   omit snapshot metadata and receive a live DB resolution, but cannot supply
--   caller-controlled frozen fields.
-- - PostgREST does NOT support overloaded functions (PGRST203). New batch RPC uses
--   UNIQUE name submit_pdkt_mailbox_batch_with_subject; old 8-param signature kept
--   with same name/signature but now sets explicit self attribution (no overload).
-- - Reply RPC keeps 3-param signature, now copies mailbox attribution to history.
-- Approval Gate: setuju 1-5 (self relatif PDKT, participant reply admin/trainer
-- immutable, visibilitas snapshot shared, snapshot KETIK saat save, scope tanpa tab KTP).

-- ── 1. Columns (nullable, no default) ──────────────────
ALTER TABLE public.ketik_history
  ADD COLUMN IF NOT EXISTS simulation_subject_type TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_peserta_id UUID,
  ADD COLUMN IF NOT EXISTS simulation_subject_name TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_batch_name TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_team TEXT;

ALTER TABLE public.pdkt_history
  ADD COLUMN IF NOT EXISTS simulation_subject_type TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_peserta_id UUID,
  ADD COLUMN IF NOT EXISTS simulation_subject_name TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_batch_name TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_team TEXT;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS simulation_subject_type TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_peserta_id UUID,
  ADD COLUMN IF NOT EXISTS simulation_subject_name TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_batch_name TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_team TEXT;

ALTER TABLE public.pdkt_mailbox_items
  ADD COLUMN IF NOT EXISTS simulation_subject_type TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_peserta_id UUID,
  ADD COLUMN IF NOT EXISTS simulation_subject_name TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_batch_name TEXT,
  ADD COLUMN IF NOT EXISTS simulation_subject_team TEXT;

-- The API resolves a participant snapshot before generation and registers it
-- here using the service role. The user-JWT mailbox RPC consumes the opaque
-- intent, so direct authenticated callers cannot forge the snapshot fields
-- while the retry path can preserve metadata that later changes in profiler.
CREATE TABLE IF NOT EXISTS public.pdkt_mailbox_subject_intents (
  token UUID PRIMARY KEY,
  actor_id UUID NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('participant')),
  subject_peserta_id UUID NOT NULL,
  subject_name TEXT NOT NULL,
  subject_batch_name TEXT,
  subject_team TEXT,
  client_request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pdkt_mailbox_subject_intents_expiry
  ON public.pdkt_mailbox_subject_intents (expires_at);

ALTER TABLE public.pdkt_mailbox_subject_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pdkt_mailbox_subject_intents FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pdkt_mailbox_subject_intents TO service_role;

-- ── 2. FK to profiler_peserta ON DELETE SET NULL ───────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ketik_history_subject_peserta') THEN
    ALTER TABLE public.ketik_history
      ADD CONSTRAINT fk_ketik_history_subject_peserta
      FOREIGN KEY (simulation_subject_peserta_id)
      REFERENCES public.profiler_peserta(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pdkt_history_subject_peserta') THEN
    ALTER TABLE public.pdkt_history
      ADD CONSTRAINT fk_pdkt_history_subject_peserta
      FOREIGN KEY (simulation_subject_peserta_id)
      REFERENCES public.profiler_peserta(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_telefun_history_subject_peserta') THEN
    ALTER TABLE public.telefun_history
      ADD CONSTRAINT fk_telefun_history_subject_peserta
      FOREIGN KEY (simulation_subject_peserta_id)
      REFERENCES public.profiler_peserta(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pdkt_mailbox_subject_peserta') THEN
    ALTER TABLE public.pdkt_mailbox_items
      ADD CONSTRAINT fk_pdkt_mailbox_subject_peserta
      FOREIGN KEY (simulation_subject_peserta_id)
      REFERENCES public.profiler_peserta(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3. CHECKs with explicit NULL handling ──────────────
-- Unknown/legacy: all five null.
-- Self: type=self, peserta_id null, batch/team null (name may be null for mailbox self, non-null for history self).
-- Participant: type=participant, name nonblank (FK may be null after delete).
DO $$ BEGIN
  ALTER TABLE public.ketik_history DROP CONSTRAINT IF EXISTS chk_ketik_subject;
  ALTER TABLE public.ketik_history ADD CONSTRAINT chk_ketik_subject CHECK (
    (simulation_subject_type IS NULL AND simulation_subject_peserta_id IS NULL AND simulation_subject_name IS NULL AND simulation_subject_batch_name IS NULL AND simulation_subject_team IS NULL)
    OR (simulation_subject_type = 'self' AND simulation_subject_peserta_id IS NULL AND simulation_subject_batch_name IS NULL AND simulation_subject_team IS NULL)
    OR (simulation_subject_type = 'participant' AND simulation_subject_name IS NOT NULL AND btrim(simulation_subject_name) <> '')
  );
  ALTER TABLE public.pdkt_history DROP CONSTRAINT IF EXISTS chk_pdkt_history_subject;
  ALTER TABLE public.pdkt_history ADD CONSTRAINT chk_pdkt_history_subject CHECK (
    (simulation_subject_type IS NULL AND simulation_subject_peserta_id IS NULL AND simulation_subject_name IS NULL AND simulation_subject_batch_name IS NULL AND simulation_subject_team IS NULL)
    OR (simulation_subject_type = 'self' AND simulation_subject_peserta_id IS NULL AND simulation_subject_batch_name IS NULL AND simulation_subject_team IS NULL)
    OR (simulation_subject_type = 'participant' AND simulation_subject_name IS NOT NULL AND btrim(simulation_subject_name) <> '')
  );
  ALTER TABLE public.telefun_history DROP CONSTRAINT IF EXISTS chk_telefun_subject;
  ALTER TABLE public.telefun_history ADD CONSTRAINT chk_telefun_subject CHECK (
    (simulation_subject_type IS NULL AND simulation_subject_peserta_id IS NULL AND simulation_subject_name IS NULL AND simulation_subject_batch_name IS NULL AND simulation_subject_team IS NULL)
    OR (simulation_subject_type = 'self' AND simulation_subject_peserta_id IS NULL AND simulation_subject_batch_name IS NULL AND simulation_subject_team IS NULL)
    OR (simulation_subject_type = 'participant' AND simulation_subject_name IS NOT NULL AND btrim(simulation_subject_name) <> '')
  );
  ALTER TABLE public.pdkt_mailbox_items DROP CONSTRAINT IF EXISTS chk_pdkt_mailbox_subject;
  ALTER TABLE public.pdkt_mailbox_items ADD CONSTRAINT chk_pdkt_mailbox_subject CHECK (
    (simulation_subject_type IS NULL AND simulation_subject_peserta_id IS NULL AND simulation_subject_name IS NULL AND simulation_subject_batch_name IS NULL AND simulation_subject_team IS NULL)
    OR (simulation_subject_type = 'self' AND simulation_subject_peserta_id IS NULL AND simulation_subject_name IS NULL AND simulation_subject_batch_name IS NULL AND simulation_subject_team IS NULL)
    OR (simulation_subject_type = 'participant' AND simulation_subject_name IS NOT NULL AND btrim(simulation_subject_name) <> '')
  );
END $$;

-- ── 4. Indexes (partial, ID non-null) ──────────────────
CREATE INDEX IF NOT EXISTS idx_ketik_history_subject_peserta
  ON public.ketik_history (simulation_subject_peserta_id, date DESC)
  WHERE simulation_subject_peserta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pdkt_history_subject_peserta
  ON public.pdkt_history (simulation_subject_peserta_id, timestamp DESC)
  WHERE simulation_subject_peserta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telefun_history_subject_peserta
  ON public.telefun_history (simulation_subject_peserta_id, created_at DESC)
  WHERE simulation_subject_peserta_id IS NOT NULL;

-- Idempotency enforcement at DB level (canonical rows only; concurrent same-key
-- creates collapse to one row; same-key/different-target surfaces as conflict
-- via unique violation mapped to 409 by callers).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pdkt_mailbox_canonical_client_req
  ON public.pdkt_mailbox_items (created_by_user_id, client_request_id)
  WHERE client_request_id IS NOT NULL AND COALESCE(is_shared_copy, FALSE) = FALSE;

-- ── 5. Immutable trigger (allow FK cleanup + non-attribution updates) ──
CREATE OR REPLACE FUNCTION public.enforce_simulation_subject_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Allow FK ON DELETE SET NULL: only peserta_id null-ed, rest unchanged.
    IF OLD.simulation_subject_peserta_id IS NOT NULL
      AND NEW.simulation_subject_peserta_id IS NULL
      AND NEW.simulation_subject_type IS NOT DISTINCT FROM OLD.simulation_subject_type
      AND NEW.simulation_subject_name IS NOT DISTINCT FROM OLD.simulation_subject_name
      AND NEW.simulation_subject_batch_name IS NOT DISTINCT FROM OLD.simulation_subject_batch_name
      AND NEW.simulation_subject_team IS NOT DISTINCT FROM OLD.simulation_subject_team
    THEN
      -- Only an actual FK cleanup may null the reference. A live target means
      -- this is a caller attempting to rewrite immutable attribution.
      IF EXISTS (
        SELECT 1 FROM public.profiler_peserta
         WHERE id = OLD.simulation_subject_peserta_id
      ) THEN
        RAISE EXCEPTION 'SIMULATION_SUBJECT_IMMUTABLE';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.simulation_subject_type IS DISTINCT FROM OLD.simulation_subject_type
      OR NEW.simulation_subject_peserta_id IS DISTINCT FROM OLD.simulation_subject_peserta_id
      OR NEW.simulation_subject_name IS DISTINCT FROM OLD.simulation_subject_name
      OR NEW.simulation_subject_batch_name IS DISTINCT FROM OLD.simulation_subject_batch_name
      OR NEW.simulation_subject_team IS DISTINCT FROM OLD.simulation_subject_team
    THEN
      RAISE EXCEPTION 'SIMULATION_SUBJECT_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ketik_subject_immutable ON public.ketik_history;
CREATE TRIGGER trg_ketik_subject_immutable
  BEFORE UPDATE ON public.ketik_history
  FOR EACH ROW EXECUTE FUNCTION public.enforce_simulation_subject_immutable();

DROP TRIGGER IF EXISTS trg_pdkt_history_subject_immutable ON public.pdkt_history;
CREATE TRIGGER trg_pdkt_history_subject_immutable
  BEFORE UPDATE ON public.pdkt_history
  FOR EACH ROW EXECUTE FUNCTION public.enforce_simulation_subject_immutable();

DROP TRIGGER IF EXISTS trg_telefun_subject_immutable ON public.telefun_history;
CREATE TRIGGER trg_telefun_subject_immutable
  BEFORE UPDATE ON public.telefun_history
  FOR EACH ROW EXECUTE FUNCTION public.enforce_simulation_subject_immutable();

DROP TRIGGER IF EXISTS trg_pdkt_mailbox_subject_immutable ON public.pdkt_mailbox_items;
CREATE TRIGGER trg_pdkt_mailbox_subject_immutable
  BEFORE UPDATE ON public.pdkt_mailbox_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_simulation_subject_immutable();


-- ── 5b. Snapshot authenticity (prevent valid-looking forgery on direct writes) ──
-- RPC/backend resolver already look up peserta; this trigger enforces the same
-- on any direct INSERT: participant with non-null FK must match current
-- profiler_peserta (nama/batch/tim). History copy after delete (FK null) allowed.
-- The frozen mailbox RPC path uses a service-role-only intent instead of
-- re-resolving mutable metadata. Self/unknown and direct actor ownership are
-- enforced by the trigger below.
CREATE OR REPLACE FUNCTION public.validate_simulation_subject_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_nama TEXT;
  v_batch TEXT;
  v_tim TEXT;
  v_full_name TEXT;
  v_verified_self_name TEXT;
  v_actor UUID;
  v_owner UUID;
  v_role TEXT;
  v_status TEXT;
  v_deleted BOOLEAN;
BEGIN
  -- SECURITY DEFINER RPCs and the backend service role have their own
  -- authorization/subject resolution boundaries. Direct authenticated
  -- requests are evaluated under the caller's role and RLS.
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: autentikasi diperlukan';
  END IF;

  IF TG_TABLE_NAME = 'pdkt_mailbox_items' THEN
    v_owner := COALESCE(NEW.created_by_user_id, NEW.user_id);
  ELSE
    v_owner := NEW.user_id;
  END IF;
  IF v_owner IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN: hanya pemilik sesi yang dapat mengatur attribution';
  END IF;

  SELECT role, full_name, status, is_deleted
    INTO v_role, v_full_name, v_status, v_deleted
    FROM public.profiles
   WHERE id = v_actor;
  IF NOT FOUND OR COALESCE(v_deleted, FALSE)
    OR LOWER(TRIM(COALESCE(v_status, ''))) NOT IN ('active', 'approved') THEN
    RAISE EXCEPTION 'FORBIDDEN: akun tidak aktif';
  END IF;

  v_verified_self_name := COALESCE(NULLIF(BTRIM(COALESCE(v_full_name, '')), ''), 'Diri sendiri');

  -- Legacy callers that omit the new columns are normalized to verified self.
  -- Existing legacy rows are untouched because this is an INSERT trigger.
  IF NEW.simulation_subject_type IS NULL
    AND NEW.simulation_subject_peserta_id IS NULL
    AND NEW.simulation_subject_name IS NULL
    AND NEW.simulation_subject_batch_name IS NULL
    AND NEW.simulation_subject_team IS NULL THEN
    NEW.simulation_subject_type := 'self';
    IF TG_TABLE_NAME <> 'pdkt_mailbox_items' THEN
      NEW.simulation_subject_name := v_verified_self_name;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.simulation_subject_type = 'self' THEN
    IF TG_TABLE_NAME <> 'pdkt_mailbox_items' THEN
      IF NEW.simulation_subject_name IS NOT NULL
        AND NEW.simulation_subject_name IS DISTINCT FROM v_verified_self_name THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: snapshot self tidak cocok dengan profile';
      END IF;
      NEW.simulation_subject_name := v_verified_self_name;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.simulation_subject_type = 'participant' THEN
    IF NEW.simulation_subject_peserta_id IS NULL THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: peserta tidak ditemukan';
    END IF;
    IF LOWER(TRIM(COALESCE(v_role, ''))) NOT IN ('admin', 'trainer') THEN
      RAISE EXCEPTION 'FORBIDDEN: participant attribution requires admin/trainer';
    END IF;

    SELECT nama, batch_name, tim INTO v_nama, v_batch, v_tim
      FROM public.profiler_peserta
     WHERE id = NEW.simulation_subject_peserta_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: peserta tidak ditemukan';
    END IF;
    IF NEW.simulation_subject_name IS DISTINCT FROM v_nama
      OR NEW.simulation_subject_batch_name IS DISTINCT FROM v_batch
      OR NEW.simulation_subject_team IS DISTINCT FROM v_tim THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: snapshot peserta tidak cocok';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'VALIDATION_ERROR: invalid subject type';
END;
$$;

DROP TRIGGER IF EXISTS trg_ketik_subject_validate ON public.ketik_history;
CREATE TRIGGER trg_ketik_subject_validate
  BEFORE INSERT ON public.ketik_history
  FOR EACH ROW EXECUTE FUNCTION public.validate_simulation_subject_snapshot();
DROP TRIGGER IF EXISTS trg_pdkt_history_subject_validate ON public.pdkt_history;
CREATE TRIGGER trg_pdkt_history_subject_validate
  BEFORE INSERT ON public.pdkt_history
  FOR EACH ROW EXECUTE FUNCTION public.validate_simulation_subject_snapshot();
DROP TRIGGER IF EXISTS trg_telefun_subject_validate ON public.telefun_history;
CREATE TRIGGER trg_telefun_subject_validate
  BEFORE INSERT ON public.telefun_history
  FOR EACH ROW EXECUTE FUNCTION public.validate_simulation_subject_snapshot();
DROP TRIGGER IF EXISTS trg_pdkt_mailbox_subject_validate ON public.pdkt_mailbox_items;
CREATE TRIGGER trg_pdkt_mailbox_subject_validate
  BEFORE INSERT ON public.pdkt_mailbox_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_simulation_subject_snapshot();

-- Trigger helpers are not an application RPC surface. Trigger invocation does
-- not require granting EXECUTE to browser roles.
REVOKE ALL ON FUNCTION public.enforce_simulation_subject_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_simulation_subject_snapshot() FROM PUBLIC, anon, authenticated;

-- ── 6. PDKT batch with subject (unique name, no overload) ──
-- Remove the earlier 10-argument definition when this migration is applied
-- over an environment that already ran the first draft of this migration.
DROP FUNCTION IF EXISTS public.submit_pdkt_mailbox_batch_with_subject(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, UUID);
DROP FUNCTION IF EXISTS public.submit_pdkt_mailbox_batch_with_subject(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.submit_pdkt_mailbox_batch_with_subject(
    p_client_request_id TEXT,
    p_sender_name TEXT,
    p_sender_email TEXT,
    p_subject TEXT,
    p_snippet TEXT,
    p_scenario_snapshot JSONB,
    p_config_snapshot JSONB,
    p_inbound_email JSONB,
    p_subject_type TEXT,
    p_subject_peserta_id UUID,
    p_subject_name TEXT DEFAULT NULL,
    p_subject_batch_name TEXT DEFAULT NULL,
    p_subject_team TEXT DEFAULT NULL,
    p_subject_snapshot_token UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator_id UUID;
    v_creator_role TEXT;
    v_creator_status TEXT;
    v_creator_deleted BOOLEAN;
    v_existing RECORD;
    v_intent RECORD;
    v_source_item_id UUID;
    v_peserta RECORD;
    v_subject_name TEXT;
    v_subject_batch TEXT;
    v_subject_team TEXT;
    v_constraint TEXT;
BEGIN
    v_creator_id := auth.uid();
    IF v_creator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT role, status, is_deleted INTO v_creator_role, v_creator_status, v_creator_deleted FROM public.profiles WHERE id = v_creator_id;
    IF NOT FOUND OR COALESCE(v_creator_deleted, FALSE) OR LOWER(TRIM(COALESCE(v_creator_status,''))) NOT IN ('active','approved') THEN
        RAISE EXCEPTION 'FORBIDDEN: akun tidak aktif';
    END IF;

    IF p_subject_type IS NULL OR p_subject_type NOT IN ('self', 'participant') THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: invalid subject type';
    END IF;

    IF p_subject_type = 'self' THEN
        IF p_subject_peserta_id IS NOT NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: self with participant id';
        END IF;
        IF p_subject_snapshot_token IS NOT NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: invalid subject snapshot intent';
        END IF;
        v_subject_name := NULL;
        v_subject_batch := NULL;
        v_subject_team := NULL;
    ELSE
        IF LOWER(TRIM(COALESCE(v_creator_role, ''))) NOT IN ('admin', 'trainer') THEN
            RAISE EXCEPTION 'FORBIDDEN: participant attribution requires admin/trainer';
        END IF;
        IF p_subject_peserta_id IS NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: participant id required';
        END IF;

        IF p_client_request_id IS NULL AND p_subject_snapshot_token IS NOT NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: participant snapshot requires idempotency key';
        END IF;

        IF p_subject_snapshot_token IS NOT NULL THEN
            SELECT subject_type, subject_peserta_id, subject_name,
                   subject_batch_name, subject_team, client_request_id
              INTO v_intent
              FROM public.pdkt_mailbox_subject_intents
             WHERE token = p_subject_snapshot_token
               AND actor_id = v_creator_id
               AND consumed_at IS NULL
               AND expires_at > now()
             FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'FORBIDDEN: subject snapshot intent tidak valid';
            END IF;
            IF v_intent.subject_type IS DISTINCT FROM p_subject_type
              OR v_intent.subject_peserta_id IS DISTINCT FROM p_subject_peserta_id
              OR v_intent.client_request_id IS DISTINCT FROM p_client_request_id THEN
                RAISE EXCEPTION 'CONFLICT: subject snapshot intent tidak cocok';
            END IF;
            v_subject_name := v_intent.subject_name;
            v_subject_batch := v_intent.subject_batch_name;
            v_subject_team := v_intent.subject_team;
        ELSE
            -- Direct user-JWT callers may select a participant, but may not
            -- provide a caller-controlled snapshot. They must either omit the
            -- optional fields and let this function resolve the live row, or
            -- use an intent issued by the backend service role.
            IF p_subject_name IS NOT NULL
              OR p_subject_batch_name IS NOT NULL
              OR p_subject_team IS NOT NULL THEN
                RAISE EXCEPTION 'FORBIDDEN: subject snapshot intent required';
            END IF;
            SELECT id, nama, batch_name, tim INTO v_peserta
            FROM public.profiler_peserta WHERE id = p_subject_peserta_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'NOT_FOUND: peserta tidak ditemukan';
            END IF;
            v_subject_name := v_peserta.nama;
            v_subject_batch := v_peserta.batch_name;
            v_subject_team := v_peserta.tim;
        END IF;
        IF v_subject_name IS NULL OR btrim(v_subject_name) = '' THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: peserta tanpa nama';
        END IF;
    END IF;

    IF p_client_request_id IS NOT NULL THEN
        SELECT id, simulation_subject_type, simulation_subject_peserta_id
        INTO v_existing
        FROM public.pdkt_mailbox_items
        WHERE created_by_user_id = v_creator_id
          AND client_request_id = p_client_request_id
          AND COALESCE(is_shared_copy, false) = false
        LIMIT 1;
        IF FOUND THEN
            IF v_existing.simulation_subject_type IS DISTINCT FROM p_subject_type
              OR v_existing.simulation_subject_peserta_id IS DISTINCT FROM p_subject_peserta_id THEN
                RAISE EXCEPTION 'CONFLICT: idempotency key digunakan untuk target berbeda';
            END IF;
            IF p_subject_snapshot_token IS NOT NULL THEN
                UPDATE public.pdkt_mailbox_subject_intents
                   SET consumed_at = now()
                 WHERE token = p_subject_snapshot_token
                   AND actor_id = v_creator_id
                   AND consumed_at IS NULL;
            END IF;
            RETURN v_existing.id;
        END IF;
    END IF;

    BEGIN
        INSERT INTO public.pdkt_mailbox_items (
            user_id, created_by_user_id, client_request_id,
            sender_name, sender_email, subject, snippet,
            scenario_snapshot, config_snapshot, inbound_email,
            emails_thread, status, is_shared_copy,
            simulation_subject_type, simulation_subject_peserta_id,
            simulation_subject_name, simulation_subject_batch_name, simulation_subject_team
        ) VALUES (
            v_creator_id, v_creator_id, p_client_request_id,
            p_sender_name, p_sender_email, p_subject, p_snippet,
            p_scenario_snapshot, p_config_snapshot, p_inbound_email,
            jsonb_build_array(p_inbound_email), 'open', false,
            p_subject_type,
            CASE WHEN p_subject_type = 'participant' THEN p_subject_peserta_id ELSE NULL END,
            v_subject_name, v_subject_batch, v_subject_team
        ) RETURNING id INTO v_source_item_id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint <> 'uq_pdkt_mailbox_canonical_client_req' OR p_client_request_id IS NULL THEN
            RAISE;
        END IF;
        SELECT id, simulation_subject_type, simulation_subject_peserta_id
          INTO v_existing
          FROM public.pdkt_mailbox_items
         WHERE created_by_user_id = v_creator_id
           AND client_request_id = p_client_request_id
           AND COALESCE(is_shared_copy, false) = false
         LIMIT 1;
        IF NOT FOUND THEN
            RAISE;
        END IF;
        IF v_existing.simulation_subject_type IS DISTINCT FROM p_subject_type
          OR v_existing.simulation_subject_peserta_id IS DISTINCT FROM p_subject_peserta_id THEN
            RAISE EXCEPTION 'CONFLICT: idempotency key digunakan untuk target berbeda';
        END IF;
        IF p_subject_snapshot_token IS NOT NULL THEN
            UPDATE public.pdkt_mailbox_subject_intents
               SET consumed_at = now()
             WHERE token = p_subject_snapshot_token
               AND actor_id = v_creator_id
               AND consumed_at IS NULL;
        END IF;
        v_source_item_id := v_existing.id;
    END;

    IF p_subject_snapshot_token IS NOT NULL THEN
        UPDATE public.pdkt_mailbox_subject_intents
           SET consumed_at = now()
         WHERE token = p_subject_snapshot_token
           AND actor_id = v_creator_id
           AND consumed_at IS NULL;
    END IF;

    RETURN v_source_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_pdkt_mailbox_batch_with_subject(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_batch_with_subject(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- ── 7. Legacy 8-param batch keeps signature, now explicit self ──
CREATE OR REPLACE FUNCTION public.submit_pdkt_mailbox_batch(
    p_client_request_id TEXT,
    p_sender_name TEXT,
    p_sender_email TEXT,
    p_subject TEXT,
    p_snippet TEXT,
    p_scenario_snapshot JSONB,
    p_config_snapshot JSONB,
    p_inbound_email JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator_id UUID;
    v_existing_id UUID;
    v_existing_subject_type TEXT;
    v_existing_subject_peserta_id UUID;
    v_source_item_id UUID;
    v_old_status TEXT;
    v_old_deleted BOOLEAN;
    v_constraint TEXT;
BEGIN
    v_creator_id := auth.uid();
    IF v_creator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    SELECT status, is_deleted INTO v_old_status, v_old_deleted FROM public.profiles WHERE id = v_creator_id;
    IF NOT FOUND OR COALESCE(v_old_deleted, FALSE) OR LOWER(TRIM(COALESCE(v_old_status,''))) NOT IN ('active','approved') THEN
        RAISE EXCEPTION 'FORBIDDEN: akun tidak aktif';
    END IF;

    IF p_client_request_id IS NOT NULL THEN
        SELECT id, simulation_subject_type, simulation_subject_peserta_id
          INTO v_existing_id, v_existing_subject_type, v_existing_subject_peserta_id
          FROM public.pdkt_mailbox_items
         WHERE created_by_user_id = v_creator_id
           AND client_request_id = p_client_request_id
           AND COALESCE(is_shared_copy, false) = false
         LIMIT 1;
        IF v_existing_id IS NOT NULL THEN
            IF v_existing_subject_type IS DISTINCT FROM 'self'
              OR v_existing_subject_peserta_id IS NOT NULL THEN
                RAISE EXCEPTION 'CONFLICT: idempotency key digunakan untuk target berbeda';
            END IF;
            RETURN v_existing_id;
        END IF;
    END IF;

    BEGIN
        INSERT INTO public.pdkt_mailbox_items (
            user_id, created_by_user_id, client_request_id,
            sender_name, sender_email, subject, snippet,
            scenario_snapshot, config_snapshot, inbound_email,
            emails_thread, status, is_shared_copy,
            simulation_subject_type, simulation_subject_peserta_id,
            simulation_subject_name, simulation_subject_batch_name, simulation_subject_team
        ) VALUES (
            v_creator_id, v_creator_id, p_client_request_id,
            p_sender_name, p_sender_email, p_subject, p_snippet,
            p_scenario_snapshot, p_config_snapshot, p_inbound_email,
            jsonb_build_array(p_inbound_email), 'open', false,
            'self', NULL, NULL, NULL, NULL
        ) RETURNING id INTO v_source_item_id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint <> 'uq_pdkt_mailbox_canonical_client_req' OR p_client_request_id IS NULL THEN
            RAISE;
        END IF;
        SELECT id, simulation_subject_type, simulation_subject_peserta_id
          INTO v_existing_id, v_existing_subject_type, v_existing_subject_peserta_id
          FROM public.pdkt_mailbox_items
         WHERE created_by_user_id = v_creator_id
           AND client_request_id = p_client_request_id
           AND COALESCE(is_shared_copy, false) = false
         LIMIT 1;
        IF NOT FOUND THEN
            RAISE;
        END IF;
        IF v_existing_subject_type IS DISTINCT FROM 'self'
          OR v_existing_subject_peserta_id IS NOT NULL THEN
            RAISE EXCEPTION 'CONFLICT: idempotency key digunakan untuk target berbeda';
        END IF;
        v_source_item_id := v_existing_id;
    END;

    RETURN v_source_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_pdkt_mailbox_batch(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_batch(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) TO authenticated;

-- ── 8. Reply copies mailbox attribution; self resolved from replier ──
-- The outcome RPC makes the row-lock winner explicit. Keeping this separate
-- from the legacy UUID-returning function preserves direct RPC compatibility
-- while preventing two concurrent API requests from both scheduling AI work.
CREATE OR REPLACE FUNCTION public.submit_pdkt_mailbox_reply_with_outcome(
    p_mailbox_id UUID,
    p_agent_reply JSONB,
    p_time_taken INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_replier_name TEXT;
    v_user_status TEXT;
    v_user_deleted BOOLEAN;
    v_item RECORD;
    v_history_id UUID;
    v_updated_thread JSONB;
    v_now TIMESTAMPTZ;
    v_hist_type TEXT;
    v_hist_peserta UUID;
    v_hist_name TEXT;
    v_hist_batch TEXT;
    v_hist_team TEXT;
BEGIN
    v_user_id := auth.uid();
    v_now := now();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_item FROM public.pdkt_mailbox_items WHERE id = p_mailbox_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mailbox item not found';
    END IF;

    -- Validate the retrying actor before the replied fast path. Otherwise a
    -- shared-mailbox retry could receive an existing history ID without an
    -- active profile/role check and start work under the wrong actor.
    SELECT role, full_name, status, is_deleted INTO v_user_role, v_replier_name, v_user_status, v_user_deleted FROM public.profiles WHERE id = v_user_id;
    IF NOT FOUND OR COALESCE(v_user_deleted, FALSE) OR LOWER(TRIM(COALESCE(v_user_status,''))) NOT IN ('active','approved') THEN
        RAISE EXCEPTION 'FORBIDDEN: akun tidak aktif';
    END IF;
    IF v_item.simulation_subject_type = 'participant'
      AND LOWER(TRIM(COALESCE(v_user_role, ''))) NOT IN ('admin', 'trainer') THEN
        RAISE EXCEPTION 'FORBIDDEN: participant reply requires admin/trainer';
    END IF;

    IF v_item.status = 'replied' THEN
        RETURN jsonb_build_object('history_id', v_item.history_id, 'created', false);
    END IF;
    IF v_item.status = 'deleted' THEN
        RAISE EXCEPTION 'Cannot reply to a deleted email';
    END IF;

    IF v_item.simulation_subject_type = 'participant' THEN
        IF LOWER(TRIM(COALESCE(v_user_role, ''))) NOT IN ('admin', 'trainer') THEN
            RAISE EXCEPTION 'FORBIDDEN: participant reply requires admin/trainer';
        END IF;
        v_hist_type := 'participant';
        v_hist_peserta := v_item.simulation_subject_peserta_id;
        v_hist_name := v_item.simulation_subject_name;
        v_hist_batch := v_item.simulation_subject_batch_name;
        v_hist_team := v_item.simulation_subject_team;
    ELSIF v_item.simulation_subject_type = 'self' THEN
        v_hist_type := 'self';
        v_hist_peserta := NULL;
        v_hist_name := NULLIF(btrim(COALESCE(v_replier_name, '')), '');
        IF v_hist_name IS NULL THEN
            v_hist_name := 'Diri sendiri';
        END IF;
        v_hist_batch := NULL;
        v_hist_team := NULL;
    ELSE
        v_hist_type := NULL;
        v_hist_peserta := NULL;
        v_hist_name := NULL;
        v_hist_batch := NULL;
        v_hist_team := NULL;
    END IF;

    v_updated_thread := jsonb_build_array(v_item.inbound_email) || p_agent_reply;

    INSERT INTO public.pdkt_history (
        user_id, timestamp, config, emails, evaluation_status, time_taken,
        simulation_subject_type, simulation_subject_peserta_id,
        simulation_subject_name, simulation_subject_batch_name, simulation_subject_team
    ) VALUES (
        v_user_id, v_now, v_item.config_snapshot, v_updated_thread, 'processing', p_time_taken,
        v_hist_type, v_hist_peserta, v_hist_name, v_hist_batch, v_hist_team
    ) RETURNING id INTO v_history_id;

    UPDATE public.pdkt_mailbox_items
    SET status = 'replied', replied_at = v_now, history_id = v_history_id,
        emails_thread = v_updated_thread, last_activity_at = v_now, updated_at = now()
    WHERE id = p_mailbox_id;

    RETURN jsonb_build_object('history_id', v_history_id, 'created', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_pdkt_mailbox_reply_with_outcome(UUID, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_reply_with_outcome(UUID, JSONB, INTEGER) TO authenticated;

-- Legacy direct callers still receive only the canonical history UUID.
CREATE OR REPLACE FUNCTION public.submit_pdkt_mailbox_reply(
    p_mailbox_id UUID,
    p_agent_reply JSONB,
    p_time_taken INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT public.submit_pdkt_mailbox_reply_with_outcome(
        p_mailbox_id,
        p_agent_reply,
        p_time_taken
    ) INTO v_result;
    RETURN (v_result ->> 'history_id')::UUID;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_pdkt_mailbox_reply(UUID, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_reply(UUID, JSONB, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_pdkt_mailbox_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_pdkt_mailbox_item(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
