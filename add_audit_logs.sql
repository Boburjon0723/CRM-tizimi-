-- ============================================================================
-- AUDIT LOG (amallar tarixi) — /loglar sahifasi uchun
--
-- Bu skriptni Supabase Dashboard → SQL Editor da BIR MARTA ishga tushiring.
-- Qayta ishga tushirish xavfsiz (idempotent): hamma narsa IF NOT EXISTS /
-- CREATE OR REPLACE / DROP ... IF EXISTS orqali yozilgan.
--
-- Nima qiladi:
--   1. public.audit_logs jadvalini yaratadi.
--   2. Universal trigger funksiyasi — har qanday jadvaldagi INSERT/UPDATE/DELETE
--      ni yozib boradi: kim, qachon, qaysi jadval, qaysi yozuv, qaysi maydon
--      qanday qiymatdan qanday qiymatga o‘zgardi.
--   3. Pastdagi ro‘yxatdagi jadvallarga triggerni ulaydi (mavjud bo‘lmagan
--      jadvallar jimgina o‘tkazib yuboriladi).
--
-- Muhim: trigger DB darajasida ishlaydi — shuning uchun CRM UI, skriptlar,
-- Telegram bot va hatto Supabase panelidan qo‘lda tahrirlash ham yoziladi.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Jadval
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    -- bigserial: log yozuvlari bir tranzaksiyada bir xil now() oladi, shuning
    -- uchun barqaror xronologik tartib uchun o‘suvchi id kerak
    id             BIGSERIAL PRIMARY KEY,
    table_name     TEXT        NOT NULL,
    record_id      TEXT,
    action         TEXT        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    actor_id       UUID,
    actor_email    TEXT,
    actor_role     TEXT,
    record_label   TEXT,
    changed_fields JSONB,
    old_data       JSONB,
    new_data       JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.audit_logs IS
    'Amallar tarixi: qaysi jadvalda, qaysi yozuvda, kim, qachon, nimani o‘zgartirdi.';
COMMENT ON COLUMN public.audit_logs.record_label IS
    'Yozuvni odam o‘qiy oladigan nomi (buyurtma raqami, mijoz ismi, mahsulot nomi...).';
COMMENT ON COLUMN public.audit_logs.changed_fields IS
    'UPDATE uchun faqat o‘zgargan maydonlar: {"maydon": {"old": ..., "new": ...}}.';
COMMENT ON COLUMN public.audit_logs.actor_role IS
    'authenticated = CRM foydalanuvchisi, service_role = skript/server, anon = tashqi.';

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
    ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_table_name_idx
    ON public.audit_logs (table_name, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_record_idx
    ON public.audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
    ON public.audit_logs (actor_email);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx
    ON public.audit_logs (action);

-- ---------------------------------------------------------------------------
-- 2. Yordamchi: juda uzun matnlarni qisqartirish (log jadvali shishmasligi uchun)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_trim_jsonb(v JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_text TEXT;
BEGIN
    IF v IS NULL THEN
        RETURN NULL;
    END IF;
    IF jsonb_typeof(v) = 'string' THEN
        v_text := v #>> '{}';
        IF length(v_text) > 500 THEN
            RETURN to_jsonb(left(v_text, 500) || '…');
        END IF;
    END IF;
    RETURN v;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Universal trigger funksiyasi
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old      JSONB;
    v_new      JSONB;
    v_changed  JSONB := '{}'::JSONB;
    v_key      TEXT;
    v_actor    UUID;
    v_email    TEXT;
    v_role     TEXT;
    v_claims   JSONB;
    -- Bu ustunlar o‘zgarishi log uchun ma'nosiz — diffda ko‘rsatilmaydi
    v_ignored  TEXT[] := ARRAY['updated_at'];
BEGIN
    -- Kim qildi
    BEGIN
        v_claims := nullif(current_setting('request.jwt.claims', true), '')::JSONB;
    EXCEPTION WHEN OTHERS THEN
        v_claims := NULL;
    END;

    BEGIN
        v_actor := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_actor := NULL;
    END;

    v_email := v_claims ->> 'email';
    v_role  := coalesce(v_claims ->> 'role', current_user);

    -- JWT da email bo‘lmasa — auth.users dan bir marta olib qo‘yamiz
    IF v_email IS NULL AND v_actor IS NOT NULL THEN
        BEGIN
            SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_actor;
        EXCEPTION WHEN OTHERS THEN
            v_email := NULL;
        END;
    END IF;

    -- Nima o‘zgardi
    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_new := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_old := NULL;
        v_new := to_jsonb(NEW);
    ELSE
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);

        FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
            CONTINUE WHEN v_key = ANY (v_ignored);
            IF (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
                v_changed := v_changed || jsonb_build_object(
                    v_key,
                    jsonb_build_object(
                        'old', public.audit_trim_jsonb(v_old -> v_key),
                        'new', public.audit_trim_jsonb(v_new -> v_key)
                    )
                );
            END IF;
        END LOOP;

        -- Haqiqiy o‘zgarish bo‘lmasa (masalan faqat updated_at) — yozmaymiz
        IF v_changed = '{}'::JSONB THEN
            RETURN NULL;
        END IF;
    END IF;

    INSERT INTO public.audit_logs (
        table_name, record_id, action, actor_id, actor_email, actor_role,
        record_label, changed_fields, old_data, new_data
    )
    VALUES (
        TG_TABLE_NAME,
        coalesce(v_new ->> 'id', v_old ->> 'id'),
        TG_OP,
        v_actor,
        v_email,
        v_role,
        coalesce(
            v_new ->> 'order_number', v_old ->> 'order_number',
            v_new ->> 'name',         v_old ->> 'name',
            v_new ->> 'customer_name', v_old ->> 'customer_name',
            v_new ->> 'title',        v_old ->> 'title',
            v_new ->> 'model_code',   v_old ->> 'model_code',
            v_new ->> 'product_name', v_old ->> 'product_name',
            v_new ->> 'email',        v_old ->> 'email'
        ),
        nullif(v_changed, '{}'::JSONB),
        -- UPDATE da to‘liq nusxa saqlanmaydi (changed_fields yetarli)
        CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE NULL END,
        CASE WHEN TG_OP = 'INSERT' THEN v_new ELSE NULL END
    );

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.audit_log_changes() IS
    'Universal audit trigger — INSERT/UPDATE/DELETE ni public.audit_logs ga yozadi.';

-- ---------------------------------------------------------------------------
-- 4. Triggerni jadvallarga ulash
--    Yangi jadval qo‘shmoqchi bo‘lsangiz — shu ro‘yxatga nom qo‘shib,
--    skriptni qaytadan ishga tushiring.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        -- Buyurtmalar
        'orders', 'order_items',
        -- Mijozlar
        'customers',
        -- Mahsulotlar va ombor
        'products', 'product_colors', 'product_inventory', 'categories',
        'stock_movements', 'product_bom', 'erp_store_inventory',
        -- Xomashyo va ishlab chiqarish
        'raw_materials', 'material_stock_movements', 'material_movements',
        'production_runs',
        -- Moliya
        'finance_partners', 'partner_finance_entries', 'partner_finance_entry_lines',
        'transactions', 'departments',
        'partner_report_batches', 'partner_report_lines',
        -- Xodimlar
        'employees', 'employee_advances', 'employee_salary_payments',
        'employee_payroll_month_closures', 'employee_leave_requests',
        -- Vebsayt va sozlamalar
        'settings', 'banners', 'site_benefits', 'reviews', 'album_images',
        'newsletter_subscriptions', 'contact_messages',
        -- Integratsiya
        'telegram_crm_links', 'user_profiles'
    ];
    v_table   TEXT;
    v_trigger TEXT;
    v_done    INT := 0;
    v_skipped INT := 0;
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = v_table
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        v_trigger := 'audit_' || v_table;

        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v_trigger, v_table);
        EXECUTE format(
            'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
                 FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()',
            v_trigger, v_table
        );

        v_done := v_done + 1;
    END LOOP;

    RAISE NOTICE 'Audit trigger ulandi: % jadval, o‘tkazib yuborildi (mavjud emas): %',
        v_done, v_skipped;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS — loglarni faqat tizimga kirganlar o‘qiydi.
--    Yozish faqat trigger orqali (SECURITY DEFINER), mijoz to‘g‘ridan-to‘g‘ri
--    log yozolmaydi, o‘zgartirolmaydi va o‘cholmaydi.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_authenticated ON public.audit_logs;
CREATE POLICY audit_logs_select_authenticated
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.audit_logs_id_seq TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Tekshirish
-- ---------------------------------------------------------------------------
-- Ulangan triggerlar ro‘yxati:
--   SELECT event_object_table, trigger_name
--   FROM information_schema.triggers
--   WHERE trigger_name LIKE 'audit_%'
--   ORDER BY event_object_table;
--
-- Oxirgi 20 ta log:
--   SELECT created_at, actor_email, action, table_name, record_label, changed_fields
--   FROM public.audit_logs ORDER BY id DESC LIMIT 20;
--
-- Eski loglarni tozalash (masalan 6 oydan eski):
--   DELETE FROM public.audit_logs WHERE created_at < now() - interval '6 months';
