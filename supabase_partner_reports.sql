-- Partner sales reports storage (for Statistics page Excel imports)
-- Run this in Supabase SQL Editor once.

create table if not exists public.partner_report_batches (
    id uuid primary key default gen_random_uuid(),
    partner_name text not null default 'Hamkor',
    file_name text not null,
    report_date date not null default current_date,
    note text null,
    created_at timestamptz not null default now()
);

create table if not exists public.partner_report_lines (
    id uuid primary key default gen_random_uuid(),
    batch_id uuid not null references public.partner_report_batches(id) on delete cascade,
    product_name text not null,
    product_code text not null,
    color text null,
    qty numeric(14,3) not null default 0,
    unit_price numeric(14,2) not null default 0,
    amount numeric(14,2) not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists idx_partner_report_lines_batch_id on public.partner_report_lines(batch_id);
create index if not exists idx_partner_report_lines_product_code on public.partner_report_lines(product_code);
create index if not exists idx_partner_report_batches_partner_date on public.partner_report_batches(partner_name, report_date);

-- RLS (for frontend Supabase client)
alter table public.partner_report_batches enable row level security;
alter table public.partner_report_lines enable row level security;

drop policy if exists "partner_report_batches_select_all" on public.partner_report_batches;
create policy "partner_report_batches_select_all"
on public.partner_report_batches
for select
to anon, authenticated
using (true);

drop policy if exists "partner_report_batches_insert_all" on public.partner_report_batches;
create policy "partner_report_batches_insert_all"
on public.partner_report_batches
for insert
to anon, authenticated
with check (true);

drop policy if exists "partner_report_batches_update_all" on public.partner_report_batches;
create policy "partner_report_batches_update_all"
on public.partner_report_batches
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "partner_report_batches_delete_all" on public.partner_report_batches;
create policy "partner_report_batches_delete_all"
on public.partner_report_batches
for delete
to anon, authenticated
using (true);

drop policy if exists "partner_report_lines_select_all" on public.partner_report_lines;
create policy "partner_report_lines_select_all"
on public.partner_report_lines
for select
to anon, authenticated
using (true);

drop policy if exists "partner_report_lines_insert_all" on public.partner_report_lines;
create policy "partner_report_lines_insert_all"
on public.partner_report_lines
for insert
to anon, authenticated
with check (true);

drop policy if exists "partner_report_lines_update_all" on public.partner_report_lines;
create policy "partner_report_lines_update_all"
on public.partner_report_lines
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "partner_report_lines_delete_all" on public.partner_report_lines;
create policy "partner_report_lines_delete_all"
on public.partner_report_lines
for delete
to anon, authenticated
using (true);
