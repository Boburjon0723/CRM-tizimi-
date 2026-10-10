-- Mahsulot yaratilgan va oxirgi tahrir vaqti.
-- created_at ko‘pincha allaqachon bor; yo‘q bo‘lsa qo‘shiladi.
alter table public.products add column if not exists created_at timestamptz default now();
alter table public.products add column if not exists updated_at timestamptz;
