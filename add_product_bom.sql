-- Bosqich B: mahsulot retsepti (BOM)
-- 1 dona tayyor mahsulotga ketadigan xomashyo miqdorlari.
-- Supabase SQL Editor'da ishga tushiring (avval add_material_stock_inventory.sql).

CREATE TABLE IF NOT EXISTS public.product_bom (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES public.raw_materials (id) ON DELETE RESTRICT,
    qty_per_unit NUMERIC(14, 3) NOT NULL CHECK (qty_per_unit > 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_bom_product_material_unique UNIQUE (product_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_product_bom_product ON public.product_bom (product_id);
CREATE INDEX IF NOT EXISTS idx_product_bom_material ON public.product_bom (material_id);

ALTER TABLE public.product_bom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_bom_crm_all" ON public.product_bom;
DROP POLICY IF EXISTS "crm_staff_all" ON public.product_bom;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_authenticated_user'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "crm_staff_all" ON public.product_bom
        FOR ALL TO authenticated
        USING (public.is_authenticated_user())
        WITH CHECK (public.is_authenticated_user())
    $pol$;
  ELSE
    EXECUTE $pol$
      CREATE POLICY "product_bom_crm_all" ON public.product_bom
        FOR ALL USING (true) WITH CHECK (true)
    $pol$;
  END IF;
END $$;
