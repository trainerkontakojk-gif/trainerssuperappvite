-- Migration 004: Admin Management Core Tables (activity_logs, access_groups, access_group_items, leader_access_requests, leader_access_request_groups)

-- 1. activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text,
  action text NOT NULL,
  module text,
  type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.activity_logs FROM anon, public;
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

CREATE POLICY "Admin and trainers select and insert activity logs" ON public.activity_logs
  FOR ALL USING (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('trainer', 'admin')
    )
  );

-- 2. access_groups table
CREATE TABLE IF NOT EXISTS public.access_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  scope_type  text NOT NULL DEFAULT 'union' CHECK (scope_type IN ('union')),
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. access_group_items table
CREATE TABLE IF NOT EXISTS public.access_group_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_group_id uuid NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  field_name      text NOT NULL CHECK (field_name IN ('peserta_id', 'batch_name', 'tim', 'service_type')),
  field_value     text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_group_items_group_id ON public.access_group_items(access_group_id);

-- 4. leader_access_requests table
CREATE TABLE IF NOT EXISTS public.leader_access_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module          text NOT NULL CHECK (module IN ('ktp', 'sidak', 'all')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  reviewed_by     uuid REFERENCES public.profiles(id),
  review_note     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leader_access_requests_user_id ON public.leader_access_requests(leader_user_id);
CREATE INDEX IF NOT EXISTS idx_leader_access_requests_module ON public.leader_access_requests(module);
CREATE INDEX IF NOT EXISTS idx_leader_access_requests_status ON public.leader_access_requests(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_leader_access_requests_active_per_user_module
  ON public.leader_access_requests (leader_user_id, module)
  WHERE status IN ('pending', 'approved');

-- 5. leader_access_request_groups table
CREATE TABLE IF NOT EXISTS public.leader_access_request_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES public.leader_access_requests(id) ON DELETE CASCADE,
  access_group_id uuid NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, access_group_id)
);

CREATE INDEX IF NOT EXISTS idx_leader_access_request_groups_request_id
  ON public.leader_access_request_groups(request_id);
CREATE INDEX IF NOT EXISTS idx_leader_access_request_groups_group_id
  ON public.leader_access_request_groups(access_group_id);

-- Set updated_at trigger for new tables
CREATE OR REPLACE TRIGGER update_access_groups_updated_at
  BEFORE UPDATE ON public.access_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER update_access_group_items_updated_at
  BEFORE UPDATE ON public.access_group_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER update_leader_access_requests_updated_at
  BEFORE UPDATE ON public.leader_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS setup
ALTER TABLE public.access_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_group_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_access_request_groups ENABLE ROW LEVEL SECURITY;

-- Grants
REVOKE ALL ON public.access_groups FROM anon, public;
REVOKE ALL ON public.access_group_items FROM anon, public;
REVOKE ALL ON public.leader_access_requests FROM anon, public;
REVOKE ALL ON public.leader_access_request_groups FROM anon, public;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_group_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leader_access_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leader_access_request_groups TO authenticated;

GRANT ALL ON public.access_groups TO service_role;
GRANT ALL ON public.access_group_items TO service_role;
GRANT ALL ON public.leader_access_requests TO service_role;
GRANT ALL ON public.leader_access_request_groups TO service_role;

-- Policies: access_groups
CREATE POLICY "Admin and trainer manage access groups" ON public.access_groups
  FOR ALL USING (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('trainer', 'admin')
    )
  );

-- Policies: access_group_items
CREATE POLICY "Admin and trainer manage access group items" ON public.access_group_items
  FOR ALL USING (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('trainer', 'admin')
    )
  );

-- Policies: leader_access_requests
CREATE POLICY "Leader views own requests" ON public.leader_access_requests
  FOR SELECT USING (leader_user_id = auth.uid());

CREATE POLICY "Leader inserts own pending request" ON public.leader_access_requests
  FOR INSERT WITH CHECK (
    leader_user_id = auth.uid()
    AND status = 'pending'
    AND module IN ('ktp', 'sidak', 'all')
    AND exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'leader'
    )
  );

CREATE POLICY "Admin and trainer manage leader access requests" ON public.leader_access_requests
  FOR ALL USING (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('trainer', 'admin')
    )
  );

-- Policies: leader_access_request_groups
CREATE POLICY "Admin and trainer manage access request groups" ON public.leader_access_request_groups
  FOR ALL USING (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('trainer', 'admin')
    )
  );

CREATE POLICY "Leader views own request groups" ON public.leader_access_request_groups
  FOR SELECT USING (
    exists (
      select 1 from public.leader_access_requests
      where leader_access_requests.id = request_id
        and leader_access_requests.leader_user_id = auth.uid()
    )
  );

-- 6. Helper Function get_leader_approved_scope_items
CREATE OR REPLACE FUNCTION public.get_leader_approved_scope_items(
  p_leader_user_id uuid,
  p_module text
)
RETURNS TABLE(
  field_name text,
  field_value text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT agi.field_name, agi.field_value
  FROM public.leader_access_requests lar
  INNER JOIN public.leader_access_request_groups larg
    ON larg.request_id = lar.id
  INNER JOIN public.access_groups ag
    ON ag.id = larg.access_group_id
    AND ag.is_active = true
  INNER JOIN public.access_group_items agi
    ON agi.access_group_id = ag.id
    AND agi.is_active = true
  WHERE lar.leader_user_id = p_leader_user_id
    AND lar.status = 'approved'
    AND (lar.module = p_module OR lar.module = 'all')
  ORDER BY agi.field_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_leader_approved_scope_items(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_leader_approved_scope_items(uuid, text) TO authenticated, service_role;
