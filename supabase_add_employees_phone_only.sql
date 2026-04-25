-- Tez tuzatish: CRM xatosi PGRST204 — "Could not find the 'phone' column of 'employees'"
--
-- 1) Supabase Dashboard → SQL Editor → New query
-- 2) Bu faylning BARCHASIni nusxalab yopishtiring → Run
-- 3) Brauzerda CRM ni bir marta yangilang (F5), qayta saqlang
--
-- Keyin kerak bo‘lsa: supabase_crm_employee_phone_leave_bot.sql (telegram + dam olish jadvallari)

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.employees.phone IS '998XXXXXXXXX — CRM va Telegram bot';

CREATE UNIQUE INDEX IF NOT EXISTS employees_phone_unique
  ON public.employees (phone)
  WHERE phone IS NOT NULL AND trim(phone) <> '';
