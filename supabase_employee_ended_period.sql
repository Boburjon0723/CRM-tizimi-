-- Xodimni butunlay o‘chirmasdan, tanlangan oydan boshlab yashirish.
-- Oldingi oylardagi avans, oylik va hisob-kitoblar saqlanadi.
--
-- Supabase Dashboard → SQL Editor → Run

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS ended_period_ym text;

COMMENT ON COLUMN public.employees.ended_period_ym IS
  'YYYY-MM — shu oydan (shu oy va keyin) CRM ro‘yxatida ko‘rinmaydi; oldingi oylar tarixda qoladi.';

CREATE INDEX IF NOT EXISTS employees_ended_period_ym_idx
  ON public.employees (ended_period_ym)
  WHERE ended_period_ym IS NOT NULL;
