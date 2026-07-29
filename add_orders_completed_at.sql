-- Buyurtma tugallanganda (chiqib ketgan) sana
-- Supabase SQL Editor da bir marta ishga tushiring.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.orders.completed_at IS
  'Buyurtma tugallangan / chiqib ketgan vaqt. Arxiv 1 oy shu sanadan hisoblanadi (created_at emas).';

CREATE INDEX IF NOT EXISTS orders_completed_at_idx
  ON public.orders (completed_at DESC NULLS LAST)
  WHERE completed_at IS NOT NULL;

-- Eski tugallanganlar: completed_at bo‘sh bo‘lsa updated_at dan to‘ldirish (created_at emas)
UPDATE public.orders
SET completed_at = updated_at
WHERE completed_at IS NULL
  AND updated_at IS NOT NULL
  AND (
    lower(trim(status::text)) IN ('completed', 'tugallandi', 'tugallangan')
    OR lower(trim(status::text)) LIKE '%tugallan%'
  );
