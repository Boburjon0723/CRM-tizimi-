-- Buyurtma tugallanganda (chiqib ketgan) sana
-- Supabase SQL Editor da bir marta ishga tushiring.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.orders.completed_at IS
  'Buyurtma tugallangan / chiqib ketgan vaqt. created_at — tushgan sana.';

CREATE INDEX IF NOT EXISTS orders_completed_at_idx
  ON public.orders (completed_at DESC NULLS LAST)
  WHERE completed_at IS NOT NULL;
