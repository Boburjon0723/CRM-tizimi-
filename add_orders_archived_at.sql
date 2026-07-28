-- Eski tugallangan buyurtmalar arxivi (korzinkadan alohida)
-- Supabase SQL Editor da bir marta ishga tushiring.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.orders.archived_at IS
  '1 oydan eski tugallangan buyurtma arxivi. deleted_at — korzinka (o‘chirilganlar).';

CREATE INDEX IF NOT EXISTS orders_archived_at_idx
  ON public.orders (archived_at DESC NULLS LAST)
  WHERE archived_at IS NOT NULL;
