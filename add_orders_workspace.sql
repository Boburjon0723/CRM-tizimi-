-- Buyurtmalar vs Buyurtmalar2 ajratish
-- Supabase SQL Editor da bir marta ishga tushiring.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS workspace text NOT NULL DEFAULT 'legacy';

COMMENT ON COLUMN public.orders.workspace IS
  'UI moduli: legacy = /buyurtmalar, buyurtmalar2 = /buyurtmalar2';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_workspace_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_workspace_check
      CHECK (workspace IN ('legacy', 'buyurtmalar2'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_workspace_idx
  ON public.orders (workspace);
