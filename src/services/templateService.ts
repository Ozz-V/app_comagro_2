import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const CACHE_PREFIX = '@pdf_template_cache_v1_';

export type TemplateId = 'stats_report' | 'product_sheet';

export interface PdfTemplate {
  version: string;
  html: string;
}

/**
 * Templates por defecto, incorporados a la app (bundle). Se usan si:
 *  - no hay conexiÃ³n,
 *  - todavÃ­a no se cacheÃ³ ninguna versiÃ³n remota,
 *  - o la fila remota vino invÃ¡lida (ver isValidTemplate).
 * Mantenerlos siempre como una versiÃ³n funcional conocida â€” es la red de
 * seguridad para que un template remoto roto nunca tumbe la generaciÃ³n de PDF.
 */
export const DEFAULT_TEMPLATES: Record<TemplateId, PdfTemplate> = {
  product_sheet: {
    version: '1.0',
    html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=794, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    @page { margin: 0; size: A4 portrait; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; color: #1a1a1a; background: #fff; margin: 0; }
    .page { width: 794px; height: 1123px; display: flex; flex-direction: column; overflow: hidden; position: relative; }
    .hdr { display: flex; align-items: center; justify-content: space-between; padding: 14px 26px 0 26px; flex-shrink: 0; gap: 16px; }
    .hdr-logo { height: 96px; display: flex; align-items: center; flex-shrink: 0; }
    .hdr-logo img { max-height: 96px; max-width: 320px; object-fit: contain; }
    .hdr-text { text-align: right; min-width: 0; }
    .hdr-name { font-size: 15pt; font-weight: bold; color: #0a2566; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.15; word-break: break-word; }
    .hdr-sku { font-size: 9pt; color: #8492a6; letter-spacing: 1.5px; margin-top: 4px; }
    .green-line { height: 5px; background: linear-gradient(90deg, #0d8a39, #09c24f); margin: 10px 26px 0 26px; flex-shrink: 0; }
    .top-block { display: flex; flex-direction: row; margin: 12px 26px 0 26px; height: {{topBlockH}}px; gap: 12px; flex-shrink: 0; }
    .img-col { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; }
    .img-box { width: 100%; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; align-content: center; }
    .prod-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .img-grid-item { flex: 1 1 {{imgGridBasis}}; min-width: 0; height: {{imgGridHeight}}; display: flex; align-items: center; justify-content: center; }
    .img-grid-item img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .curve-col { flex: 1; display: flex; flex-direction: column; padding: 10px; }
    .curve-title { font-size: 10pt; font-weight: bold; color: #0a2566; text-align: center; margin-bottom: 6px; }
    .curve-wrapper { flex: 1; position: relative; }
    .curve-disclaimer { font-size: 6pt; color: #8492a6; text-align: center; margin-top: 4px; line-height: 1.1; }
    .specs-block { margin: 12px 26px 0 26px; flex-shrink: 0; }
    .stitle { background: #0a2566; color: #fff; font-size: 9pt; font-weight: bold; letter-spacing: 1px; padding: 6px 14px; border-radius: 6px 6px 0 0; }
    .stbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { vertical-align: middle; word-break: break-word; overflow-wrap: break-word; line-height: 1.25; }
    .sn  { padding: {{specPad}} 8px {{specPad}} 12px; font-size: {{specFs}}; font-weight: bold; color: #0a2566; text-transform: uppercase; border-bottom: 1px solid #e4eaf4; }
    .sv  { padding: {{specPad}} 12px {{specPad}} 6px; font-size: {{specFs}}; color: #2d3748; border-bottom: 1px solid #e4eaf4; }
    .sep { border-left: 2px solid #dce4f0; }
    .footer { position: absolute; bottom: 0; left: 0; right: 0; height: 34px; background: #0a2566; display: flex; align-items: center; padding: 0 26px; gap: 10px; }
    .ft { color: rgba(255,255,255,0.6); font-size: 7pt; }
    .fd { color: rgba(255,255,255,0.22); font-size: 9pt; }
  </style>
</head>
<body>
  <div class="page">
    <div class="hdr">
      <div class="hdr-logo"><img src="{{logoBase64}}" onerror="this.style.display='none'" /></div>
      <div class="hdr-text">
        <div class="hdr-name">{{hdrName}}</div>
        <div class="hdr-sku">SKU: {{sku}}</div>
      </div>
    </div>
    <div class="green-line"></div>
    <div class="top-block">
      <div class="img-col">
        <div class="img-box">
          {{imgGridItemsHtml}}
        </div>
      </div>
      {{curveColHtml}}
    </div>
    <div class="specs-block">{{specsBlockHtml}}</div>
    <div class="footer">
      <span class="ft">{{footerMarca}}</span>
      <span class="fd">&#xB7;</span>
      <span class="ft">{{footerModelo}}</span>
      <span class="fd">&#xB7;</span>
      <span class="ft">{{footerSubcat}}</span>
    </div>
  </div>
  <script>
    (function(){
      var imgs = document.querySelectorAll('.prod-img');
      imgs.forEach(function(imgEl) {
        var img = new Image();
        img.onload = function() {
          try {
            var tmp = document.createElement('canvas');
            var w = img.width, h = img.height;
            tmp.width = w; tmp.height = h;
            var ctx = tmp.getContext('2d');
            ctx.drawImage(img, 0, 0);
            var idata = ctx.getImageData(0,0,w,h);
            var d = idata.data;
            var top = h, bottom = 0, left = w, right = 0;
            for (var y = 0; y < h; y++) {
              for (var x = 0; x < w; x++) {
                var i4 = (y * w + x) * 4;
                if (d[i4+3] > 10 && !(d[i4] >= 245 && d[i4+1] >= 245 && d[i4+2] >= 245)) {
                  if (x < left) left = x;  if (x > right) right = x;
                  if (y < top)  top  = y;  if (y > bottom) bottom = y;
                }
              }
            }
            if (right < left || bottom < top) return;
            var p = 8;
            left = Math.max(0, left-p); top = Math.max(0, top-p);
            right = Math.min(w-1, right+p); bottom = Math.min(h-1, bottom+p);
            var cw = right-left+1, ch = bottom-top+1;
            var out = document.createElement('canvas');
            out.width = cw; out.height = ch;
            out.getContext('2d').drawImage(tmp, left, top, cw, ch, 0, 0, cw, ch);
            imgEl.src = out.toDataURL('image/png');
          } catch(e) {}
        };
        img.src = imgEl.src;
      });
    })();
  </script>
</body>
</html>`,
  },
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
  product_sheet: [
    '{{logoBase64}}', '{{hdrName}}', '{{sku}}', '{{topBlockH}}',
    '{{imgGridItemsHtml}}', '{{imgGridBasis}}', '{{imgGridHeight}}', '{{curveColHtml}}',
    '{{specPad}}', '{{specFs}}', '{{specsBlockHtml}}',
    '{{footerMarca}}', '{{footerModelo}}', '{{footerSubcat}}',
  ],
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
      console.warn(`Template remoto "${id}" invÃ¡lido (faltan placeholders requeridos), se ignora`);
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
 * Reemplazo simple {{clave}} -> valor. A propÃ³sito no soporta condicionales
 * ni loops: esas decisiones (quÃ© card mostrar, cuÃ¡ntos Ã­tems, etc.) se
 * resuelven en JS y se pasan ya armadas como HTML dentro de una sola clave
 * (ej. "listsGridHtml"). Mantiene el motor de templates trivial de auditar.
 */
export function renderTemplate(html: string, data: Record<string, string>): string {
  return Object.entries(data).reduce(
    (out, [key, val]) => out.split(`{{${key}}}`).join(val ?? ''),
    html,
  );
}
