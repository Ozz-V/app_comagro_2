-- ============================================================================
-- pdf_templates
-- Guarda el HTML "editable" de cada documento que la app genera como PDF/imagen.
-- La app lee esta tabla en segundo plano (offline-first: usa su copia cacheada
-- o la que trae incorporada de fábrica si no hay fila o no hay internet).
--
-- IMPORTANTE: la lógica de layout adaptativo (tamaño de fuente según cantidad
-- de specs, columnas, si corresponde mostrar la curva, etc.) NO vive acá.
-- Esta tabla solo tiene el "esqueleto" visual con placeholders tipo
-- {{nombre_variable}} que la app completa antes de imprimir. Cambiar colores,
-- textos fijos, orden de bloques o el footer legal: sí. Cambiar qué datos se
-- calculan o cuándo se muestra la curva: eso sigue siendo código de la app.
-- ============================================================================

create table if not exists public.pdf_templates (
  id_template text primary key,        -- 'product_sheet' | 'curve_chart' | 'stats_report'
  html text not null,
  version text not null default '1.0',
  updated_by text,                     -- email/usuario que hizo el último cambio (informativo)
  updated_at timestamptz not null default now()
);

comment on table public.pdf_templates is
  'Templates HTML editables de los PDFs/imágenes que genera la app. Ver comentario de cabecera de este archivo.';

-- Mantiene updated_at al día en cada UPDATE, sin depender de que quien edite
-- la fila se acuerde de setearlo a mano.
create or replace function public.set_pdf_template_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pdf_templates_updated_at on public.pdf_templates;
create trigger trg_pdf_templates_updated_at
  before update on public.pdf_templates
  for each row
  execute function public.set_pdf_template_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Lectura pública (la app la lee sin login especial, igual que
-- calculadora_config). Sin políticas de insert/update/delete para
-- anon/authenticated: la edición de templates es solo desde el panel admin
-- o directamente en Supabase con el service_role, nunca desde la app.
alter table public.pdf_templates enable row level security;

drop policy if exists pdf_templates_read_all on public.pdf_templates;
create policy pdf_templates_read_all
  on public.pdf_templates
  for select
  using (true);

-- ── Filas ───────────────────────────────────────────────────────────────
-- A propósito NO se insertan filas todavía. Mientras la tabla esté vacía,
-- la app sigue usando su HTML incorporado de fábrica (DEFAULT_TEMPLATES en
-- src/services/templateService.ts) sin ningún cambio de comportamiento.
--
-- Cuando 'product_sheet' y 'stats_report' estén migrados a placeholders
-- (ver templateService.ts), se suben con algo así:
--
-- insert into public.pdf_templates (id_template, html, version) values
--   ('product_sheet', $tpl$ ...html con {{placeholders}}... $tpl$, '1.0'),
--   ('curve_chart',   $tpl$ ...html con {{placeholders}}... $tpl$, '1.0'),
--   ('stats_report',  $tpl$ ...html con {{placeholders}}... $tpl$, '1.0')
-- on conflict (id_template) do update
--   set html = excluded.html, version = excluded.version;
