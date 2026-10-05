-- D&L ACC - Product Code Migration
-- Run this ONCE in Supabase SQL Editor before using the new product-code fields.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_code text;

-- Give existing products unique codes based on their current database IDs.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM public.products
  WHERE product_code IS NULL OR BTRIM(product_code) = ''
)
UPDATE public.products AS p
SET product_code = 'DL-' || LPAD(numbered.rn::text, 6, '0')
FROM numbered
WHERE p.id = numbered.id;

-- Prevent duplicate product codes at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_unique
ON public.products (product_code);

-- New products are expected to always have a code.
ALTER TABLE public.products
ALTER COLUMN product_code SET NOT NULL;
