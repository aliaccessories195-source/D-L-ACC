-- D&L ACC - Product Code Migration (v2)
-- شغّله مرة واحدة في Supabase > SQL Editor (آمن لو اتشغل أكتر من مرة).
-- بيعمل: عمود الكود + كود تلقائي لكل المنتجات القديمة + كود تلقائي لأي منتج جديد
-- حتى لو الأدمن/الكاش القديم ما بعتش كود.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code text;

CREATE SEQUENCE IF NOT EXISTS public.product_code_seq;

-- ابدأ الترقيم بعد أكبر رقم موجود بالفعل في أكواد DL-xxxxxx
SELECT setval(
  'public.product_code_seq',
  GREATEST(
    COALESCE((SELECT MAX(SUBSTRING(product_code FROM '^DL-(\d+)$')::bigint)
              FROM public.products
              WHERE product_code ~ '^DL-\d+$'), 0),
    (SELECT last_value FROM public.product_code_seq)
  )
);

-- دالة توليد كود فريد
CREATE OR REPLACE FUNCTION public.next_product_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c text;
BEGIN
  LOOP
    c := 'DL-' || LPAD(nextval('public.product_code_seq')::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.products WHERE product_code = c);
  END LOOP;
  RETURN c;
END $$;

-- Trigger: أي منتج جديد (أو تعديل بكود فاضي) ياخد كود تلقائي
CREATE OR REPLACE FUNCTION public.products_set_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_code IS NULL OR BTRIM(NEW.product_code) = '' THEN
    NEW.product_code := public.next_product_code();
  ELSE
    NEW.product_code := UPPER(REGEXP_REPLACE(NEW.product_code, '\s+', '', 'g'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_set_code ON public.products;
CREATE TRIGGER trg_products_set_code
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_set_code();

-- كود لكل المنتجات الحالية اللي ملهاش كود (الـ trigger بيملا الكود وقت الـ UPDATE)
UPDATE public.products SET product_code = NULL
WHERE product_code IS NULL OR BTRIM(product_code) = '';

-- منع التكرار + إلزام وجود كود
CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_unique
ON public.products (product_code);

ALTER TABLE public.products ALTER COLUMN product_code SET NOT NULL;
-- ملاحظة: SET NOT NULL بعد الـ trigger آمن لأن الـ trigger بيملا الكود قبل الحفظ.

-- تأكيد: لازم يرجع 0
SELECT COUNT(*) AS products_without_code FROM public.products
WHERE product_code IS NULL OR BTRIM(product_code) = '';
