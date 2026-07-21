-- Bosqich C: ishlab chiqarish (tayyorlash) hujjati
-- Supabase SQL Editor'da ishga tushiring
-- (avval: add_material_stock_inventory.sql, add_product_bom.sql)

CREATE TABLE IF NOT EXISTS public.production_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
    qty NUMERIC(14, 3) NOT NULL CHECK (qty > 0),
    color_key TEXT,
    status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('draft', 'done', 'cancelled')),
    note TEXT,
    produced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_runs_product ON public.production_runs (product_id);
CREATE INDEX IF NOT EXISTS idx_production_runs_produced ON public.production_runs (produced_at DESC);

ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "production_runs_crm_all" ON public.production_runs;
DROP POLICY IF EXISTS "crm_staff_all" ON public.production_runs;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_authenticated_user'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "crm_staff_all" ON public.production_runs
        FOR ALL TO authenticated
        USING (public.is_authenticated_user())
        WITH CHECK (public.is_authenticated_user())
    $pol$;
  ELSE
    EXECUTE $pol$
      CREATE POLICY "production_runs_crm_all" ON public.production_runs
        FOR ALL USING (true) WITH CHECK (true)
    $pol$;
  END IF;
END $$;

-- stock_movements type ga 'production' qo'shish (agar CHECK bo'lsa)
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'stock_movements'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%type%';

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.stock_movements DROP CONSTRAINT %I', conname);
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_type_check
      CHECK (type IN (
        'manual_adjustment', 'sale', 'restock', 'return', 'initial_entry', 'production', 'in', 'out', 'adjustment'
      ));
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'stock_movements type check skip: %', SQLERRM;
END $$;
