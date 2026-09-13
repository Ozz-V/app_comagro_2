import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const CACHE_PREFIX = '@pdf_template_cache_v1_';

export type TemplateId = 'stats_report';

export interface PdfTemplate {
  version: string;
  html: string;
}

/**
 * Templates por defecto, incorporados a la app (bundle). Se usan si:
 *  - no hay conexión,
 *  - todavía no se cacheó ninguna versión remota,
 *  - o la fila remota vino inválida (ver isValidTemplate).
 * Mantenerlos siempre como una versión funcional conocida — es la red de
 * seguridad para que un template remoto roto nunca tumbe la generación de PDF.
 */
export const DEFAULT_TEMPLATES: Record<TemplateId, PdfTemplate> = {
  stats_report: {
    version: '1.0',
    html: `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        @page { size: A4 portrait; margin: 6mm; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background: white; padding: 0; }
        .a4-page { width: 100%; height: 100%; padding: 10px 15px; display: flex; flex-direction: column; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0D8A39; padding-bottom: 6px; margin-bottom: 10px; }
        .header-title { font-size: 18px; font-weight: 800; color: #1A2530; margin-bottom: 2px; }
        .header-subtitle { font-size: 11px; font-weight: 600; color: #6B778C; }
        .logo { display: flex; align-items: center; justify-content: flex-end; }
        .logo img { max-height: 36px; max-width: 140px; object-fit: contain; }
        .kpi-row { display: flex; gap: 10px; margin-bottom: 10px; }
        .kpi-card { flex: 1; background: #F4F6F8; border-radius: 6px; padding: 8px; text-align: center; border: 1px solid #DFE1E6; }
        .kpi-title { font-size: 9px; font-weight: 600; color: #6B778C; text-transform: uppercase; margin-bottom: 4px; }
        .kpi-val { font-size: 22px; font-weight: 800; }
        .chart-box { background: #F4F6F8; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; border: 1px solid #DFE1E6; }
        .chart-header { font-size: 10px; font-weight: 700; color: #1A2530; text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between; }
        .chart-svg { width: 100%; height: auto; max-height: 120px; margin: 4px 0; }
        .chart-labels { display: flex; justify-content: space-between; margin-top: 4px; }
        .chart-label { font-size: 8px; font-weight: 700; color: #1A2530; }
        .chart-sublabel { font-size: 7px; color: #6B778C; }
        .chart-label-center { text-align: center; }
        .chart-label-right { text-align: right; }
        .grid-2x2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; flex: 1; min-height: 0; }
        .list-card { background: #FFFFFF; border: 1px solid #DFE1E6; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; }
        .list-title { font-size: 11px; font-weight: 700; color: #1A2530; border-bottom: 1px solid #DFE1E6; padding-bottom: 4px; margin-bottom: 6px; text-transform: uppercase; }
        .list-items { display: flex; flex-direction: column; gap: 4px; flex: 1; }
        .item { display: flex; align-items: center; gap: 6px; }
        .item-rank { font-size: 9px; font-weight: 700; color: #6B778C; width: 10px; text-align: center; }
        .item-img { width: 18px; height: 18px; border-radius: 3px; background: #E8ECF0; object-fit: contain; }
        .item-info { flex: 1; min-width: 0; }
        .item-name { font-size: 9px; font-weight: 600; color: #1A2530; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .progress-track { height: 3px; background: #E8ECF0; border-radius: 1.5px; }
        .progress-fill { height: 100%; border-radius: 1.5px; }
        .item-count { font-size: 10px; font-weight: 800; width: 30px; text-align: right; }
        .footer { margin-top: 8px; padding-top: 6px; border-top: 1px solid #DFE1E6; text-align: center; font-size: 8px; color: #6B778C; }
    </style>
</head>
<body>
    <div class="a4-page">
        <div class="header">
            <div>
                <div class="header-title">{{reportTitle}}</div>
                <div class="header-subtitle">Vista General | {{periodLabel}}</div>
            </div>
            <div class="logo"><img src="{{logoUrl}}" onerror="this.style.display='none'" /></div>
        </div>
        <div class="kpi-row">
            <div class="kpi-card"><div class="kpi-title">Vistas Totales</div><div class="kpi-val" style="color: #007db8;">{{viewsTotal}}</div></div>
            <div class="kpi-card"><div class="kpi-title">Compartidos</div><div class="kpi-val" style="color: #0D8A39;">{{sharesTotal}}</div></div>
            {{usersKpiCardHtml}}
        </div>
        <div class="chart-box">
          <div class="chart-header">
            <span>Historial de Uso</span>
            <span style="color:#007db8;">{{viewsTotal}} vistas totales</span>
          </div>
          <svg class="chart-svg" viewBox="-12 -16 324 82">
            <defs>
              <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#007DB8" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="#007DB8" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <line x1="0" y1="12" x2="300" y2="12" stroke="#E8ECF0" stroke-width="1" stroke-dasharray="3,3"/>
            <line x1="0" y1="32" x2="300" y2="32" stroke="#E8ECF0" stroke-width="1" stroke-dasharray="3,3"/>
            <path d="M0,52 L0,35 Q40,15 80,25 T160,10 T240,22 T300,14 L300,52 Z" fill="url(#cg)"/>
            <path d="M0,35 Q40,15 80,25 T160,10 T240,22 T300,14" fill="none" stroke="#007DB8" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="0" cy="35" r="4" fill="#ffffff" stroke="#007DB8" stroke-width="2"/>
            <circle cx="160" cy="10" r="4" fill="#ffffff" stroke="#007DB8" stroke-width="2"/>
            <circle cx="300" cy="14" r="4" fill="#ffffff" stroke="#007DB8" stroke-width="2"/>
          </svg>
          <div class="chart-labels">
            <div>
              <div class="chart-label">{{chartStartValue}} vistas</div>
              <div class="chart-sublabel">{{periodLabelShort}}</div>
            </div>
            <div class="chart-label-center">
              <div class="chart-label">Pico: {{chartPeakValue}} vistas</div>
              <div class="chart-sublabel">{{chartPeakLabel}}</div>
            </div>
            <div class="chart-label-right">
              <div class="chart-label">{{chartTodayValue}} vistas</div>
              <div class="chart-sublabel">Hoy</div>
            </div>
          </div>
        </div>
        <div class="grid-2x2">
            {{listsGridHtml}}
        </div>
        <div class="footer">{{footerText}}</div>
    </div>
</body>
</html>`,
  },
};

const REQUIRED_PLACEHOLDERS: Record<TemplateId, string[]> = {
  stats_report: [
    '{{reportTitle}}', '{{periodLabel}}', '{{logoUrl}}', '{{viewsTotal}}',
    '{{sharesTotal}}', '{{usersKpiCardHtml}}', '{{listsGridHtml}}', '{{footerText}}',
  ],
};

function isValidTemplate(id: TemplateId, html: string): boolean {
  return typeof html === 'string' && html.length > 0 && REQUIRED_PLACEHOLDERS[id].every(p => html.includes(p));
}

export async function fetchRemoteTemplate(id: TemplateId): Promise<PdfTemplate | null> {
  try {
    const { data, error } = await supabase
      .from('pdf_templates')
      .select('html, version')
      .eq('id_template', id)
      .single();

    if (error || !data) return null;

    if (!isValidTemplate(id, data.html)) {
      console.warn(`Template remoto "${id}" inválido (faltan placeholders requeridos), se ignora`);
      return null;
    }

    const tpl: PdfTemplate = { html: data.html, version: data.version };
    await AsyncStorage.setItem(CACHE_PREFIX + id, JSON.stringify(tpl));
    return tpl;
  } catch (err) {
    console.error(`Error inesperado fetchRemoteTemplate(${id}):`, err);
    return null;
  }
}

export async function getTemplate(id: TemplateId): Promise<PdfTemplate> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + id);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.warn(`Error leyendo cache de template "${id}":`, err);
  }
  return DEFAULT_TEMPLATES[id];
}

/**
 * Reemplazo simple {{clave}} -> valor. A propósito no soporta condicionales
 * ni loops: esas decisiones (qué card mostrar, cuántos ítems, etc.) se
 * resuelven en JS y se pasan ya armadas como HTML dentro de una sola clave
 * (ej. "listsGridHtml"). Mantiene el motor de templates trivial de auditar.
 */
export function renderTemplate(html: string, data: Record<string, string>): string {
  return Object.entries(data).reduce(
    (out, [key, val]) => out.split(`{{${key}}}`).join(val ?? ''),
    html,
  );
}
