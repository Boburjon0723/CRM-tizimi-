-- CRM: xodim telefoni, Telegram bog‘lanish va dam olish so‘rovlari
-- Supabase SQL editorida ketma-ket ishga tushiring.
--
-- Agar CRM da saqlashda chiqsa: "Could not find the 'phone' column" (PGRST204) —
-- avval 1-bo‘limni ishga tushiring (yoki alohida: supabase_add_employees_phone_only.sql).

-- 1) Xodimlar: telefon (CRM va bot telefonini solishtirish uchun)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.employees.phone IS '998XXXXXXXXX formatida normalize qilingan telefon (ixtiyoriy, noyob)';

CREATE UNIQUE INDEX IF NOT EXISTS employees_phone_unique
  ON public.employees (phone)
  WHERE phone IS NOT NULL AND trim(phone) <> '';

-- 2) Telegram foydalanuvchi ↔ xodim (bitta bot, rol)
CREATE TABLE IF NOT EXISTS public.telegram_crm_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL UNIQUE,
  telegram_chat_id bigint NOT NULL,
  phone_normalized text NOT NULL,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('manager', 'employee')),
  employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_crm_links_phone_idx ON public.telegram_crm_links (phone_normalized);
CREATE INDEX IF NOT EXISTS telegram_crm_links_employee_idx ON public.telegram_crm_links (employee_id);

COMMENT ON TABLE public.telegram_crm_links IS 'Telegram orqali rol va xodimni bog‘lash (bot webhook service role yozadi)';

-- 3) Dam olish so‘rovi (CRM bildirishnoma + tarix)
CREATE TABLE IF NOT EXISTS public.employee_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  telegram_chat_id bigint,
  note text,
  source text NOT NULL DEFAULT 'telegram',
  status text NOT NULL DEFAULT 'pending',
  resolved_at timestamptz,
  resolved_by_telegram_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_leave_requests_created_idx ON public.employee_leave_requests (created_at DESC);

ALTER TABLE public.employee_leave_requests ENABLE ROW LEVEL SECURITY;

-- Frontend anon o‘qishi uchun (loyihangizdagi boshqa jadvallar bilan moslang)
-- Qayta ishga tushirishda 42710 xatosini oldini olish uchun:
DROP POLICY IF EXISTS "employee_leave_requests_select_anon" ON public.employee_leave_requests;
CREATE POLICY "employee_leave_requests_select_anon"
  ON public.employee_leave_requests FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "employee_leave_requests_insert_anon" ON public.employee_leave_requests;
CREATE POLICY "employee_leave_requests_insert_anon"
  ON public.employee_leave_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "employee_leave_requests_update_anon" ON public.employee_leave_requests;
CREATE POLICY "employee_leave_requests_update_anon"
  ON public.employee_leave_requests FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Realtime: Supabase Dashboard → Database → Replication → employee_leave_requests ni yoqing

/*
  Webhook joylashuvi:
  - Agar CRM `output: export` (faqat statik fayl) bilan yig‘ilsa, Next.js ichidagi
    /api/telegram/webhook prod da ishlamaydi. Shunda bot uchun alohida xizmat kerak:
    Vercel/Node server, yoki Supabase Edge Function, yoki boshqa host.
  - Dev: ngrok + https://.../api/telegram/webhook
  - @BotFather: setWebhook, xavfsizlik uchun TELEGRAM_WEBHOOK_SECRET (header:
    X-Telegram-Bot-Api-Secret-Token) ishlating.
  - .env (server): TELEGRAM_BOT_TOKEN, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
    TELEGRAM_MANAGER_CHAT_IDS (vergul bilan chat id lar), TELEGRAM_WEBHOOK_SECRET (ixtiyoriy)
*/
