-- Supabase Schema Snapshot
-- Generated manually via SQL Editor

CREATE TABLE IF NOT EXISTS public.ai_company_knowledge (
  id uuid NOT NULL,
  rule text NOT NULL,
  created_at timestamp with time zone,
  embedding vector
);

ALTER TABLE public.ai_company_knowledge ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.app_config (
  id text NOT NULL,
  ai_prompt text NOT NULL,
  ai_api_keys text,
  groq_api_keys text
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.catalogos (
  id uuid NOT NULL,
  archivo text NOT NULL,
  logo text NOT NULL,
  label text NOT NULL,
  orden integer,
  created_at timestamp with time zone
);

ALTER TABLE public.catalogos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_user_metrics (
  user_id text NOT NULL,
  strike_count integer,
  banned_until timestamp with time zone,
  request_count integer,
  last_request_at timestamp with time zone,
  max_requests integer
);

ALTER TABLE public.chat_user_metrics ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_admins (
  email text NOT NULL
);

ALTER TABLE public.event_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_budget_items (
  id uuid NOT NULL,
  event_id uuid,
  concepto text NOT NULL,
  monto numeric NOT NULL,
  created_at timestamp with time zone
);

ALTER TABLE public.event_budget_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_shifts (
  id uuid NOT NULL,
  event_id uuid NOT NULL,
  name text NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  date date,
  max_capacity integer,
  created_at timestamp with time zone
);

ALTER TABLE public.event_shifts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_stats (
  id uuid,
  name text,
  slug text,
  type text,
  date date,
  time time without time zone,
  location text,
  status text,
  max_capacity integer,
  created_at timestamp with time zone,
  total_registered bigint,
  total_attended bigint,
  total_preregistro bigint,
  total_confirmado bigint,
  total_ausente bigint,
  attendance_rate numeric,
  spots_remaining bigint
);

ALTER TABLE public.event_stats ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.events (
  id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  type text,
  description text,
  date date NOT NULL,
  time time without time zone,
  location text,
  banner_url text,
  max_capacity integer,
  registration_deadline date,
  status text,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  budget numeric,
  public_form boolean,
  end_time time without time zone,
  pauses jsonb,
  location_link text,
  extra_times jsonb
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.producto_analytics (
  id bigint NOT NULL,
  user_email text NOT NULL,
  sku text NOT NULL,
  modelo text,
  marca text,
  action text NOT NULL,
  created_at timestamp with time zone
);

ALTER TABLE public.producto_analytics ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.productos_ai_data (
  sku text NOT NULL,
  sales_pitch text,
  created_at timestamp with time zone,
  embedding vector,
  embedding_backup vector
);

ALTER TABLE public.productos_ai_data ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone,
  telefono text,
  email text,
  role text,
  expo_push_token text
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid NOT NULL,
  short_id text NOT NULL,
  event_id uuid NOT NULL,
  first_name text NOT NULL,
  email text NOT NULL,
  phone text,
  company text,
  status text
);

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen ai_knowledge" ON public.ai_company_knowledge
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Usuarios autenticados pueden ver catálogos" ON public.catalogos
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Usuario lee solo su propio chat_metrics" ON public.chat_user_metrics
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id)
;

CREATE POLICY "insert_own_analytics" ON public.producto_analytics
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (user_email = (auth.jwt() ->> 'email'))
;

CREATE POLICY "select_analytics" ON public.producto_analytics
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Lectura publica eventos" ON public.events
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true)
;

CREATE POLICY "Lectura publica inscripciones" ON public.registrations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true)
;

CREATE POLICY "Insercion publica inscripciones" ON public.registrations
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (true)
;

CREATE POLICY "Users can insert their own profile" ON public.profiles
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid() = id))
;

CREATE POLICY "Autenticados pueden leer AI" ON public.productos_ai_data
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Autenticados pueden gestionar admins" ON public.event_admins
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "Autenticados leen turnos" ON public.event_shifts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Autenticados insertan turnos" ON public.event_shifts
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (true)
;

CREATE POLICY "Autenticados actualizan turnos" ON public.event_shifts
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (true)
;

CREATE POLICY "Autenticados borran turnos" ON public.event_shifts
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (true)
;

CREATE POLICY "Autenticados gestionan presupuestos" ON public.event_budget_items
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "Solo lectura productos_ai_data" ON public.productos_ai_data
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Solo lectura events" ON public.events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Solo lectura event_admins" ON public.event_admins
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Autenticados ven perfiles" ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Dueño edita su perfil" ON public.profiles
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id))
;

CREATE POLICY "Allow authenticated users" ON public.event_budget_items
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "Staff can read registrations" ON public.registrations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Staff can update registrations" ON public.registrations
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (true)
;

CREATE POLICY "Admin can delete registrations" ON public.registrations
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (true)
;

CREATE POLICY "Staff manage events" ON public.events
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
;

CREATE POLICY "Admin manage versions" ON public.version_apk
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
;

CREATE POLICY "Only staff sees admins" ON public.event_admins
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Profiles are readable by staff" ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true)
;

CREATE POLICY "Users update only own profile" ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = id))
;

CREATE POLICY "Autenticados actualizan inscripciones" ON public.registrations
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (true)
;

CREATE POLICY "Autenticados borran inscripciones" ON public.registrations
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (true)
;

CREATE POLICY "Autenticados gestionan eventos" ON public.events
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "Lectura publica version" ON public.version_apk
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true)
;

CREATE POLICY "Autenticados gestionan version" ON public.version_apk
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true)
;

