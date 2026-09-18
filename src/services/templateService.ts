import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const CACHE_PREFIX = '@pdf_template_cache_v1_';

export type TemplateId = 'stats_report' | 'product_sheet' | 'user_grid_report';

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
  user_grid_report: {
    version: '1.0',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #FAFBFC; color: #1A2530; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0D8A39; padding-bottom: 15px; margin-bottom: 25px; }
    .title-box h1 { margin: 0; font-size: 26px; color: #1A2530; font-weight: 800; letter-spacing: -0.5px; }
    .title-box p { margin: 6px 0 0 0; font-size: 13px; color: #6B778C; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .logo { max-height: 40px; object-fit: contain; }
    .cards-container { display: flex; flex-direction: column; gap: 24px; }
    .card { background: #FFFFFF; border: 1px solid #DFE1E6; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(9, 30, 66, 0.05); page-break-inside: avoid; }
    .card-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; border-bottom: 1px solid #F4F5F7; padding-bottom: 16px; position: relative; }
    .avatar { width: 44px; height: 44px; border-radius: 22px; background: #0D8A39; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; }
    .user-info { flex: 1; min-width: 0; }
    .card-name { font-size: 18px; font-weight: 800; color: #172B4D; margin-bottom: 3px; }
    .card-email { font-size: 13px; color: #6B778C; }
    .peak-badge { display: flex; align-items: center; gap: 6px; background: #FFF9E6; border: 1px solid #FFE380; color: #42526E; font-size: 12px; padding: 6px 12px; border-radius: 20px; position: absolute; right: 0; top: 0; }
    .kpi-container { display: flex; gap: 16px; margin-bottom: 20px; }
    .kpi-box { flex: 1; padding: 14px 10px; border-radius: 10px; text-align: center; }
    .kpi-box.views { background: #E6F4FB; border: 1px solid #B3DDF2; }
    .kpi-box.shares { background: #E8F5E9; border: 1px solid #C8E6C9; }
    .kpi-box.details { background: #F4F5F7; border: 1px solid #DFE1E6; }
    .kpi-val { font-size: 24px; font-weight: 800; color: #172B4D; margin-bottom: 4px; }
    .kpi-label { font-size: 11px; font-weight: 700; color: #5E6C84; text-transform: uppercase; letter-spacing: 0.5px; }
    .lists-container { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .list-section { background: #FAFBFC; border-radius: 8px; padding: 16px; border: 1px solid #F4F5F7; }
    .list-title { font-size: 12px; font-weight: 700; color: #42526E; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #DFE1E6; padding-bottom: 8px; }
    .list-item { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .list-item:last-child { margin-bottom: 0; }
    .rank { font-size: 12px; font-weight: 800; color: #97A0AF; width: 14px; }
    .item-img, .brand-img { width: 28px; height: 28px; border-radius: 4px; background: #FFF; border: 1px solid #DFE1E6; object-fit: contain; }
    .brand-img { object-fit: contain; padding: 2px; }
    .item-text { flex: 1; min-width: 0; }
    .item-name { font-size: 12px; font-weight: 700; color: #172B4D; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .item-sub { font-size: 10px; color: #6B778C; margin-top: 2px; text-transform: uppercase; }
    .item-count-box { font-size: 12px; font-weight: 700; color: #007DB8; background: #E6F4FB; padding: 4px 8px; border-radius: 12px; }
    .empty-state { font-size: 12px; color: #8A94A5; font-style: italic; text-align: center; padding: 10px 0; }
    .footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #DFE1E6; font-size: 11px; color: #8A94A5; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-box">
      <h1>{{reportTitle}}</h1>
      <p>Periodo: {{periodLabel}}</p>
    </div>
    <img class="logo" src="{{logoUrl}}" onerror="this.style.display='none'" />
  </div>
  <div class="cards-container">
    {{cardsHtml}}
  </div>
  <div class="footer">
    {{footerText}}
  </div>
</body>
</html>`
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
  user_grid_report: [
    '{{reportTitle}}', '{{periodLabel}}', '{{logoUrl}}', '{{cardsHtml}}', '{{footerText}}'
  ]
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
