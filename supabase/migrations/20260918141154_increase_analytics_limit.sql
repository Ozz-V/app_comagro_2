CREATE OR REPLACE FUNCTION public.get_global_analytics_rows(p_since timestamptz DEFAULT NULL)
RETURNS TABLE(modelo text, marca text, sku text, action text, user_email text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT modelo, marca, sku, action, user_email, created_at
  FROM public.producto_analytics
  WHERE (p_since IS NULL OR created_at >= p_since)
  ORDER BY created_at DESC
  LIMIT 500000;
$$;