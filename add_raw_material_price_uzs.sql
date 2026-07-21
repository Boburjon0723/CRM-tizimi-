-- Xomashyo birlik narxi: UZS maydoni (USD = unit_price)
ALTER TABLE public.raw_materials
    ADD COLUMN IF NOT EXISTS unit_price_uzs NUMERIC(14, 2) DEFAULT 0;
