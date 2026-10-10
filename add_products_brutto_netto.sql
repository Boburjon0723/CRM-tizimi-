-- 1 dona (kg rejimida 1 kg):
-- netto_kg — qadoqsiz mahsulot
-- brutto_kg — mahsulot + kichik karobka
-- master_pack_qty — bitta katta karobkaga nechta kichik karobka sig'adi (masalan 16)
-- master_box_kg — faqat katta karobkaning o'zi (bo'sh)
alter table public.products add column if not exists netto_kg numeric;
alter table public.products add column if not exists brutto_kg numeric;
alter table public.products add column if not exists master_pack_qty integer;
alter table public.products add column if not exists master_box_kg numeric;
