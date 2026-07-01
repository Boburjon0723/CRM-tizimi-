-- Agar avval supabase_rls_security_hardening.sql (rol bilan) ishga tushirilgan bo‘lsa,
-- shu faylni SQL Editor da Run qiling — rol tekshiruvi olib tashlanadi.
-- Kirgan har qanday foydalanuvchi CRM jadvallariga kira oladi.

CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

DROP FUNCTION IF EXISTS public.is_crm_user();

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

-- profiles
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_crm_write" ON public.profiles;
DROP POLICY IF EXISTS "profiles_auth_write" ON public.profiles;

CREATE POLICY "profiles_read_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_auth_write"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

-- Umumiy jadvallar (authenticated = to‘liq kirish)
DO $named$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT unnest(ARRAY[
      'contact_messages_crm_all',
      'products_crm_all',
      'product_colors_crm_all',
      'categories_crm_all',
      'settings_crm_all',
      'banners_crm_all',
      'orders_crm_all',
      'order_items_crm_all',
      'customers_crm_all',
      'newsletter_crm_all',
      'reviews_crm_all'
    ]) AS pol,
    unnest(ARRAY[
      'contact_messages',
      'products',
      'product_colors',
      'categories',
      'settings',
      'banners',
      'orders',
      'order_items',
      'customers',
      'newsletter_subscriptions',
      'reviews'
    ]) AS tbl
  LOOP
    IF to_regclass('public.' || rec.tbl) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.pol, rec.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user())',
      rec.pol,
      rec.tbl
    );
  END LOOP;
END;
$named$;
