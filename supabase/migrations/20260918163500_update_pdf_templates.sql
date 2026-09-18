-- Actualizar la plantilla del Reporte General (sin grafica, optimizada para ocupar el ancho completo y 1 sola hoja)
UPDATE public.pdf_templates 
SET 
  html = $$<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        @page { size: A4 portrait; margin: 6mm; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background: white; padding: 0; }
        .a4-page { width: 100%; height: 100%; padding: 10px 15px; display: flex; flex-direction: column; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0D8A39; padding-bottom: 6px; margin-bottom: 15px; }
        .header-title { font-size: 20px; font-weight: 800; color: #1A2530; margin-bottom: 2px; }
        .header-subtitle { font-size: 12px; font-weight: 600; color: #6B778C; }
        .logo { display: flex; align-items: center; justify-content: flex-end; }
        .logo img { max-height: 40px; max-width: 140px; object-fit: contain; }
        .kpi-row { display: flex; gap: 15px; margin-bottom: 20px; }
        .kpi-card { flex: 1; background: #F4F6F8; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid #DFE1E6; }
        .kpi-title { font-size: 10px; font-weight: 700; color: #6B778C; text-transform: uppercase; margin-bottom: 6px; }
        .kpi-val { font-size: 26px; font-weight: 800; }
        .grid-2x2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; flex: 1; min-height: 0; }
        .list-card { background: #FFFFFF; border: 1px solid #DFE1E6; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; }
        .list-title { font-size: 12px; font-weight: 800; color: #1A2530; border-bottom: 1px solid #DFE1E6; padding-bottom: 6px; margin-bottom: 10px; text-transform: uppercase; }
        .list-items { display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .item { display: flex; align-items: center; gap: 8px; }
        .item-rank { font-size: 10px; font-weight: 800; color: #6B778C; width: 14px; text-align: center; }
        .item-img { width: 22px; height: 22px; border-radius: 4px; background: #E8ECF0; object-fit: contain; }
        .item-info { flex: 1; min-width: 0; }
        .item-name { font-size: 10px; font-weight: 700; color: #1A2530; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .progress-track { height: 4px; background: #E8ECF0; border-radius: 2px; }
        .progress-fill { height: 100%; border-radius: 2px; }
        .item-count { font-size: 11px; font-weight: 800; width: 35px; text-align: right; }
        .footer { margin-top: 15px; padding-top: 10px; border-top: 1px solid #DFE1E6; text-align: center; font-size: 9px; color: #6B778C; }
    </style>
</head>
<body>
    <div class="a4-page">
        <div class="header">
            <div>
                <div class="header-title">{{reportTitle}}</div>
                <div class="header-subtitle">{{periodLabel}}</div>
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
        <div class="footer">
            {{footerText}}
        </div>
    </div>
</body>
</html>$$, 
  version = '2.0',
  updated_at = NOW()
WHERE id_template = 'stats_report';

-- Insertar o actualizar la plantilla para el Reporte de Usuarios
INSERT INTO public.pdf_templates (id_template, html, version, created_at, updated_at)
VALUES (
  'user_grid_report', 
  $$<!DOCTYPE html>
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
</html>$$, 
  '1.0', 
  NOW(), 
  NOW()
)
ON CONFLICT (id_template) 
DO UPDATE SET 
  html = EXCLUDED.html, 
  version = EXCLUDED.version, 
  updated_at = EXCLUDED.updated_at;
