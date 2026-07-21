-- Bosqich A: xomashyo miqdor ombori (keldi / ketdi / qoldi)
-- Mavjud `raw_materials` kengaytiriladi; yangi `material_stock_movements` jurnali.
-- Supabase SQL Editor'da ishga tushiring.

-- 1. raw_materials kengaytirish
ALTER TABLE public.raw_materials
    ADD COLUMN IF NOT EXISTS sku TEXT,
    ADD COLUMN IF NOT EXISTS item_kind TEXT NOT NULL DEFAULT 'raw',
    ADD COLUMN IF NOT EXISTS min_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS note TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Agar track_stock / stock_quantity yo'q bo'lsa (eski sxema)
ALTER TABLE public.raw_materials
    ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS stock_quantity NUMERIC(14, 3) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unit_price_uzs NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS name_uz TEXT,
    ADD COLUMN IF NOT EXISTS name_ru TEXT,
    ADD COLUMN IF NOT EXISTS name_en TEXT,
    ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'pcs';

ALTER TABLE public.raw_materials
    DROP CONSTRAINT IF EXISTS raw_materials_item_kind_check;

ALTER TABLE public.raw_materials
    ADD CONSTRAINT raw_materials_item_kind_check CHECK (item_kind IN ('raw', 'semi'));

-- unit check: eski constraint bo'lsa yangilanadi (l qo'shiladi)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'raw_materials_unit_check'
  ) THEN
    ALTER TABLE public.raw_materials DROP CONSTRAINT raw_materials_unit_check;
  END IF;
  ALTER TABLE public.raw_materials
    ADD CONSTRAINT raw_materials_unit_check CHECK (unit IN ('kg', 'm', 'pcs', 'l'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'unit check skipped: %', SQLERRM;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_materials_sku_unique
    ON public.raw_materials (lower(trim(sku)))
    WHERE sku IS NOT NULL AND trim(sku) <> '';

CREATE INDEX IF NOT EXISTS idx_raw_materials_active
    ON public.raw_materials (is_active)
    WHERE is_active = true;

-- 2. Miqdor harakatlari jurnali
CREATE TABLE IF NOT EXISTS public.material_stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_material_id UUID NOT NULL REFERENCES public.raw_materials (id) ON DELETE RESTRICT,
    qty NUMERIC(14, 3) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('in', 'out', 'adjust', 'consume', 'produce_in')),
    balance_after NUMERIC(14, 3),
    ref_type TEXT,
    ref_id UUID,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_stock_movements_material
    ON public.material_stock_movements (raw_material_id);

CREATE INDEX IF NOT EXISTS idx_material_stock_movements_created
    ON public.material_stock_movements (created_at DESC);

-- 3. RLS (authenticated вЂ” is_authenticated_user mavjud bo'lsa)
ALTER TABLE public.material_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_stock_movements_crm_all" ON public.material_stock_movements;
DROP POLICY IF EXISTS "crm_staff_all" ON public.material_stock_movements;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_authenticated_user'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "crm_staff_all" ON public.material_stock_movements
        FOR ALL TO authenticated
        USING (public.is_authenticated_user())
        WITH CHECK (public.is_authenticated_user())
    $pol$;
  ELSE
    EXECUTE $pol$
      CREATE POLICY "material_stock_movements_crm_all" ON public.material_stock_movements
        FOR ALL USING (true) WITH CHECK (true)
    $pol$;
  END IF;
END $$;
