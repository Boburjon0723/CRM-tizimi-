-- «Oylikni yopish»: oy berilgan pullar bilan yopiladi, yangi pul yozilmaydi.
-- CRM yopish belgisini employee_salary_payments ga amount = 0 bilan yozadi,
-- shuning uchun cheklovni amount > 0 dan amount >= 0 ga yumshatamiz.
-- Supabase → SQL Editor da bir marta ishga tushiring.

ALTER TABLE public.employee_salary_payments
    DROP CONSTRAINT IF EXISTS employee_salary_payments_amount_check;

ALTER TABLE public.employee_salary_payments
    ADD CONSTRAINT employee_salary_payments_amount_check CHECK (amount >= 0);
