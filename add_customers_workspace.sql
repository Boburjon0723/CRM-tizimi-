-- Buyurtmalar2 buyurtmachilarini Mijozlar ro‘yxatidan ajratish
-- Supabase SQL Editor da bir marta ishga tushiring.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS workspace text;

COMMENT ON COLUMN public.customers.workspace IS
  'UI moduli: buyurtmalar2 = faqat /buyurtmalar2 da ko‘rinadi; NULL/legacy = Mijozlar';

CREATE INDEX IF NOT EXISTS customers_workspace_idx
  ON public.customers (workspace)
  WHERE workspace IS NOT NULL;
