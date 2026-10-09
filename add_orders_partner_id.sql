-- Buyurtmani yaratish paytida hamkorga (buyurtmachi) bog‘lash.
-- Supabase SQL Editor da bir marta ishga tushiring.

alter table public.orders
  add column if not exists partner_id uuid;

create index if not exists orders_partner_id_idx on public.orders (partner_id);
