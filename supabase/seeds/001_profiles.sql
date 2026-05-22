-- Seed: profiles
-- Minimum 5 rows with realistic Indonesian names and roles
-- Uses ON CONFLICT DO NOTHING for idempotent execution
-- Note: profiles.id references auth.users(id), so we create auth.users entries first.
-- This seed is designed for local/dev Supabase instances only.

-- Create auth.users entries first (required for FK constraint on profiles.id)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rina.wijaya@bankmuamalat.co.id', crypt('password123', gen_salt('bf')), now(), '2024-01-15 08:00:00+07', '2024-06-10 14:30:00+07', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Rina Wijaya"}'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'budi.santoso@bankmuamalat.co.id', crypt('password123', gen_salt('bf')), now(), '2024-02-01 09:00:00+07', '2024-06-12 10:15:00+07', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Budi Santoso"}'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dewi.lestari@bankmuamalat.co.id', crypt('password123', gen_salt('bf')), now(), '2024-02-10 08:30:00+07', '2024-06-11 16:45:00+07', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Dewi Lestari"}'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567804', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ahmad.fauzi@bankmuamalat.co.id', crypt('password123', gen_salt('bf')), now(), '2024-03-01 07:45:00+07', '2024-06-09 11:20:00+07', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Ahmad Fauzi"}'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567805', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'siti.nurhaliza@bankmuamalat.co.id', crypt('password123', gen_salt('bf')), now(), '2024-03-15 08:00:00+07', '2024-06-08 09:00:00+07', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Siti Nurhaliza"}'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567806', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hendra.gunawan@bankmuamalat.co.id', crypt('password123', gen_salt('bf')), now(), '2024-03-20 08:15:00+07', '2024-06-07 13:30:00+07', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Hendra Gunawan"}'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567807', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya.putri@bankmuamalat.co.id', crypt('password123', gen_salt('bf')), now(), '2024-04-01 09:00:00+07', '2024-05-30 17:00:00+07', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Maya Putri Rahayu"}')
ON CONFLICT (id) DO NOTHING;

-- Now insert profiles (references auth.users)
INSERT INTO public.profiles (id, email, full_name, role, status, is_deleted, created_at, updated_at)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'rina.wijaya@bankmuamalat.co.id', 'Rina Wijaya', 'admin', 'active', false, '2024-01-15 08:00:00+07', '2024-06-10 14:30:00+07'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'budi.santoso@bankmuamalat.co.id', 'Budi Santoso', 'trainer', 'active', false, '2024-02-01 09:00:00+07', '2024-06-12 10:15:00+07'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'dewi.lestari@bankmuamalat.co.id', 'Dewi Lestari', 'trainer', 'active', false, '2024-02-10 08:30:00+07', '2024-06-11 16:45:00+07'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567804', 'ahmad.fauzi@bankmuamalat.co.id', 'Ahmad Fauzi', 'leader', 'active', false, '2024-03-01 07:45:00+07', '2024-06-09 11:20:00+07'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567805', 'siti.nurhaliza@bankmuamalat.co.id', 'Siti Nurhaliza', 'agent', 'active', false, '2024-03-15 08:00:00+07', '2024-06-08 09:00:00+07'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567806', 'hendra.gunawan@bankmuamalat.co.id', 'Hendra Gunawan', 'agent', 'active', false, '2024-03-20 08:15:00+07', '2024-06-07 13:30:00+07'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567807', 'maya.putri@bankmuamalat.co.id', 'Maya Putri Rahayu', 'agent', 'inactive', false, '2024-04-01 09:00:00+07', '2024-05-30 17:00:00+07')
ON CONFLICT (id) DO NOTHING;
