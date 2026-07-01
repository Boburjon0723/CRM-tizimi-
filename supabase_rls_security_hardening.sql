-- =============================================================================
-- Supabase xavfsizlik: RLS mustahkamlash
-- Dashboard → Security Advisor dagi «RLS disabled» / «policy always true» ogohlantirishlari
--
-- NIMA QILADI:
-- 1) CRM jadvallarida anon (kalitsiz) kirishni yopadi — faqat tizimga kirgan foydalanuvchi
-- 2) Veb-do‘kon uchun kerakli anon SELECT / INSERT (mahsulot, buyurtma) saqlanadi
-- 3) partner_report_* va employee_leave_requests dagi USING (true) siyosatlarini almashtiradi
--
-- OLDIN:
-- - CRM da email/parol bilan kirish bor, lekin anon kalit brauzerda ochiq — RLS bo‘lmasa
--   yoki USING(true) bo‘lsa, istalgan odam REST API orqali barcha ma’lumotni o‘qishi mumkin.
--
-- KEYIN: SQL Editor da ishga tushiring → CRM ga qayta kiring (sessiya JWT bilan ishlaydi).
-- Veb-do‘kon (React) alohida sinab ko‘ring: katalog va buyurtma berish ishlashi kerak.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Yordamchi funksiyalar
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

COMMENT ON FUNCTION public.is_authenticated_user() IS
  'JWT sessiya bor-yo‘qligi (anon emas). CRM uchun shu yetarli — alohida rol tekshiruvi yo‘q.';

-- -----------------------------------------------------------------------------
-- 2) Jadval mavjudligini tekshirish va RLS yoqish
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.__enable_rls_if_table_exists(tbl regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass(tbl::text) IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  END IF;
END;
$$;

SELECT public.__enable_rls_if_table_exists('public.employees');
SELECT public.__enable_rls_if_table_exists('public.employee_advances');
SELECT public.__enable_rls_if_table_exists('public.employee_salary_payments');
SELECT public.__enable_rls_if_table_exists('public.employee_payroll_month_closures');
SELECT public.__enable_rls_if_table_exists('public.employee_leave_requests');
SELECT public.__enable_rls_if_table_exists('public.finance_partners');
SELECT public.__enable_rls_if_table_exists('public.partner_finance_entries');
SELECT public.__enable_rls_if_table_exists('public.partner_finance_entry_lines');
SELECT public.__enable_rls_if_table_exists('public.partner_report_batches');
SELECT public.__enable_rls_if_table_exists('public.partner_report_lines');
SELECT public.__enable_rls_if_table_exists('public.raw_materials');
SELECT public.__enable_rls_if_table_exists('public.stock_movements');
SELECT public.__enable_rls_if_table_exists('public.stock_history');
SELECT public.__enable_rls_if_table_exists('public.expenses');
SELECT public.__enable_rls_if_table_exists('public.transactions');
SELECT public.__enable_rls_if_table_exists('public.attendance');
SELECT public.__enable_rls_if_table_exists('public.salary_payments');
SELECT public.__enable_rls_if_table_exists('public.telegram_crm_links');
SELECT public.__enable_rls_if_table_exists('public.contact_messages');
SELECT public.__enable_rls_if_table_exists('public.profiles');
SELECT public.__enable_rls_if_table_exists('public.orders');
SELECT public.__enable_rls_if_table_exists('public.order_items');
SELECT public.__enable_rls_if_table_exists('public.products');
SELECT public.__enable_rls_if_table_exists('public.product_colors');
SELECT public.__enable_rls_if_table_exists('public.categories');
SELECT public.__enable_rls_if_table_exists('public.customers');
SELECT public.__enable_rls_if_table_exists('public.settings');
SELECT public.__enable_rls_if_table_exists('public.banners');
SELECT public.__enable_rls_if_table_exists('public.newsletter_subscriptions');
SELECT public.__enable_rls_if_table_exists('public.reviews');

-- -----------------------------------------------------------------------------
-- 3) Xavfli ochiq siyosatlarni olib tashlash (loyihadagi SQL nomlari)
-- -----------------------------------------------------------------------------

-- partner_report (supabase_partner_reports.sql)
DROP POLICY IF EXISTS "partner_report_batches_select_all" ON public.partner_report_batches;
DROP POLICY IF EXISTS "partner_report_batches_insert_all" ON public.partner_report_batches;
DROP POLICY IF EXISTS "partner_report_batches_update_all" ON public.partner_report_batches;
DROP POLICY IF EXISTS "partner_report_batches_delete_all" ON public.partner_report_batches;
DROP POLICY IF EXISTS "partner_report_lines_select_all" ON public.partner_report_lines;
DROP POLICY IF EXISTS "partner_report_lines_insert_all" ON public.partner_report_lines;
DROP POLICY IF EXISTS "partner_report_lines_update_all" ON public.partner_report_lines;
DROP POLICY IF EXISTS "partner_report_lines_delete_all" ON public.partner_report_lines;

-- employee leave (supabase_crm_employee_phone_leave_bot.sql)
DROP POLICY IF EXISTS "employee_leave_requests_select_anon" ON public.employee_leave_requests;
DROP POLICY IF EXISTS "employee_leave_requests_insert_anon" ON public.employee_leave_requests;
DROP POLICY IF EXISTS "employee_leave_requests_update_anon" ON public.employee_leave_requests;

-- -----------------------------------------------------------------------------
-- 4) CRM jadvallari — faqat tizimga kirgan foydalanuvchi (rol shart emas)
-- -----------------------------------------------------------------------------

DO $policy$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'employees',
    'employee_advances',
    'employee_salary_payments',
    'employee_payroll_month_closures',
    'employee_leave_requests',
    'finance_partners',
    'partner_finance_entries',
    'partner_finance_entry_lines',
    'partner_report_batches',
    'partner_report_lines',
    'raw_materials',
    'stock_movements',
    'stock_history',
    'expenses',
    'transactions',
    'attendance',
    'salary_payments',
    'telegram_crm_links'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_staff_all', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user())',
      'crm_staff_all',
      tbl
    );
  END LOOP;
END;
$policy$;

-- profiles: kirgan foydalanuvchi o‘z qatorini o‘qishi mumkin
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
CREATE POLICY "profiles_read_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_auth_write" ON public.profiles;
CREATE POLICY "profiles_auth_write"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- contact_messages: sayt formasi anon INSERT, CRM o‘qadi
DROP POLICY IF EXISTS "contact_messages_anon_insert" ON public.contact_messages;
CREATE POLICY "contact_messages_anon_insert"
  ON public.contact_messages FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "contact_messages_crm_all" ON public.contact_messages;
CREATE POLICY "contact_messages_crm_all"
  ON public.contact_messages FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- -----------------------------------------------------------------------------
-- 5) Veb-do‘kon (anon) + CRM (authenticated) — umumiy jadvallar
-- -----------------------------------------------------------------------------

-- products
DROP POLICY IF EXISTS "products_anon_select" ON public.products;
CREATE POLICY "products_anon_select"
  ON public.products FOR SELECT TO anon
  USING (coalesce(is_active, true) = true);

DROP POLICY IF EXISTS "products_crm_all" ON public.products;
CREATE POLICY "products_crm_all"
  ON public.products FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- product_colors
DROP POLICY IF EXISTS "product_colors_anon_select" ON public.product_colors;
CREATE POLICY "product_colors_anon_select"
  ON public.product_colors FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "product_colors_crm_all" ON public.product_colors;
CREATE POLICY "product_colors_crm_all"
  ON public.product_colors FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- categories
DROP POLICY IF EXISTS "categories_anon_select" ON public.categories;
CREATE POLICY "categories_anon_select"
  ON public.categories FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "categories_crm_all" ON public.categories;
CREATE POLICY "categories_crm_all"
  ON public.categories FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- settings, banners — ommaviy o‘qish
DROP POLICY IF EXISTS "settings_anon_select" ON public.settings;
CREATE POLICY "settings_anon_select"
  ON public.settings FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "settings_crm_all" ON public.settings;
CREATE POLICY "settings_crm_all"
  ON public.settings FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

DROP POLICY IF EXISTS "banners_anon_select" ON public.banners;
CREATE POLICY "banners_anon_select"
  ON public.banners FOR SELECT TO anon
  USING (coalesce(is_active, true) = true);

DROP POLICY IF EXISTS "banners_crm_all" ON public.banners;
CREATE POLICY "banners_crm_all"
  ON public.banners FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- orders: mehmon buyurtma + CRM to‘liq
DROP POLICY IF EXISTS "orders_anon_insert" ON public.orders;
CREATE POLICY "orders_anon_insert"
  ON public.orders FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "orders_crm_all" ON public.orders;
CREATE POLICY "orders_crm_all"
  ON public.orders FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- order_items
DROP POLICY IF EXISTS "order_items_anon_insert" ON public.order_items;
CREATE POLICY "order_items_anon_insert"
  ON public.order_items FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "order_items_crm_all" ON public.order_items;
CREATE POLICY "order_items_crm_all"
  ON public.order_items FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- customers: checkout upsert (anon cheklangan — CRM to‘liq)
DROP POLICY IF EXISTS "customers_anon_insert" ON public.customers;
CREATE POLICY "customers_anon_insert"
  ON public.customers FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "customers_anon_select" ON public.customers;
CREATE POLICY "customers_anon_select"
  ON public.customers FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "customers_anon_update" ON public.customers;
CREATE POLICY "customers_anon_update"
  ON public.customers FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "customers_crm_all" ON public.customers;
CREATE POLICY "customers_crm_all"
  ON public.customers FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- newsletter, reviews — ommaviy forma
DROP POLICY IF EXISTS "newsletter_anon_insert" ON public.newsletter_subscriptions;
CREATE POLICY "newsletter_anon_insert"
  ON public.newsletter_subscriptions FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "newsletter_crm_all" ON public.newsletter_subscriptions;
CREATE POLICY "newsletter_crm_all"
  ON public.newsletter_subscriptions FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

DROP POLICY IF EXISTS "reviews_anon_select" ON public.reviews;
CREATE POLICY "reviews_anon_select"
  ON public.reviews FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "reviews_anon_insert" ON public.reviews;
CREATE POLICY "reviews_anon_insert"
  ON public.reviews FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "reviews_crm_all" ON public.reviews;
CREATE POLICY "reviews_crm_all"
  ON public.reviews FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- -----------------------------------------------------------------------------
-- 6) Tozalash
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.__enable_rls_if_table_exists(regclass);

-- =============================================================================
-- ESLATMALAR
-- =============================================================================
-- 1) CRM: email/parol bilan kirgan har qanday foydalanuvchi ishlaydi (profiles.role shart emas).
-- 2) SUPABASE_SERVICE_ROLE_KEY faqat serverda (.env, webhook) — hech qachon NEXT_PUBLIC_ emas!
-- 3) Dashboard → Authentication → Settings: leaked password protection yoqing.
-- 4) Storage bucketlar uchun ham RLS tekshiring (Dashboard → Storage → Policies).
-- =============================================================================
