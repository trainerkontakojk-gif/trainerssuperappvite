-- KETIK global quick templates
-- The singleton is the source of truth for the shared template palette.
-- Existing user_settings rows are intentionally preserved.

CREATE TABLE IF NOT EXISTS public.ketik_global_settings (
  key text PRIMARY KEY DEFAULT 'default' CHECK (key = 'default'),
  quick_templates jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS ketik_global_settings_set_updated_at
  ON public.ketik_global_settings;
CREATE TRIGGER ketik_global_settings_set_updated_at
  BEFORE UPDATE ON public.ketik_global_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ketik_global_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ketik_global_settings FROM anon, public, authenticated;
GRANT ALL ON public.ketik_global_settings TO service_role;

-- Preserve the first existing admin's configured templates during the one-time
-- cutover. If none exists, use the canonical application defaults.
INSERT INTO public.ketik_global_settings (key, quick_templates)
VALUES (
  'default',
  COALESCE(
    (
      SELECT us.settings #> '{ketik,quickTemplates}'
      FROM public.user_settings AS us
      JOIN public.profiles AS p ON p.id = us.user_id
      WHERE lower(p.role) = 'admin'
        AND COALESCE(p.is_deleted, false) = false
        AND jsonb_typeof(us.settings #> '{ketik,quickTemplates}') = 'array'
      ORDER BY p.created_at ASC, p.id ASC
      LIMIT 1
    ),
    '[
      {
        "id": "qt-selesai",
        "keyword": "selesai",
        "content": "Terima kasih telah menghubungi Layanan Kontak OJK 157. Semoga informasi yang kami berikan bermanfaat."
      },
      {
        "id": "qt-closing",
        "keyword": "closinghdsi",
        "content": "Demikian informasi yang dapat kami sampaikan. Jika ada hal lain yang ingin ditanyakan, silakan menghubungi kami kembali."
      },
      {
        "id": "qt-greeting",
        "keyword": "greetinghdsi",
        "content": "Selamat pagi/siang/sore, dengan Layanan Kontak OJK 157. Ada yang bisa kami bantu terkait informasi sektor jasa keuangan?"
      },
      {
        "id": "qt-isiform",
        "keyword": "isiformhdsi",
        "content": "Mohon kesediaan Bapak/Ibu untuk melengkapi data diri pada link berikut agar kami dapat memproses laporan Anda lebih lanjut: [LINK_FORM]"
      },
      {
        "id": "qt-tanya-akun",
        "keyword": "tanyaakun",
        "content": "Boleh diinformasikan nomor akun atau ID pelanggan yang Bapak/Ibu gunakan untuk layanan tersebut?"
      }
    ]'::jsonb
  )
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.ketik_global_settings IS
  'Singleton shared KETIK settings. quick_templates are managed by admin through the backend and read by all KETIK users.';
COMMENT ON COLUMN public.ketik_global_settings.key IS
  'Singleton key; always default.';
COMMENT ON COLUMN public.ketik_global_settings.quick_templates IS
  'Canonical KETIK quick templates shared by every user.';
